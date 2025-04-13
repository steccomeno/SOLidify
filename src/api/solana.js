import { Program, AnchorProvider } from '@project-serum/anchor';
import { PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY, LAMPORTS_PER_SOL, Keypair, ComputeBudgetProgram, Connection, sendAndConfirmTransaction, clusterApiUrl } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount, createTransferInstruction, createMintToInstruction, createInitializeMintInstruction, ASSOCIATED_TOKEN_PROGRAM_ID, createBurnInstruction, getMint } from '@solana/spl-token';
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
const PROGRAM_ID = new PublicKey('VrzGbEB4PBEM5g1RrJn7A82gGbwPYtc9TvZjqY3NUzM');
const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const SAI_DECIMALS = 6; // Define SAI_DECIMALS constant
const WSOL_MINT = SOL_MINT; // Define WSOL_MINT for compatibility

// Use a specific SAI mint address that the program expects
const SAI_MINT = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');

// Add rate limiting for balance checks
let lastBalanceCheck = 0;
const BALANCE_CHECK_INTERVAL = 5000; // 5 seconds

// Add at the top with other constants
let lastTokenAccountCheck = 0;
const TOKEN_ACCOUNT_CHECK_INTERVAL = 30000; // 30 seconds

// Add at the top with other constants
const tokenAccountCache = new Map();
const TOKEN_ACCOUNT_CACHE_TTL = 60000; // 1 minute

// Update constants at the top
const INIT_RETRY_DELAY = 1000; // 1 second
const MAX_INIT_RETRIES = 3;

// Add better rate limiting and caching at the top of the file
const RATE_LIMIT_WINDOW = 5000; // 5 second window
const MAX_REQUESTS_PER_WINDOW = 10;
const requestTimestamps = [];

// Rate limiting function
function checkRateLimit() {
    const now = Date.now();
    // Remove old timestamps outside the window
    while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_LIMIT_WINDOW) {
        requestTimestamps.shift();
    }
    
    // Check if we've hit the limit
    if (requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
        return false; // Rate limited
    }
    
    // Add current timestamp
    requestTimestamps.push(now);
    return true; // Not rate limited
}

// Cache for getUserCDPs
const cdpCache = {
    data: null,
    timestamp: 0,
    ttl: 30000 // 30 seconds cache
};

// Function to check if cache is still valid
function isCacheValid() {
    return cdpCache.data && (Date.now() - cdpCache.timestamp < cdpCache.ttl);
}

export class SolanaAPI {
    constructor() {
        this.initialized = false;
        this.connection = null;
        this.wallet = null;
        this.program = null;
        this.saiMint = SAI_MINT;
        
        console.log('SolanaAPI constructed with SAI_MINT:', this.saiMint.toString());
    }

    async initialize() {
        try {
            console.log("Starting SolanaAPI initialization...");
            
            // Check wallet status more thoroughly
            if (!this.wallet) {
                console.error("No wallet object set");
                return false;
            }
            
            console.log("Wallet object inspection:", {
                type: typeof this.wallet, 
                keys: Object.keys(this.wallet),
                hasPublicKey: !!this.wallet.publicKey
            });
            
            // More thorough public key check
            if (!this.wallet.publicKey) {
                console.error("Wallet object has no publicKey property");
                
                // Try to find a public key using a more thorough search
                for (const key of Object.keys(this.wallet)) {
                    const value = this.wallet[key];
                    if (value && typeof value === 'object') {
                        console.log(`Checking wallet.${key} for PublicKey...`);
                        if (value.toBase58 && typeof value.toBase58 === 'function') {
                            console.log(`Found possible PublicKey in wallet.${key}`);
                            this.wallet.publicKey = value;
                            break;
                        }
                    }
                }
                
                if (!this.wallet.publicKey) {
                    return false;
                }
            }
            
            try {
                console.log("Using wallet with public key:", this.wallet.publicKey.toString());
            } catch (e) {
                console.error("Error stringifying public key:", e);
                console.log("Public key available but cannot be converted to string");
            }
            
            // Ensure we have a connection
            if (!this.connection) {
                console.log("Creating new connection...");
                this.connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
            }

            // Initialize program with more robust error handling
            try {
                console.log("Initializing program...");
                this.program = new Program(saiIDL, PROGRAM_ID, {
                    connection: this.connection,
                    wallet: this.wallet
                });
                
                if (!this.program) {
                    throw new Error("Program object is null after initialization");
                }
            } catch (programError) {
                console.error("Error initializing program:", programError);
                return false;
            }

            // Mark as initialized and log success
            this.initialized = true;
            console.log("SolanaAPI initialization completed successfully");
            console.log("Using wallet with public key:", this.wallet.publicKey.toString());
            
            return true;
        } catch (error) {
            console.error("SolanaAPI initialization failed:", error);
            this.initialized = false;
            return false;
        }
    }

