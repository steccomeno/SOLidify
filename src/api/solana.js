import { Program, AnchorProvider } from '@project-serum/anchor';
import { PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY, LAMPORTS_PER_SOL, Keypair, ComputeBudgetProgram, Connection } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount, createTransferInstruction, createMintToInstruction, createInitializeMintInstruction } from '@solana/spl-token';
import BN from 'bn.js';
import saiIDL from '../idl/sai.json';
import tokenInfo from '../scripts/sai_token_info.json';
import { getActiveConnection, refreshConnection } from '../utils/walletUtils';

// Rate limiting and retry utilities
const RETRY_DELAY = 1000; // 1 second
const MAX_RETRIES = 3;
const BACKOFF_FACTOR = 1.5;

// Track recent transactions to prevent duplicates
const recentTransactions = new Set();
const TRANSACTION_CACHE_TTL = 30000; // 30 seconds

// Track in-progress transactions to prevent duplicate popups
const pendingTransactions = new Map();

// Check if transaction is already pending
function isTransactionPending(txId) {
    return pendingTransactions.has(txId);
}

// Mark transaction as pending
function markTransactionPending(txId, expiresInMs = 30000) {
    if (!pendingTransactions.has(txId)) {
        pendingTransactions.set(txId, {
            startTime: Date.now(),
            expiresAt: Date.now() + expiresInMs
        });
        
        // Auto-clear after expiration
        setTimeout(() => {
            pendingTransactions.delete(txId);
            console.log(`Transaction ${txId} removed from pending after timeout`);
        }, expiresInMs);
        
        return true;
    }
    return false;
}

// Clear transaction from pending
function clearPendingTransaction(txId) {
    if (pendingTransactions.has(txId)) {
        pendingTransactions.delete(txId);
        console.log(`Transaction ${txId} removed from pending`);
        return true;
    }
    return false;
}

function trackTransaction(txSignature) {
    if (txSignature) {
        console.log('Tracking transaction:', txSignature);
        recentTransactions.add(txSignature);
        
        // Auto-remove after TTL expires
        setTimeout(() => {
            recentTransactions.delete(txSignature);
            console.log('Removed transaction from tracking:', txSignature);
        }, TRANSACTION_CACHE_TTL);
    }
}

function isTransactionRecent(txSignature) {
    return txSignature && recentTransactions.has(txSignature);
}

// Simple exponential backoff function
async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry function with exponential backoff
async function retryWithBackoff(fn, retriesLeft = MAX_RETRIES, delay = RETRY_DELAY) {
  try {
    return await fn();
  } catch (error) {
    // If error is rate limit (429), wait and retry
    if (error.message?.includes('429') || 
        error.message?.includes('rate limit') || 
        error.message?.includes('Connection rate limits exceeded')) {
      console.log(`Rate limit hit, retrying in ${delay}ms. Retries left: ${retriesLeft}`);
      
      if (retriesLeft === 0) {
        console.error('Max retries reached, giving up');
        throw error;
      }
      
      await wait(delay);
      return retryWithBackoff(fn, retriesLeft - 1, delay * BACKOFF_FACTOR);
    }
    
    // For other errors, just throw
    throw error;
  }
}

// Constants
const PROGRAM_ID = new PublicKey('GY7XKMrF4VMLBou37oBieKzRM6YZJHnjnic5sorE4rRU');
const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const SAI_DECIMALS = 6; // Define SAI_DECIMALS constant
const WSOL_MINT = SOL_MINT; // Define WSOL_MINT for compatibility

// Add rate limiting for balance checks
let lastBalanceCheck = 0;
const BALANCE_CHECK_INTERVAL = 5000; // 5 seconds

// Get SAI_MINT from token info file
let SAI_MINT;
try {
    SAI_MINT = new PublicKey(tokenInfo.saiMint);
    console.log('SAI_MINT initialized from token info file:', SAI_MINT.toString());
} catch (error) {
    console.error('Error initializing SAI_MINT:', error);
    // Fallback to a known value if token info is invalid
    SAI_MINT = new PublicKey('GCbezKCTeHfYc6Z92sQ9ECW29XWDyo6WWmB1Dx74tisB');
    console.log('Using fallback SAI_MINT:', SAI_MINT.toString());
}

