import { Program, AnchorProvider } from '@project-serum/anchor';
import { PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY, LAMPORTS_PER_SOL, Keypair, ComputeBudgetProgram, Connection, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount, createTransferInstruction, createMintToInstruction, createInitializeMintInstruction, ASSOCIATED_TOKEN_PROGRAM_ID, createBurnInstruction } from '@solana/spl-token';
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

    async setWalletProvider(provider) {
        try {
            console.log("Setting wallet provider:", provider);
            
            if (!provider) {
                console.error("No wallet provider provided");
                return false;
            }
            
            // Handle Phantom wallet direct connection
            if (provider.isPhantom) {
                console.log("Detected Phantom wallet direct connection");
                this.wallet = {
                    publicKey: provider.publicKey,
                    signTransaction: async (tx) => provider.signTransaction(tx),
                    signAllTransactions: async (txs) => provider.signAllTransactions(txs),
                    connected: true
                };
            } 
            // Handle wallet adapter
            else if (provider.adapter || provider.publicKey) {
                console.log("Detected wallet adapter connection");
                this.wallet = provider;
            }
            else {
                console.error("Unsupported wallet provider type");
                return false;
            }
            
            // Ensure we have a valid public key
            if (!this.wallet.publicKey) {
                console.error("No public key available in wallet provider");
                return false;
            }
            
            console.log("Wallet provider set successfully, public key:", this.wallet.publicKey.toString());
            
            // Initialize after setting wallet
            await this.initialize();
            
            return true;
        } catch (error) {
            console.error("Error setting wallet provider:", error);
            return false;
        }
    }

    async initialize() {
        try {
            console.log("Starting initialization...");
            
            // Ensure we have a connection
            if (!this.connection) {
                console.log("Creating new connection...");
                this.connection = new Connection('https://api.devnet.solana.com', 'confirmed');
            }

            // Validate wallet setup
            if (!this.wallet || !this.wallet.publicKey) {
                console.error("Wallet not properly set up");
                return false;
            }

            // Initialize program
            console.log("Initializing program...");
            this.program = new Program(saiIDL, PROGRAM_ID, {
                connection: this.connection,
                wallet: this.wallet
            });

            // Verify program initialization
            if (!this.program) {
                console.error("Program initialization failed");
                return false;
            }

            // Mark as initialized
            this.initialized = true;
            console.log("Initialization completed successfully");
            
            return true;
        } catch (error) {
            console.error("Initialization failed:", error);
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
            
            // For testing, we need to create our own mint that we control
            // Instead of using the expected SAI mint (which we don't have authority over)
            console.log('Creating a new test token mint for this demo');
            
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
            if (!this.connection) {
                this.connection = new Connection('https://api.devnet.solana.com', 'confirmed');
                console.log('Created new connection to devnet');
            }
            
            try {
                const version = await this.connection.getVersion();
                console.log('Connection is active. Solana version:', version);
            } catch (error) {
                console.error('Connection test failed:', error);
                return {
                    success: false,
                    error: 'Cannot connect to Solana network. Please check your internet connection.'
                };
            }
            
            // Step 1: Create a vault keypair to hold SOL
            const vaultKeypair = Keypair.generate();
            console.log('Created demo vault account:', vaultKeypair.publicKey.toString());
            
            // Step 2: Get or create SAI token mint
            // First check if we already have a SAI mint stored in localStorage
            let mintKeypair;
            let existingSaiMint = localStorage.getItem('sai_token_mint');
            
            if (existingSaiMint) {
                try {
                    console.log('Found existing SAI token mint:', existingSaiMint);
                    // Convert string to PublicKey
                    this.saiMint = new PublicKey(existingSaiMint);
                    // Create a dummy keypair (we won't use it for signing since we don't have the private key)
                    mintKeypair = Keypair.generate();
                    mintKeypair.publicKey = this.saiMint;
                } catch (err) {
                    console.error('Error using existing mint, creating new one:', err);
                    mintKeypair = Keypair.generate();
                    this.saiMint = mintKeypair.publicKey;
                    localStorage.setItem('sai_token_mint', this.saiMint.toString());
                }
            } else {
                // Create a new SAI mint and store it
                mintKeypair = Keypair.generate();
                this.saiMint = mintKeypair.publicKey;
                localStorage.setItem('sai_token_mint', this.saiMint.toString());
                console.log('Created new SAI token mint:', this.saiMint.toString());
            }
            
            // Get the associated token account for the user's wallet
            const userTokenAccount = await getAssociatedTokenAddress(
                this.saiMint,
                this.wallet.publicKey
            );
            console.log('User token account for SAI tokens:', userTokenAccount.toString());
            
            // Create a transaction to handle everything
            const transaction = new Transaction();
            
            // Add compute budget for larger transaction
            transaction.add(
                ComputeBudgetProgram.setComputeUnitLimit({
                    units: 400000
                })
            );
            
            // Check if we're creating a new mint or using an existing one
            if (!existingSaiMint) {
                // Step 3: Create the mint account (only if it's new)
                const mintRent = await this.connection.getMinimumBalanceForRentExemption(82);
                transaction.add(
                    SystemProgram.createAccount({
                        fromPubkey: this.wallet.publicKey,
                        newAccountPubkey: mintKeypair.publicKey,
                        lamports: mintRent,
                        space: 82,
                        programId: TOKEN_PROGRAM_ID
                    }),
                    createInitializeMintInstruction(
                        mintKeypair.publicKey,
                        SAI_DECIMALS,
                        this.wallet.publicKey, // Make the user the mint authority
                        null,
                        TOKEN_PROGRAM_ID
                    )
                );
            }
            
            // Check if token account already exists
            let tokenAccountExists = false;
            try {
                const accountInfo = await this.connection.getAccountInfo(userTokenAccount);
                tokenAccountExists = !!accountInfo;
                console.log('Token account exists:', tokenAccountExists);
            } catch (error) {
                console.log('Error checking token account, assuming it does not exist:', error);
            }
            
            // Step 4: Create the associated token account for the user if it doesn't exist
            if (!tokenAccountExists) {
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        this.wallet.publicKey,
                        userTokenAccount,
                        this.wallet.publicKey,
                        this.saiMint
                    )
                );
            }
            
            // Step 5: Create a vault account for SOL collateral
            const vaultRent = await this.connection.getMinimumBalanceForRentExemption(0);
            transaction.add(
                SystemProgram.createAccount({
                    fromPubkey: this.wallet.publicKey,
                    newAccountPubkey: vaultKeypair.publicKey,
                    lamports: vaultRent + collateralLamports, // Include collateral in creation
                    space: 0,
                    programId: SystemProgram.programId
                })
            );
            
            // Step 6: Mint SAI tokens to the user's token account
            transaction.add(
                createMintToInstruction(
                    this.saiMint,
                    userTokenAccount,
                    this.wallet.publicKey, // Mint authority (owner)
                    saiRaw,
                    [],
                    TOKEN_PROGRAM_ID
                )
            );
            
            // Get blockhash for recency
            const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.wallet.publicKey;
            
            // Sign with the necessary keypairs
            if (!existingSaiMint) {
                transaction.partialSign(mintKeypair);
            }
            transaction.partialSign(vaultKeypair);
            
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
            console.log('Sending transaction...');
            const txid = await this.connection.sendRawTransaction(
                signedTransaction.serialize(),
                { skipPreflight: true }
            );
            
            console.log('Transaction sent:', txid);
            
            // Wait for confirmation
            await this.connection.confirmTransaction(txid, 'confirmed');
            console.log('Transaction confirmed!');
            
            // Show instructions to add the new token to Phantom
            console.log('To view your tokens in Phantom, add this custom token:', this.saiMint.toString());
            
            // Add this mint to our tracked token mints for the user
            try {
                // Get the array of token mints from localStorage
                const userTokens = JSON.parse(localStorage.getItem('user_tokens') || '[]');
                if (!userTokens.includes(this.saiMint.toString())) {
                    userTokens.push(this.saiMint.toString());
                    localStorage.setItem('user_tokens', JSON.stringify(userTokens));
                }
            } catch (err) {
                console.error('Error saving token to localStorage:', err);
            }
            
            // Update cached balances for the UI
            try {
                // Get current SAI balance for this token
                const tokenAccount = await getAccount(this.connection, userTokenAccount);
                const saiBalance = Number(tokenAccount.amount) / Math.pow(10, SAI_DECIMALS);
                
                this._cachedBalances = {
                    sol: await this.connection.getBalance(this.wallet.publicKey) / LAMPORTS_PER_SOL,
                    sai: saiBalance
                };
            } catch (err) {
                console.error('Error updating cached balances:', err);
                this._cachedBalances = {
                    sol: await this.connection.getBalance(this.wallet.publicKey) / LAMPORTS_PER_SOL,
                    sai: saiAmount
                };
            }
            
            return {
                success: true,
                signature: txid,
                tokenMint: this.saiMint.toString(),
                tokenAccount: userTokenAccount.toString(),
                vault: vaultKeypair.publicKey.toString(),
                message: `Successfully created vault and minted ${saiAmount} SAI tokens. To see these tokens in Phantom, add the custom token: ${this.saiMint.toString()}`
            };
        } catch (error) {
            console.error('Error creating CDP:', error);
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
}