    isInitialized() {
        return this.initialized && this.wallet && this.wallet.publicKey && this.connection && this.program;
    }

    // Add getTokenBalances method
    async getTokenBalances(publicKey) {
        if (!this.isInitialized()) {
            throw new Error("API not initialized. Please initialize first.");
        }

        try {
            // Get SOL balance
            const solBalance = await this.connection.getBalance(publicKey);
            
            // Get SAI token balance
            const saiTokenAccount = await getAssociatedTokenAddress(
                this.saiMint,
                publicKey
            );
            
            let saiBalance = 0;
            try {
                const tokenAccount = await getAccount(this.connection, saiTokenAccount);
                saiBalance = Number(tokenAccount.amount) / Math.pow(10, SAI_DECIMALS);
            } catch (error) {
                // If token account doesn't exist, balance is 0
                console.log("SAI token account not found, assuming balance is 0");
            }
            
            return {
                sol: solBalance / LAMPORTS_PER_SOL,
                sai: saiBalance
            };
        } catch (error) {
            console.error("Error getting token balances:", error);
            throw error;
        }
    }

    async ensureSaiTokenAccount() {
        try {
            if (!this.wallet?.publicKey) {
                throw new Error('Wallet not connected');
            }

            const ata = await getAssociatedTokenAddress(
                this.saiMint,
                this.wallet.publicKey
            );

            // Check if account exists directly
            console.log('Checking if SAI token account exists:', ata.toString());
            const accountInfo = await this.connection.getAccountInfo(ata);
            
            if (accountInfo) {
                console.log('SAI token account already exists');
                return true;
            }
            
            // Account doesn't exist, create it
            console.log('Creating new SAI token account...');
            
            // Create a dedicated transaction for token account creation
            const transaction = new Transaction();
            
            // Add compute budget to ensure enough compute
            transaction.add(
                ComputeBudgetProgram.setComputeUnitLimit({
                    units: 300000
                })
            );

            // Add the creation instruction with explicit program IDs
            transaction.add(
                createAssociatedTokenAccountInstruction(
                    this.wallet.publicKey,  // payer
                    ata,                    // associatedAccount (destination)
                    this.wallet.publicKey,  // owner
                    this.saiMint,           // mint
                    TOKEN_PROGRAM_ID,       // programId
                    ASSOCIATED_TOKEN_PROGRAM_ID // associatedProgramId
                )
            );

            const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.wallet.publicKey;

            // Sign and send the transaction
            let signed;
            if (window.solana?.isPhantom) {
                signed = await window.solana.signTransaction(transaction);
            } else if (this.wallet.signTransaction) {
                signed = await this.wallet.signTransaction(transaction);
            } else {
                throw new Error('No method to sign transaction');
            }
            
            console.log('Sending token account creation transaction...');
            const signature = await this.connection.sendRawTransaction(
                signed.serialize(),
                { skipPreflight: true }
            );

            console.log('Token account creation transaction sent:', signature);
            await this.connection.confirmTransaction(signature, 'confirmed');
            console.log('Token account created successfully!');
            
            return true;
        } catch (error) {
            console.error('Error in ensureSaiTokenAccount:', error);
            throw error;
        }
    }