console.log('Token Info Loaded:', {
    programId: PROGRAM_ID.toString(),
    saiMint: SAI_MINT.toString(),
    adminAddress: tokenInfo.admin
});

// Update constants at the top
const INIT_RETRY_DELAY = 1000; // 1 second
const MAX_INIT_RETRIES = 3;

export class SolanaAPI {
    constructor(wallet, programIDStr) {
        this.programId = new PublicKey(programIDStr || PROGRAM_ID);
        this.wallet = wallet;
        this.provider = null;
        this.program = null;
        this.initialized = false;
        this.initializationInProgress = false;
        this.lastInitAttempt = 0;
        
        // Standardize SAI mint usage
        this.saiMint = SAI_MINT; // Use the global constant
        
        console.log('SolanaAPI constructed with:', {
            programId: this.programId.toString(),
            saiMint: this.saiMint.toString()
        });
    }

    async waitForWallet(maxWaitTime = 10000) {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWaitTime) {
            if (this.wallet?.publicKey) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return false;
    }

    async initialize(force = false) {
        try {
            // Prevent multiple simultaneous initialization attempts
            if (this.initializationInProgress) {
                console.log('Initialization already in progress, waiting...');
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.initialized;
            }

            // Check if we need to initialize
            if (this.initialized && !force) {
                return true;
            }

            this.initializationInProgress = true;
            console.log('Starting initialization sequence...');

            // Wait for wallet
            const hasWallet = await this.waitForWallet();
            if (!hasWallet) {
                throw new Error('Wallet not available after timeout');
            }

            // Ensure connection with retries
            let connection = null;
            for (let i = 0; i < MAX_INIT_RETRIES; i++) {
                try {
                    connection = await this.ensureConnection();
                    await connection.getVersion();
                    break;
                } catch (e) {
                    console.warn(`Connection attempt ${i + 1} failed:`, e);
                    if (i === MAX_INIT_RETRIES - 1) throw e;
                    await new Promise(resolve => setTimeout(resolve, INIT_RETRY_DELAY));
                }
            }

            // Create wallet adapter with proper Phantom support
            console.log('Creating wallet adapter...');
            const walletAdapter = {
                publicKey: this.wallet.publicKey,
                signTransaction: async (tx) => {
                    if (window.solana?.isPhantom) {
                        return await window.solana.signTransaction(tx);
                    }
                    return await this.wallet.signTransaction(tx);
                },
                signAllTransactions: async (txs) => {
                    if (window.solana?.isPhantom) {
                        return await window.solana.signAllTransactions(txs);
                    }
                    return await this.wallet.signAllTransactions(txs);
                }
            };

            // Create provider
            this.provider = new AnchorProvider(
                connection,
                walletAdapter,
                { preflightCommitment: 'confirmed' }
            );

            // Initialize program with retries
            for (let i = 0; i < MAX_INIT_RETRIES; i++) {
                try {
                    this.program = new Program(saiIDL, this.programId, this.provider);
                    // Verify program is working
                    await this.program.account.cdp.all();
                    break;
                } catch (e) {
                    console.warn(`Program initialization attempt ${i + 1} failed:`, e);
                    if (i === MAX_INIT_RETRIES - 1) throw e;
                    await new Promise(resolve => setTimeout(resolve, INIT_RETRY_DELAY));
                }
            }

            // Create SAI token account if needed
            try {
                await this.ensureSaiTokenAccount();
            } catch (e) {
                console.warn('SAI token account creation failed:', e);
                // Continue initialization
            }

            this.initialized = true;
            console.log('Initialization completed successfully');
            return true;
        } catch (error) {
            console.error('Initialization failed:', error);
            this.initialized = false;
            return false;
        } finally {
            this.initializationInProgress = false;
            this.lastInitAttempt = Date.now();
        }
    }

    async ensureSaiTokenAccount() {
        console.log('Ensuring SAI token account exists...');
        try {
            if (!this.wallet?.publicKey) {
                throw new Error('Wallet not connected');
            }

            // Get ATA address
            const ata = await getAssociatedTokenAddress(
                this.saiMint,
                this.wallet.publicKey
            );
            console.log('SAI token account address:', ata.toString());

            // Check if account exists
            try {
                const accountInfo = await this.connection.getAccountInfo(ata);
                if (accountInfo) {
                    console.log('SAI token account exists');
                    return true;
                }
            } catch (e) {
                console.log('Account check failed:', e);
            }

            console.log('Creating new SAI token account...');
            
            // Create account
            const transaction = new Transaction();
            
            // Add compute budget
            transaction.add(
                ComputeBudgetProgram.setComputeUnitLimit({
                    units: 400000
                })
            );

            // Add create instruction
            transaction.add(
                createAssociatedTokenAccountInstruction(
                    this.wallet.publicKey,
                    ata,
                    this.wallet.publicKey,
                    this.saiMint
                )
            );

            // Get fresh blockhash
            const { blockhash } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.wallet.publicKey;

            // Sign and send with retries
            let retries = 3;
            while (retries > 0) {
                try {
                    // Sign and send transaction
                    if (window.solana?.isPhantom) {
                        console.log('Using Phantom wallet for signing...');
                        const signed = await window.solana.signTransaction(transaction);
                        const signature = await this.connection.sendRawTransaction(
                            signed.serialize(),
                            { skipPreflight: true }
                        );
                        console.log('Transaction sent:', signature);
                        await this.connection.confirmTransaction(signature, 'confirmed');
                    } else {
                        console.log('Using generic wallet adapter...');
                        const signature = await this.wallet.sendTransaction(
                            transaction,
                            this.connection,
                            { skipPreflight: true }
                        );
                        console.log('Transaction sent:', signature);
                        await this.connection.confirmTransaction(signature, 'confirmed');
                    }

                    console.log('SAI token account created successfully');
                    return true;
                } catch (error) {
                    console.error(`Attempt ${4 - retries} failed:`, error);
                    if (error.message?.includes('0x1')) {
                        throw new Error('Insufficient SOL balance to create token account');
                    }
                    retries--;
                    if (retries === 0) throw error;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            return false;
        } catch (error) {
            console.error('Error in ensureSaiTokenAccount:', error);
            throw error;
        }
    }

    // Add a method to initialize or refresh the connection
    async ensureConnection() {
        try {
            // Get the current connection or create a new one
            if (!this.connection) {
                console.log('No connection exists, creating new connection');
                this.connection = await getActiveConnection();
            } else {
                // Test if the existing connection is still working
                try {
                    // Use a simple method to test connection
                    await this.connection.getVersion();
                    console.log('Existing connection is working');
                } catch (testError) {
                    console.error('Existing connection failed test, refreshing:', testError.message);
                    // If the connection test fails, refresh it
                    this.connection = await refreshConnection();
                }
            }
            
            if (!this.connection) {
                throw new Error('Failed to get active connection');
            }
            
            return this.connection;
        } catch (error) {
            console.error('Error ensuring connection:', error);
            
            // If we get here, both getActiveConnection and refreshConnection failed
            // Try one last fallback to the default RPC endpoint
            try {
                console.log('Attempting emergency fallback to default RPC endpoint');
                // Import Connection directly to avoid circular dependency
                const { Connection } = require('@solana/web3.js');
                this.connection = new Connection('https://api.devnet.solana.com', 'confirmed');
                return this.connection;
            } catch (fallbackError) {
                console.error('Emergency fallback failed:', fallbackError);
                throw error; // Throw the original error
            }
        }
    }

    // Add method to handle rate limit by refreshing connection and retrying
    async handlePossibleRateLimit(operation, params = [], maxRetries = 2) {
        let retries = 0;
        
        while (retries <= maxRetries) {
            try {
                // Ensure we have a connection before trying the operation
                await this.ensureConnection();
                
                // Try the operation
                return await operation(...params);
            } catch (error) {
                const isRateLimit = error.message?.includes('429') || 
                                  error.message?.includes('rate limit') || 
                                  error.message?.includes('Connection rate limits exceeded');
                
                if (isRateLimit && retries < maxRetries) {
                    console.log(`Rate limit detected (retry ${retries + 1}/${maxRetries}), refreshing connection...`);
                    await refreshConnection();
                    this.connection = await getActiveConnection();
                    retries++;
                    
                    // Add delay before retry
                    await wait(1000 * (retries + 1));
                } else {
                    // Not a rate limit or out of retries
                    throw error;
                }
            }
        }
    }

    async createCDP(collateralAmount, saiAmount) {
        try {
            console.log(`Creating CDP with ${collateralAmount} SOL collateral for ${saiAmount} SAI`);
            
            // Validate input
            if (isNaN(collateralAmount) || collateralAmount <= 0) {
                return {
                    success: false,
                    error: 'Collateral amount must be a positive number'
                };
            }
            
            if (isNaN(saiAmount) || saiAmount <= 0) {
                return {
                    success: false,
                    error: 'SAI amount must be a positive number'
                };
            }
            
            // Convert to raw units
            const collateralLamports = Math.floor(collateralAmount * LAMPORTS_PER_SOL);
            const saiRaw = Math.floor(saiAmount * Math.pow(10, SAI_DECIMALS));
            
            console.log(`Using ${collateralLamports} lamports and ${saiRaw} raw SAI units`);
            
            // Ensure the connection is active
            await this.ensureConnection();
            
            // Check if program is initialized
            if (!this.program) {
                console.log('Program not initialized, initializing now');
                await this.initialize();
                
                if (!this.program) {
                    return {
                        success: false,
                        error: 'Failed to initialize program. Please refresh and try again.'
                    };
                }
            }
            
            // Create a new CDP account with the program
            const cdpKeypair = new Keypair();
            
            // Get the user's SAI token account
            const ownerSai = await getAssociatedTokenAddress(
                new PublicKey(this.saiMint || SAI_MINT),
                this.wallet.publicKey
            );
            
            // Now create the CDP with a single transaction
            console.log('Creating CDP transaction...');
            
            try {
                // Find the program PDAs
                const [vault] = await PublicKey.findProgramAddress(
                    [Buffer.from("vault"), cdpKeypair.publicKey.toBuffer()],
                    this.program.programId
                );
                
                const [vaultAuthority] = await PublicKey.findProgramAddress(
                    [Buffer.from("vault_authority"), cdpKeypair.publicKey.toBuffer()],
                    this.program.programId
                );
                
                const [mintAuthority] = await PublicKey.findProgramAddress(
                    [Buffer.from("mint_authority")],
                    this.program.programId
                );
                
                // Build the CDP instruction
                const cdpTransaction = new Transaction();
                
                // Add compute budget instruction first
                cdpTransaction.add(
                    ComputeBudgetProgram.setComputeUnitLimit({
                        units: 1000000
                    })
                );
                
                // Check if SAI token account exists
                let saiAccountExists = false;
                try {
                    await getAccount(this.connection, ownerSai);
                    saiAccountExists = true;
                    console.log('SAI token account exists');
                } catch (error) {
                    console.log('SAI token account does not exist, will create it');
                }
                
                // Add SAI token account creation if needed
                if (!saiAccountExists) {
                    console.log('Adding instruction to create SAI token account');
                    cdpTransaction.add(
                        createAssociatedTokenAccountInstruction(
                            this.wallet.publicKey,
                            ownerSai,
                            this.wallet.publicKey,
                            new PublicKey(this.saiMint || SAI_MINT)
                        )
                    );
                }
                
                // Add instruction to create CDP account
                const createAccountInstruction = SystemProgram.createAccount({
                    fromPubkey: this.wallet.publicKey,
                    newAccountPubkey: cdpKeypair.publicKey,
                    lamports: await this.connection.getMinimumBalanceForRentExemption(200), // Size of CDP account
                    space: 200, // Enough space for CDP data
                    programId: this.program.programId,
                });
                
                cdpTransaction.add(createAccountInstruction);
                
                // Accounts for the initialize_cdp instruction
                const accounts = {
                    owner: this.wallet.publicKey,
                    cdp: cdpKeypair.publicKey,
                    ownerCollateral: this.wallet.publicKey, // Use wallet directly for SOL collateral
                    collateralMint: SOL_MINT,
                    vault: vault,
                    vaultAuthority: vaultAuthority,
                    saiMint: new PublicKey(this.saiMint || SAI_MINT),
                    ownerSai: ownerSai,
                    mintAuthority: mintAuthority,
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    rent: SYSVAR_RENT_PUBKEY,
                };
                
                // Add the initialization instruction
                const initInstruction = await this.program.methods
                    .initializeCdp(
                        new BN(collateralLamports),
                        new BN(saiRaw)
                    )
                    .accounts(accounts)
                    .instruction();
                
                cdpTransaction.add(initInstruction);
                
                // Setup transaction with blockhash
                const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('finalized');
                cdpTransaction.recentBlockhash = blockhash;
                cdpTransaction.feePayer = this.wallet.publicKey;
                
                console.log('CDP transaction prepared, sending...');
                console.log('Required signers:', {
                    wallet: this.wallet.publicKey.toString(),
                    cdp: cdpKeypair.publicKey.toString()
                });
                
                try {
                    // First sign with the CDP keypair
                    cdpTransaction.partialSign(cdpKeypair);
                    console.log('CDP keypair signature added');
                    
                    // Then get the wallet signature
                    const signedTx = await window.solana.signTransaction(cdpTransaction);
                    console.log('Wallet signature added');
                    
                    // Verify all required signatures are present
                    const requiredSigners = [this.wallet.publicKey, cdpKeypair.publicKey];
                    const missingSigners = requiredSigners.filter(pubkey => 
                        !signedTx.signatures.some(sig => sig.publicKey.equals(pubkey))
                    );
                    
                    if (missingSigners.length > 0) {
                        throw new Error(`Missing signatures for: ${missingSigners.map(p => p.toString()).join(', ')}`);
                    }
                    
                    // Send with skipPreflight to bypass simulation
                    const signature = await this.connection.sendRawTransaction(
                        signedTx.serialize(), 
                        { 
                            skipPreflight: true,
                            preflightCommitment: 'processed'
                        }
                    );
                    
                    console.log('CDP transaction sent with signature:', signature);
                    
                    // Confirm transaction with timeout
                    try {
                        const confirmationPromise = this.connection.confirmTransaction({
                            blockhash,
                            lastValidBlockHeight,
                            signature
                        });
                        
                        // Add timeout to prevent hanging
                        const timeoutPromise = new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Transaction confirmation timeout')), 30000)
                        );
                        
                        await Promise.race([confirmationPromise, timeoutPromise]);
                        console.log('CDP created successfully!');
                        
                        return {
                            success: true,
                            signature,
                            cdp: cdpKeypair.publicKey.toString()
                        };
                    } catch (confirmError) {
                        console.error('Error confirming transaction:', confirmError);
                        
                        // Check if the transaction was actually successful despite confirmation error
                        try {
                            const tx = await this.connection.getTransaction(signature, {
                                commitment: 'confirmed'
                            });
                            
                            if (tx?.meta?.err) {
                                console.error('Transaction failed:', tx.meta.err);
                                return {
                                    success: false,
                                    error: 'Transaction failed. Please try with smaller values.'
                                };
                            }
                            
                            return {
                                success: true,
                                signature,
                                cdp: cdpKeypair.publicKey.toString()
                            };
                        } catch (txError) {
                            console.error('Error checking transaction status:', txError);
                            return {
                                success: false,
                                error: 'Transaction may have failed. Please check your wallet for the status.'
                            };
                        }
                    }
                } catch (error) {
                    console.error('CDP transaction signing error:', error);
                    
                    return {
                        success: false,
                        error: 'Failed to sign CDP transaction. Please try again later.'
                    };
                }
            } catch (error) {
                console.error('CDP transaction creation error:', error);
                
                return {
                    success: false,
                    error: 'Failed to create CDP. Please try with smaller values (0.05 SOL and 0.2 SAI)'
                };
            }
        } catch (error) {
            console.error('CDP creation error:', error);
            return {
                success: false,
                error: `Failed to create CDP: ${error.message}`
            };
        }
    }

    async getTokenBalances() {
        try {
            // Rate limit balance checks
            const now = Date.now();
            if (now - lastBalanceCheck < BALANCE_CHECK_INTERVAL) {
                console.log('Skipping balance check due to rate limiting');
                return { sol: 0, sai: 0 };
            }
            lastBalanceCheck = now;

            if (!this.wallet || !this.wallet.publicKey) {
                console.warn('getTokenBalances: No wallet connected');
                return { sol: 0, sai: 0 };
            }

            // Ensure we have a working connection
            await this.ensureConnection();

            // Get SOL balance first
            const solBalance = await this.connection.getBalance(this.wallet.publicKey);
            const solAmount = solBalance / LAMPORTS_PER_SOL;
            console.log('SOL balance:', solAmount);

            // Get SAI balance
            try {
                // First ensure the token account exists
                console.log('Ensuring SAI token account exists...');
                await this.ensureSaiTokenAccount();
                
                // Wait for account creation/confirmation
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Get the token account address
                const saiTokenAccount = await getAssociatedTokenAddress(
                    this.saiMint,
                    this.wallet.publicKey
                );
                console.log('SAI token account address:', saiTokenAccount.toString());

                // Get the account info
                const tokenAccount = await getAccount(this.connection, saiTokenAccount);
                const saiAmount = Number(tokenAccount.amount) / Math.pow(10, SAI_DECIMALS);
                console.log('SAI balance found:', saiAmount);
                
                return {
                    sol: solAmount,
                    sai: saiAmount
                };
            } catch (e) {
                console.error('Error in SAI balance retrieval:', e);
                // Return just SOL balance if SAI fails
                return {
                    sol: solAmount,
                    sai: 0
                };
            }
        } catch (error) {
            console.error('Error in getTokenBalances:', error);
            return { sol: 0, sai: 0 };
        }
    }

    async getUserCDPs() {
        try {
            if (!this.wallet || !this.wallet.publicKey) {
                console.warn('getUserCDPs: No wallet connected');
                return [];
            }

            // Ensure we have a working connection and program
            await this.ensureConnection();
            if (!this.program) {
                const initialized = await this.initialize();
                if (!initialized || !this.program) {
                    console.error('Failed to initialize program');
                    return [];
                }
            }

            // Verify program has CDP account definition
            if (!this.program.account.cdp) {
                console.error('Program IDL missing CDP account definition');
                return [];
            }

            console.log('Querying CDP accounts for user:', this.wallet.publicKey.toString());
            
            // Find all CDP accounts owned by the user
            const cdpAccounts = await this.program.account.cdp.all([
                {
                    memcmp: {
                        offset: 32, // After discriminator (8) + owner (32)
                        bytes: this.wallet.publicKey.toBase58()
                    }
                }
            ]);

            console.log(`Found ${cdpAccounts.length} CDPs for user`);
            
            // Format CDP data with better error handling
            return cdpAccounts.map(account => {
                try {
                    const data = {
                        address: account.publicKey.toString(),
                        owner: account.account.owner.toString(),
                        collateralAmount: Number(account.account.collateralAmount) / LAMPORTS_PER_SOL,
                        saiDebt: Number(account.account.saiDebt) / Math.pow(10, SAI_DECIMALS),
                        status: account.account.status
                    };
                    console.log('CDP data:', data);
                    return data;
                } catch (error) {
                    console.error('Error formatting CDP data:', error);
                    return null;
                }
            }).filter(Boolean); // Remove any null entries from formatting errors
        } catch (error) {
            console.error('Error in getUserCDPs:', error);
            // Log more details about the error
            if (error.message) {
                console.error('Error message:', error.message);
            }
            if (error.stack) {
                console.error('Error stack:', error.stack);
            }
            return [];
        }
    }

    // Add method to refresh balances
    async refreshBalances() {
        try {
            const balances = await this.getTokenBalances();
            console.log('Balances refreshed:', balances);
            return balances;
        } catch (error) {
            console.error('Error refreshing balances:', error);
            return { sol: 0, sai: 0 };
        }
    }
}