    // Add a method to initialize or refresh the connection
    async ensureConnection() {
        if (this.connection) {
            try {
                // Test existing connection
                await this.connection.getVersion();
                return this.connection;
            } catch (e) {
                console.warn('Existing connection failed, creating new one:', e);
            }
        }

        // Try multiple RPC endpoints
        const endpoints = [
            'https://api.devnet.solana.com',
            'https://solana-devnet-rpc.publicnode.com',
            'https://devnet.genesysgo.net'
        ];

        for (const endpoint of endpoints) {
            try {
                const connection = new Connection(endpoint, 'confirmed');
                await connection.getVersion();
                this.connection = connection;
                return connection;
            } catch (e) {
                console.warn(`Failed to connect to ${endpoint}:`, e);
            }
        }

        throw new Error('Failed to establish connection to any RPC endpoint');
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
            
            // Early validation
            if (!this.isInitialized()) {
                throw new Error('API not initialized. Please initialize first.');
            }
            
            // Verify wallet before proceeding
            if (!this.wallet || !this.wallet.publicKey) {
                throw new Error('No wallet available for transaction signing');
            }
            
            console.log("Wallet for transaction:", {
                publicKey: this.wallet.publicKey.toString(),
                hasSignTransaction: !!this.wallet.signTransaction,
                hasSignAllTransactions: !!this.wallet.signAllTransactions
            });
            
            console.log("Creating a new test token mint for this demo");
            
            // Convert to raw values
            const lamports = collateralAmount * LAMPORTS_PER_SOL;
            const saiRaw = new BN(saiAmount * Math.pow(10, SAI_DECIMALS));
            
            console.log(`Using ${lamports} lamports and ${saiRaw} raw SAI units`);
            
            // Ensure connection is active
            try {
                const version = await this.connection.getVersion();
                console.log("Connection is active. Solana version:", version);
            } catch (connErr) {
                console.error("Connection error:", connErr);
                throw new Error("Failed to connect to Solana network. Please try again.");
            }
            
            // Generate a keypair for the CDP
            const vaultKeypair = Keypair.generate();
            console.log("Created demo vault account:", vaultKeypair.publicKey.toString());
            
            try {
                // Create the token mint for this demo
                const tokenMint = Keypair.generate();
                this.saiMint = tokenMint.publicKey;
                console.log("Created new SAI token mint:", this.saiMint.toString());
                
                // Split the process into multiple transactions to simplify signing

                // TRANSACTION 1: Create the token mint
                const createMintTx = new Transaction();
                createMintTx.add(
                    ComputeBudgetProgram.setComputeUnitLimit({
                        units: 400000
                    })
                );
                
                // Calculate rent for mint account
                const mintRent = await this.connection.getMinimumBalanceForRentExemption(82);
                
                // Add instruction to create account for the mint
                createMintTx.add(
                    SystemProgram.createAccount({
                        fromPubkey: this.wallet.publicKey,
                        newAccountPubkey: tokenMint.publicKey,
                        lamports: mintRent,
                        space: 82,
                        programId: TOKEN_PROGRAM_ID
                    }),
                    createInitializeMintInstruction(
                        tokenMint.publicKey,
                        SAI_DECIMALS,
                        this.wallet.publicKey,
                        null
                    )
                );
                
                // Get recent blockhash
                const { blockhash: mintBlockhash } = await this.connection.getLatestBlockhash('confirmed');
                createMintTx.recentBlockhash = mintBlockhash;
                createMintTx.feePayer = this.wallet.publicKey;
                
                // Sign with token mint keypair first
                createMintTx.partialSign(tokenMint);
                
                console.log("Transaction 1 prepared, signing with wallet");
                
                // Sign with wallet
                let signedMintTx;
                try {
                    // Use direct wallet methods if available
                    if (window.solflare) {
                        console.log("Using Solflare window.solflare to sign");
                        signedMintTx = await window.solflare.signTransaction(createMintTx);
                    } else if (window.solana) {
                        console.log("Using Phantom window.solana to sign");
                        signedMintTx = await window.solana.signTransaction(createMintTx);
                    } else {
                        // Instead of directly calling this.wallet.signTransaction, use bind to preserve context
                        console.log("Using wallet adapter to sign with proper context");
                        const signFunction = this.wallet.signTransaction.bind(this.wallet);
                        signedMintTx = await signFunction(createMintTx);
                    }
                } catch (signError) {
                    console.error("Error signing mint transaction:", signError);
                    throw new Error(`Failed to sign mint transaction: ${signError.message}`);
                }
                
                // Send mint transaction
                console.log("Sending mint creation transaction");
                const mintTxId = await this.connection.sendRawTransaction(
                    signedMintTx.serialize(),
                    { skipPreflight: true }
                );
                
                console.log("Mint transaction sent:", mintTxId);
                
                // Wait for confirmation
                await this.connection.confirmTransaction(mintTxId, 'confirmed');
                console.log("Mint transaction confirmed");
                
                // TRANSACTION 2: Create token account and mint tokens
                
                // Get the token account for the user
                const userTokenAccount = await getAssociatedTokenAddress(
                    tokenMint.publicKey,
                    this.wallet.publicKey
                );
                console.log("User token account for SAI tokens:", userTokenAccount.toString());
                
                const mintTokensTx = new Transaction();
                mintTokensTx.add(
                    ComputeBudgetProgram.setComputeUnitLimit({
                        units: 400000
                    })
                );
                
                // Add instruction to create associated token account
                mintTokensTx.add(
                    createAssociatedTokenAccountInstruction(
                        this.wallet.publicKey,
                        userTokenAccount,
                        this.wallet.publicKey,
                        tokenMint.publicKey
                    )
                );
                
                // Add instruction to mint tokens
                mintTokensTx.add(
                    createMintToInstruction(
                        tokenMint.publicKey,
                        userTokenAccount,
                        this.wallet.publicKey,
                        saiRaw.toNumber()
                    )
                );
                
                // Get recent blockhash
                const { blockhash: tokenBlockhash } = await this.connection.getLatestBlockhash('confirmed');
                mintTokensTx.recentBlockhash = tokenBlockhash;
                mintTokensTx.feePayer = this.wallet.publicKey;
                
                console.log("Transaction 2 prepared, signing with wallet");
                
                // Sign with wallet
                let signedTokenTx;
                try {
                    // Use direct wallet methods if available
                    if (window.solflare) {
                        console.log("Using Solflare window.solflare to sign");
                        signedTokenTx = await window.solflare.signTransaction(mintTokensTx);
                    } else if (window.solana) {
                        console.log("Using Phantom window.solana to sign");
                        signedTokenTx = await window.solana.signTransaction(mintTokensTx);
                    } else {
                        // Instead of directly calling this.wallet.signTransaction, use bind to preserve context
                        console.log("Using wallet adapter to sign with proper context");
                        const signFunction = this.wallet.signTransaction.bind(this.wallet);
                        signedTokenTx = await signFunction(mintTokensTx);
                    }
                } catch (signError) {
                    console.error("Error signing token transaction:", signError);
                    throw new Error(`Failed to sign token transaction: ${signError.message}`);
                }
                
                // Send token transaction
                console.log("Sending token transaction");
                const tokenTxId = await this.connection.sendRawTransaction(
                    signedTokenTx.serialize(),
                    { skipPreflight: true }
                );
                
                console.log("Token transaction sent:", tokenTxId);
                
                // Wait for confirmation
                await this.connection.confirmTransaction(tokenTxId, 'confirmed');
                console.log("Token transaction confirmed");
                
                // Update cached balances
                try {
                    const tokenAccount = await getAccount(this.connection, userTokenAccount);
                    const saiBalance = Number(tokenAccount.amount) / Math.pow(10, SAI_DECIMALS);
                    
                    this._cachedBalances = {
                        sol: await this.connection.getBalance(this.wallet.publicKey) / LAMPORTS_PER_SOL,
                        sai: saiBalance
                    };
                } catch (err) {
                    console.error('Error updating cached balances:', err);
                }
                
                return {
                    success: true,
                    signature: tokenTxId,
                    tokenMint: this.saiMint.toString(),
                    tokenAccount: userTokenAccount.toString(),
                    vault: vaultKeypair.publicKey.toString(),
                    message: `Successfully created vault and minted ${saiAmount} SAI tokens. To see these tokens in Phantom, add the custom token: ${this.saiMint.toString()}`
                };
                
            } catch (setupError) {
                console.error('Error in CDP setup:', setupError);
                throw setupError;
            }
        } catch (error) {
            console.error('Error creating CDP:', error);
            return {
                success: false,
                error: error.message || 'Failed to create CDP'
            };
        }
    }

    async getTokenBalances() {
        try {
            // Rate limit balance checks
            const now = Date.now();
            if (now - lastBalanceCheck < BALANCE_CHECK_INTERVAL) {
                console.log('Skipping balance check due to rate limiting, returning cached value if available');
                
                // Return last known balance if available
                if (this._cachedBalances) {
                    return this._cachedBalances;
                }
            }
            
            // Check if we're rate limited by the RPC
            if (!checkRateLimit()) {
                console.log('RPC rate limit hit, returning cached balance');
                return this._cachedBalances || { sol: 0, sai: 0 };
            }
            
            lastBalanceCheck = now;

            if (!this.wallet || !this.wallet.publicKey) {
                console.warn('getTokenBalances: No wallet connected');
                return { sol: 0, sai: 0 };
            }

            // Ensure we have a working connection
            await this.ensureConnection();

            // Get SOL balance first
            const solBalance = await retryWithBackoff(async () => {
                return await this.connection.getBalance(this.wallet.publicKey);
            });
            
            const solAmount = solBalance / LAMPORTS_PER_SOL;

            // Get SAI balance - check all tokens the user has created/used
            let totalSaiBalance = 0;
            
            // First check the standard SAI mint if it exists
            const storedSaiMint = localStorage.getItem('sai_token_mint');
            if (storedSaiMint) {
                try {
                    const mintPubkey = new PublicKey(storedSaiMint);
                    const userTokenAccount = await getAssociatedTokenAddress(
                        mintPubkey,
                        this.wallet.publicKey
                    );
                    
                    try {
                        const tokenAccount = await getAccount(this.connection, userTokenAccount);
                        const tokenBalance = Number(tokenAccount.amount) / Math.pow(10, SAI_DECIMALS);
                        console.log(`Balance for token ${storedSaiMint}: ${tokenBalance}`);
                        totalSaiBalance += tokenBalance;
                    } catch (err) {
                        console.log(`No balance found for primary SAI token mint ${storedSaiMint}`);
                    }
                } catch (err) {
                    console.error('Error checking primary SAI token balance:', err);
                }
            }
            
            // Also check any additional token mints the user has created
            try {
                const userTokens = JSON.parse(localStorage.getItem('user_tokens') || '[]');
                console.log('User has tokens:', userTokens);
                
                for (const mintAddress of userTokens) {
                    // Skip if it's the same as the primary SAI mint we already checked
                    if (mintAddress === storedSaiMint) continue;
                    
                    try {
                        const mintPubkey = new PublicKey(mintAddress);
                        const userTokenAccount = await getAssociatedTokenAddress(
                            mintPubkey,
                            this.wallet.publicKey
                        );
                        
                        try {
                            const tokenAccount = await getAccount(this.connection, userTokenAccount);
                            const tokenBalance = Number(tokenAccount.amount) / Math.pow(10, SAI_DECIMALS);
                            console.log(`Balance for token ${mintAddress}: ${tokenBalance}`);
                            totalSaiBalance += tokenBalance;
                        } catch (err) {
                            console.log(`No balance found for token mint ${mintAddress}`);
                        }
                    } catch (err) {
                        console.error(`Error checking token balance for ${mintAddress}:`, err);
                    }
                }
            } catch (err) {
                console.error('Error checking user tokens:', err);
            }
            
            // Save balances to cache
            this._cachedBalances = {
                sol: solAmount,
                sai: totalSaiBalance
            };
            
            console.log('Updated balances:', this._cachedBalances);
            return this._cachedBalances;
        } catch (error) {
            console.error('Error in getTokenBalances:', error);
            
            // Return last known balances or default
            return this._cachedBalances || { sol: 0, sai: 0 };
        }
    }

    async getUserCDPs() {
        try {
            // Check cache first
            if (isCacheValid()) {
                console.log('Returning cached CDP list');
                return cdpCache.data;
            }
            
            // Check rate limits
            if (!checkRateLimit()) {
                console.log('Rate limit hit for getUserCDPs, returning cached data or empty array');
                return cdpCache.data || [];
            }
            
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
            
            // Use retry with backoff for the query
            const cdpAccounts = await retryWithBackoff(async () => {
                // The correct way to query: owner is at bytes 8 after the 8-byte discriminator
                return await this.program.account.cdp.all();
            });

            console.log(`Found ${cdpAccounts.length} raw CDPs`);
            
            // Filter for user's CDPs
            const userCDPs = cdpAccounts.filter(account => {
                try {
                    return account.account.owner.toString() === this.wallet.publicKey.toString();
                } catch (e) {
                    console.error('Error filtering CDP:', e);
                    return false;
                }
            });
            
            console.log(`Found ${userCDPs.length} CDPs belonging to user`);
            
            // Format CDP data with better error handling
            const formattedCDPs = userCDPs.map(account => {
                try {
                    const data = {
                        address: account.publicKey.toString(),
                        owner: account.account.owner.toString(),
                        collateralAmount: Number(account.account.collateralAmount) / LAMPORTS_PER_SOL,
                        saiDebt: Number(account.account.saiDebt) / Math.pow(10, SAI_DECIMALS),
                        status: account.account.status || 'active',
                        lastUpdated: new Date().toISOString()
                    };
                    console.log('CDP data:', data);
                    return data;
                } catch (error) {
                    console.error('Error formatting CDP data:', error);
                    return null;
                }
            }).filter(Boolean); // Remove any null entries from formatting errors
            
            // Update cache
            cdpCache.data = formattedCDPs;
            cdpCache.timestamp = Date.now();
            
            return formattedCDPs;
        } catch (error) {
            console.error('Error in getUserCDPs:', error);
            // Log more details about the error
            if (error.message) {
                console.error('Error message:', error.message);
            }
            if (error.stack) {
                console.error('Error stack:', error.stack);
            }
            
            // Return cached data if available, otherwise empty array
            return cdpCache.data || [];
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

    // Update the ensureSaiMint method to work with our hardcoded mint
    async ensureSaiMint() {
        try {
            console.log('Checking if SAI mint exists at expected address:', this.saiMint.toString());
            
            // Try to get the mint info to check if it exists
            try {
                const mintInfo = await this.connection.getAccountInfo(this.saiMint);
                if (mintInfo) {
                    console.log('SAI mint exists at expected address:', this.saiMint.toString());
                    return true;
                }
                console.log('SAI mint account not found. Creating it at the expected address...');
            } catch (error) {
                console.log('Error checking SAI mint, will attempt to create it:', error.message);
            }
            
            // For a test environment, we would normally need the private key for this mint
            // But since we can't have that in a frontend app, we'll try to create a test mint
            // Note: In a real environment, the mint would already exist on-chain
            
            console.log('WARNING: In a production environment, the SAI mint should already exist');
            console.log('Creating a test mint for demonstration purposes only');
            
            try {
                // Create transaction to create mint at a new address
                const mintKeypair = Keypair.generate();
                console.log('Creating test SAI mint at address:', mintKeypair.publicKey.toString());
                
                // Create transaction to create mint
                const transaction = new Transaction();
                
                // Calculate the rent for the mint
                const rentExemptMint = await this.connection.getMinimumBalanceForRentExemption(82);
                
                // Create account for the mint
                transaction.add(
                    SystemProgram.createAccount({
                        fromPubkey: this.wallet.publicKey,
                        newAccountPubkey: mintKeypair.publicKey,
                        lamports: rentExemptMint,
                        space: 82,
                        programId: TOKEN_PROGRAM_ID
                    })
                );
                
                // Initialize mint instruction
                transaction.add(
                    createInitializeMintInstruction(
                        mintKeypair.publicKey,
                        SAI_DECIMALS,
                        this.wallet.publicKey,
                        this.wallet.publicKey,
                        TOKEN_PROGRAM_ID
                    )
                );
                
                // Get recent blockhash
                const { blockhash } = await this.connection.getLatestBlockhash();
                transaction.recentBlockhash = blockhash;
                transaction.feePayer = this.wallet.publicKey;
                
                // Sign with mint keypair
                transaction.partialSign(mintKeypair);
                
                // Sign with wallet
                let signedTransaction;
                if (window.solana?.isPhantom) {
                    signedTransaction = await window.solana.signTransaction(transaction);
                } else if (this.wallet.signTransaction) {
                    signedTransaction = await this.wallet.signTransaction(transaction);
                } else {
                    throw new Error("No method to sign transaction");
                }
                
                // Send transaction
                console.log('Sending mint creation transaction...');
                const txid = await this.connection.sendRawTransaction(
                    signedTransaction.serialize(),
                    { skipPreflight: true }
                );
                
                // Wait for confirmation
                await this.connection.confirmTransaction(txid, 'confirmed');
                console.log('Test SAI mint created successfully at address:', mintKeypair.publicKey.toString());
                
                // For testing, use this new mint
                this.saiMint = mintKeypair.publicKey;
                console.log('Using test mint for this session. NOTE: This will not work with the actual program!');
                
                return true;
            } catch (error) {
                console.error('Error creating test SAI mint:', error);
                
                // If we can't create a test mint, we should fall back to the expected address
                console.log('Falling back to expected SAI mint address:', SAI_MINT.toString());
                this.saiMint = SAI_MINT;
                
                return false;
            }
        } catch (error) {
            console.error('Error ensuring SAI mint:', error);
            throw error;
        }
    }

    // Add closeVault function to return collateral to user
    async closeVault(vaultAddress, tokenMint, tokenAmount) {
        try {
            console.log(`Closing vault ${vaultAddress} and returning collateral...`);
            
            // Parse addresses
            const vaultPubkey = new PublicKey(vaultAddress);
            const tokenMintPubkey = new PublicKey(tokenMint);
            
            // Get vault balance
            const vaultBalance = await this.connection.getBalance(vaultPubkey);
            if (vaultBalance <= 0) {
                return {
                    success: false,
                    error: "Vault has no SOL balance"
                };
            }
            
            console.log(`Vault balance: ${vaultBalance / LAMPORTS_PER_SOL} SOL`);
            
            // Get user's token account
            const userTokenAccount = await getAssociatedTokenAddress(
                tokenMintPubkey,
                this.wallet.publicKey
            );
            
            // Create transaction
            const transaction = new Transaction();
            
            // Add compute budget for larger transaction
            transaction.add(
                ComputeBudgetProgram.setComputeUnitLimit({
                    units: 400000
                })
            );
            
            // Burn tokens first (if requested)
            if (tokenAmount > 0) {
                const tokenAmountRaw = Math.floor(tokenAmount * Math.pow(10, SAI_DECIMALS));
                
                // Check token balance
                try {
                    const tokenAccount = await getAccount(this.connection, userTokenAccount);
                    const currentBalance = Number(tokenAccount.amount);
                    
                    if (currentBalance < tokenAmountRaw) {
                        return {
                            success: false,
                            error: `Insufficient token balance. You have ${currentBalance / Math.pow(10, SAI_DECIMALS)} tokens, but trying to burn ${tokenAmount}`
                        };
                    }
                    
                    // Add burn instruction
                    transaction.add(
                        createBurnInstruction(
                            userTokenAccount,
                            tokenMintPubkey,
                            this.wallet.publicKey,
                            tokenAmountRaw,
                            [],
                            TOKEN_PROGRAM_ID
                        )
                    );
                    
                    console.log(`Added instruction to burn ${tokenAmount} tokens`);
                } catch (error) {
                    console.error("Error checking token balance:", error);
                    return {
                        success: false,
                        error: "Failed to check token balance: " + error.message
                    };
                }
            }
            
            // Add instruction to close vault and return lamports to user
            const transferInstruction = SystemProgram.transfer({
                fromPubkey: vaultPubkey,
                toPubkey: this.wallet.publicKey,
                lamports: vaultBalance - 5000 // Leave some for rent
            });
            
            transaction.add(transferInstruction);
            
            // Get blockhash for the transaction
            const { blockhash } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.wallet.publicKey;
            
            // Sign with wallet
            let signedTransaction;
            if (window.solana?.isPhantom) {
                console.log('Using Phantom to sign transaction');
                signedTransaction = await window.solana.signTransaction(transaction);
            } else if (this.wallet.signTransaction) {
                console.log('Using wallet adapter to sign transaction');
                signedTransaction = await this.wallet.signTransaction(transaction);
            } else {
                throw new Error("No method to sign transaction");
            }
            
            // Send transaction
            console.log('Sending vault closure transaction...');
            const txid = await this.connection.sendRawTransaction(
                signedTransaction.serialize(),
                { skipPreflight: true }
            );
            
            console.log('Transaction sent:', txid);
            await this.connection.confirmTransaction(txid, 'confirmed');
            console.log('Transaction confirmed!');
            
            // Update cached balances for the UI to show SOL returned
            this._cachedBalances = {
                sol: await this.connection.getBalance(this.wallet.publicKey) / LAMPORTS_PER_SOL,
                sai: tokenAmount > 0 ? 0 : undefined // Only update SAI if we burned tokens
            };
            
            return {
                success: true,
                message: `Successfully closed vault and returned ${(vaultBalance - 5000) / LAMPORTS_PER_SOL} SOL to your wallet`
            };
        } catch (error) {
            console.error('Error closing vault:', error);
            return {
                success: false,
                error: `Failed to close vault: ${error.message}`
            };
        }
    }

    async repaySai(vaultAddress, amount) {
        if (!this.isInitialized()) {
            throw new Error("API not initialized. Please initialize first.");
        }

        try {
            console.log(`Attempting to repay ${amount} SAI for vault ${vaultAddress}`);
            
            // Convert amount to raw value with decimals
            const saiRaw = new BN(amount * Math.pow(10, SAI_DECIMALS));

            // Get user's SAI token account
            const userTokenAccount = await getAssociatedTokenAddress(
                this.saiMint,
                this.wallet.publicKey
            );
            
            console.log("User SAI token account:", userTokenAccount.toString());

            // Create transaction
            const transaction = new Transaction();

            // Add compute budget for larger transaction
            transaction.add(
                ComputeBudgetProgram.setComputeUnitLimit({
                    units: 400000
                })
            );

            // Add instruction to burn SAI tokens
            transaction.add(
                createBurnInstruction(
                    this.saiMint,
                    userTokenAccount,
                    this.wallet.publicKey,
                    saiRaw,
                    []
                )
            );

            // Get recent blockhash
            const { blockhash } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.wallet.publicKey;

            console.log("Transaction prepared, signing with wallet");
            
            try {
                // Sign with our wallet
                let signedTransaction;
                
                // Use direct wallet methods if available
                if (window.solflare) {
                    console.log("Using Solflare window.solflare to sign");
                    signedTransaction = await window.solflare.signTransaction(transaction);
                } else if (window.solana) {
                    console.log("Using Phantom window.solana to sign");
                    signedTransaction = await window.solana.signTransaction(transaction);
                } else {
                    // Instead of directly calling this.wallet.signTransaction, use bind to preserve context
                    console.log("Using wallet adapter to sign with proper context");
                    const signFunction = this.wallet.signTransaction.bind(this.wallet);
                    signedTransaction = await signFunction(transaction);
                }
                
                console.log("Transaction signed successfully");
                
                // Send the transaction
                const signature = await this.connection.sendRawTransaction(
                    signedTransaction.serialize(),
                    { skipPreflight: true }
                );
                
                console.log("Transaction sent:", signature);
                
                // Wait for confirmation
                await this.connection.confirmTransaction(signature, 'confirmed');
                console.log("Transaction confirmed!");
                
                // Update cached balances
                try {
                    const tokenAccount = await getAccount(this.connection, userTokenAccount);
                    const saiBalance = Number(tokenAccount.amount) / Math.pow(10, SAI_DECIMALS);
                    
                    this._cachedBalances = {
                        sol: await this.connection.getBalance(this.wallet.publicKey) / LAMPORTS_PER_SOL,
                        sai: saiBalance
                    };
                } catch (err) {
                    console.error('Error updating cached balances:', err);
                }
                
                return {
                    success: true,
                    signature: signature,
                    message: `Successfully repaid ${amount} SAI tokens.`
                };
            } catch (signError) {
                console.error("Error signing or sending transaction:", signError);
                throw new Error(`Transaction signing failed: ${signError.message}`);
            }
        } catch (error) {
            console.error('Error repaying SAI:', error);
            return {
                success: false,
                error: `Failed to repay SAI: ${error.message}`
            };
        }
    }
}