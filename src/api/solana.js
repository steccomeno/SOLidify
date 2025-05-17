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

// Add helper function to update token metadata for better wallet visibility
async function setupTokenMetadata(connection, tokenMint, name = "SAI", symbol = "SAI", ownerPubkey) {
    try {
        console.log(`Setting up token metadata for ${tokenMint.toString()}`);
        
        // Save token info to localStorage for easy reference
        localStorage.setItem('sai_token_info', JSON.stringify({
            address: tokenMint.toString(),
            name: name,
            symbol: symbol,
            decimals: SAI_DECIMALS,
            created: new Date().toISOString()
        }));
        
        console.log(`Token metadata info saved to localStorage`);
        return true;
    } catch (error) {
        console.error("Error setting token metadata:", error);
        return false;
    }
}

// Add this helper function near the top where other utility functions are defined
async function confirmTransactionWithRetry(connection, signature, maxRetries = 3, timeoutSeconds = 60) {
    console.log(`Confirming transaction ${signature} with ${maxRetries} retries and ${timeoutSeconds}s timeout`);
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // Use longer timeout for transaction confirmation
            const confirmationStrategy = {
                signature,
                timeout: timeoutSeconds * 1000, // Convert to milliseconds
            };
            
            console.log(`Confirmation attempt ${attempt + 1}/${maxRetries}...`);
            await connection.confirmTransaction(confirmationStrategy, 'confirmed');
            console.log(`Transaction confirmed on attempt ${attempt + 1}!`);
            return true;
        } catch (error) {
            console.warn(`Confirmation attempt ${attempt + 1} failed:`, error.message);
            
            // Check if the transaction was actually successful despite the timeout
            try {
                const tx = await connection.getTransaction(signature, {commitment: 'confirmed'});
                if (tx && tx.meta && !tx.meta.err) {
                    console.log('Transaction was actually successful despite confirmation timeout!');
                    return true;
                }
            } catch (checkError) {
                console.error('Error checking transaction status:', checkError.message);
            }
            
            // If this is not the last attempt, wait before trying again
            if (attempt < maxRetries - 1) {
                const delay = 2000 * (attempt + 1); // Exponential backoff
                console.log(`Waiting ${delay/1000}s before next attempt...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    // After all retries, check one more time if the transaction was successful
    try {
        const tx = await connection.getTransaction(signature, {commitment: 'confirmed'});
        if (tx && tx.meta && !tx.meta.err) {
            console.log('Final check: Transaction was actually successful!');
            return true;
        }
    } catch (error) {
        console.error('Error in final transaction check:', error.message);
    }
    
    throw new Error(`Transaction confirmation failed after ${maxRetries} attempts`);
}

// Add at the top with other utility functions
async function debugVaultData(connection, vaultAddress) {
    try {
        // Parse the address
        const vaultPubkey = new PublicKey(vaultAddress);
        
        // Get account info
        console.log(`[DIAGNOSTIC] Getting account info for vault: ${vaultAddress}`);
        const accountInfo = await connection.getAccountInfo(vaultPubkey);
        
        if (!accountInfo) {
            console.log(`[DIAGNOSTIC] No account found at address ${vaultAddress}`);
            return { exists: false };
        }
        
        console.log(`[DIAGNOSTIC] Account exists with ${accountInfo.lamports / LAMPORTS_PER_SOL} SOL`);
        console.log(`[DIAGNOSTIC] Owner: ${accountInfo.owner.toString()}`);
        console.log(`[DIAGNOSTIC] Executable: ${accountInfo.executable}`);
        console.log(`[DIAGNOSTIC] Data length: ${accountInfo.data.length} bytes`);
        
        return {
            exists: true,
            balance: accountInfo.lamports / LAMPORTS_PER_SOL,
            owner: accountInfo.owner.toString(),
            executable: accountInfo.executable,
            dataLength: accountInfo.data.length
        };
    } catch (err) {
        console.error(`[DIAGNOSTIC] Error checking vault ${vaultAddress}:`, err);
        return { exists: false, error: err.message };
    }
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
            
            // Check if solflare or phantom is available and connected
            let isExternalWalletConnected = false;
            
            if (window.solflare && window.solflare.isConnected) {
                console.log("Solflare wallet is connected");
                isExternalWalletConnected = true;
            } else if (window.solana && window.solana.isConnected) {
                console.log("Phantom wallet is connected");
                isExternalWalletConnected = true;
            }
            
            if (!isExternalWalletConnected) {
                console.warn("External wallet providers not connected, checking adapter wallet");
            }
            
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
            
            // Verify signing capability
            if (!this.wallet.signTransaction && !window.solflare?.isConnected && !window.solana?.isConnected) {
                console.error("No signing method available. Cannot initialize without signing capability.");
                return false;
            }
            
            try {
                console.log("Using wallet with public key:", this.wallet.publicKey.toString());
            } catch (e) {
                console.error("Error stringifying public key:", e);
                console.log("Public key available but cannot be converted to string");
            }
            
            // Ensure we have a connection - try multiple endpoints
            if (!this.connection) {
                console.log("Creating new connection...");
                
                // Try multiple endpoints with fallbacks
                const endpoints = [
                    'https://api.devnet.solana.com',
                    'https://solana-devnet-rpc.publicnode.com',
                    'https://devnet.genesysgo.net',
                    'https://api.testnet.solana.com'
                ];
                
                let connected = false;
                let lastError = null;
                
                for (const endpoint of endpoints) {
                    if (connected) break;
                    
                    try {
                        console.log(`Trying to connect to ${endpoint}...`);
                        const tempConnection = new Connection(endpoint, 'confirmed');
                        
                        // Test connection
                        const version = await tempConnection.getVersion();
                        console.log(`Connected to ${endpoint}. Version:`, version);
                        
                        this.connection = tempConnection;
                        connected = true;
                    } catch (e) {
                        lastError = e;
                        console.error(`Failed to connect to ${endpoint}:`, e);
                    }
                }
                
                if (!connected) {
                    console.error("Failed to connect to any Solana endpoint:", lastError);
                    return false;
                }
            }

            // Test connection
            try {
                const version = await this.connection.getVersion();
                console.log("Connected to Solana. Version:", version);
            } catch (e) {
                console.error("Failed to connect to Solana network:", e);
                return false;
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

            // Sign with our enhanced signing method
            console.log('Signing token account creation transaction...');
            let signed;
            try {
                signed = await this.signTransaction(transaction);
                console.log('Transaction signed successfully');
            } catch (error) {
                console.error('Error signing transaction:', error);
                throw new Error(`Failed to sign transaction: ${error.message}`);
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
                console.log("Using existing Solana connection");
                return this.connection;
            } catch (e) {
                console.warn('Existing connection failed, creating new one:', e);
            }
        }

        // Try multiple RPC endpoints with retry logic
        const endpoints = [
            'https://api.devnet.solana.com',
            'https://solana-devnet-rpc.publicnode.com',
            'https://devnet.genesysgo.net',
            'https://api.testnet.solana.com'
        ];

        let lastError = null;
        
        // Try each endpoint with multiple retries
        for (const endpoint of endpoints) {
            console.log(`Trying to connect to ${endpoint}...`);
            let retries = 0;
            const maxRetries = 2;
            
            while (retries <= maxRetries) {
                try {
                    const connection = new Connection(endpoint, 'confirmed');
                    const version = await connection.getVersion();
                    console.log(`Successfully connected to ${endpoint}. Version:`, version);
                    this.connection = connection;
                    return connection;
                } catch (e) {
                    lastError = e;
                    console.warn(`Failed to connect to ${endpoint} (attempt ${retries + 1}/${maxRetries + 1}):`, e);
                    retries++;
                    
                    if (retries <= maxRetries) {
                        // Wait before retrying
                        const delay = 1000 * Math.pow(1.5, retries);
                        console.log(`Retrying in ${delay}ms...`);
                        await wait(delay);
                    }
                }
            }
        }

        console.error("Failed to establish connection to any RPC endpoint:", lastError);
        throw new Error('Failed to establish connection to any Solana RPC endpoint');
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

    // Add reconnectWallet method to reconnect when wallet state is lost
    async reconnectWallet() {
        console.log("Attempting to reconnect wallet...");
        
        // Check if we can auto-reconnect using Solflare or Phantom
        if (window.solflare && !window.solflare.isConnected) {
            try {
                console.log("Attempting to reconnect Solflare wallet...");
                await window.solflare.connect();
                console.log("Solflare wallet reconnected");
                return true;
            } catch (e) {
                console.error("Failed to reconnect Solflare wallet:", e);
            }
        }
        
        if (window.solana && !window.solana.isConnected) {
            try {
                console.log("Attempting to reconnect Phantom wallet...");
                await window.solana.connect();
                console.log("Phantom wallet reconnected");
                return true;
            } catch (e) {
                console.error("Failed to reconnect Phantom wallet:", e);
            }
        }
        
        return false;
    }

    // Create a reliable signing method that works with different wallet types
    async signTransaction(transaction) {
        console.log("Using direct wallet signing method with no adapter dependency");
        
        // Use a try/catch block to handle errors
        try {
            // Method 1: Use Solflare's direct API if available
            if (window.solflare && typeof window.solflare.signTransaction === 'function') {
                try {
                    console.log("Using Solflare window object directly");
                    
                    // Make sure wallet is connected
                    if (!window.solflare.isConnected) {
                        console.log("Solflare not connected, attempting to connect");
                        await window.solflare.connect();
                    }
                    
                    // Use direct method with no this context
                    const signed = await window.solflare.signTransaction(transaction);
                    console.log("Solflare direct signing successful");
                    return signed;
                } catch (err) {
                    console.error("Error with Solflare direct signing:", err);
                }
            }
            
            // Method 2: Use Phantom's direct API if available
            if (window.solana && typeof window.solana.signTransaction === 'function') {
                try {
                    console.log("Using Phantom window object directly");
                    
                    // Make sure wallet is connected
                    if (!window.solana.isConnected) {
                        console.log("Phantom not connected, attempting to connect");
                        await window.solana.connect();
                    }
                    
                    // Use direct method with no this context
                    const signed = await window.solana.signTransaction(transaction);
                    console.log("Phantom direct signing successful");
                    return signed;
                } catch (err) {
                    console.error("Error with Phantom direct signing:", err);
                }
            }
            
            // Last resort: Try with adapter but no emit dependency
            if (this.wallet && typeof this.wallet.signTransaction === 'function') {
                try {
                    console.log("Attempting bare function call with no context dependency");
                    
                    // Get just the function itself
                    const signFn = this.wallet.signTransaction;
                    
                    // Create a minimal wrapper with no dependency on emit
                    const result = await new Promise((resolve, reject) => {
                        try {
                            // Call directly with transaction as the only argument
                            const direct = signFn(transaction);
                            if (direct instanceof Promise) {
                                direct.then(resolve).catch(reject);
                            } else {
                                resolve(direct);
                            }
                        } catch (e) {
                            reject(e);
                        }
                    });
                    
                    console.log("Direct function call successful");
                    return result;
                } catch (err) {
                    console.error("Error with direct function call:", err);
                }
            }
            
            // If we get here, all methods failed
            throw new Error("All signing methods failed. Please reconnect your wallet and try again.");
        } catch (error) {
            console.error("Transaction signing critical failure:", error);
            throw error;
        }
    }

    async createCDP(collateralAmount, saiAmount) {
        try {
            console.log(`Creating CDP with ${collateralAmount} SOL collateral for ${saiAmount} SAI`);
            
            // Early validation
            if (!this.isInitialized()) {
                throw new Error('API not initialized. Please initialize first.');
            }
            
            // Ensure wallet is connected
            if (!this.wallet || !this.wallet.publicKey) {
                throw new Error('No wallet available. Please connect your wallet and try again.');
            }
            
            console.log("Wallet public key:", this.wallet.publicKey.toString());
            
            // Convert to raw values
            const lamports = Math.floor(collateralAmount * LAMPORTS_PER_SOL);
            const saiRaw = new BN(Math.floor(saiAmount * Math.pow(10, SAI_DECIMALS)));
            
            console.log(`Using ${lamports} lamports (${collateralAmount} SOL) and ${saiRaw} raw SAI units (${saiAmount} SAI)`);
            
            // Create a deterministic vault keypair
            const timestamp = Date.now().toString();
            const seedPhrase = `vault-${this.wallet.publicKey.toString()}-${timestamp}`;
            console.log(`Creating vault keypair with seed: ${seedPhrase}`);
            
            const seed = new TextEncoder().encode(seedPhrase);
            const hash = await crypto.subtle.digest('SHA-256', seed);
            const seedBytes = new Uint8Array(hash);
            const vaultKeypair = Keypair.fromSeed(seedBytes.slice(0, 32));
            
            console.log("Created vault account:", vaultKeypair.publicKey.toString());
            
            // Get a valid token mint
            const tokenMint = this.saiMint;
            console.log("Using token mint:", tokenMint.toString());
            
            // Get the user's token account
            const userTokenAccount = await getAssociatedTokenAddress(
                tokenMint,
                this.wallet.publicKey
            );
            
            console.log("User token account:", userTokenAccount.toString());
            
            // Check if the token account exists
            try {
                const accountInfo = await this.connection.getAccountInfo(userTokenAccount);
                if (!accountInfo) {
                    console.log("Token account doesn't exist, creating it");
                    
                    // Create a transaction for the token account
                    const createAccountTx = new Transaction();
                    createAccountTx.add(
                        createAssociatedTokenAccountInstruction(
                            this.wallet.publicKey,
                            userTokenAccount,
                            this.wallet.publicKey,
                            tokenMint
                        )
                    );
                    
                    // Get fresh blockhash
                    const { blockhash } = await this.connection.getLatestBlockhash();
                    createAccountTx.recentBlockhash = blockhash;
                    createAccountTx.feePayer = this.wallet.publicKey;
                    
                    // Sign and send
                    const signedTx = await this.signTransaction(createAccountTx);
                    const txId = await this.connection.sendRawTransaction(
                        signedTx.serialize(), 
                        { skipPreflight: true }
                    );
                    
                    console.log("Token account creation transaction sent:", txId);
                    await this.connection.confirmTransaction(txId);
                    console.log("Token account created successfully");
                } else {
                    console.log("Token account already exists");
                }
            } catch (error) {
                console.error("Error checking token account:", error);
            }
            
            // 1. First transfer SOL to the vault
            console.log(`Creating SOL transfer transaction for ${lamports} lamports (${collateralAmount} SOL)`);
            
            // Get user's current balance before transfer
            const userBalanceBefore = await this.connection.getBalance(this.wallet.publicKey);
            console.log(`User balance before transfer: ${userBalanceBefore / LAMPORTS_PER_SOL} SOL`);
            
            const transferTx = new Transaction();
            
            // Add compute budget instruction to increase unit limit
            transferTx.add(
                ComputeBudgetProgram.setComputeUnitLimit({
                    units: 200000
                })
            );
            
            transferTx.add(
                SystemProgram.transfer({
                    fromPubkey: this.wallet.publicKey,
                    toPubkey: vaultKeypair.publicKey,
                    lamports
                })
            );
            
            // Get fresh blockhash
            const { blockhash: transferBlockhash } = await this.connection.getLatestBlockhash('processed');
            transferTx.recentBlockhash = transferBlockhash;
            transferTx.feePayer = this.wallet.publicKey;
            
            // Sign and send
            console.log("Signing SOL transfer transaction");
            const signedTransferTx = await this.signTransaction(transferTx);
            
            console.log("Sending SOL transfer transaction");
            const transferTxId = await this.connection.sendRawTransaction(
                signedTransferTx.serialize(),
                { 
                    skipPreflight: false,
                    preflightCommitment: 'processed',
                    maxRetries: 3
                }
            );
            
            console.log("SOL transfer transaction sent:", transferTxId);
            
            // Wait more carefully for confirmation
            console.log("Waiting for SOL transfer confirmation...");
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds for transaction to propagate
            
            const confirmationResult = await this.connection.confirmTransaction({
                signature: transferTxId,
                lastValidBlockHeight: (await this.connection.getLatestBlockhash()).lastValidBlockHeight,
                commitment: 'confirmed'
            });
            
            console.log("SOL transfer confirmed:", confirmationResult);
            
            // Get user's balance after transfer
            const userBalanceAfter = await this.connection.getBalance(this.wallet.publicKey);
            console.log(`User balance after transfer: ${userBalanceAfter / LAMPORTS_PER_SOL} SOL`);
            const balanceChange = (userBalanceBefore - userBalanceAfter) / LAMPORTS_PER_SOL;
            console.log(`User balance change: ${balanceChange} SOL`);
            
            // Check if the balance change is significantly different from the expected amount
            // Allowing for transaction fees (which should be much smaller than the transfer amount)
            if (Math.abs(balanceChange - collateralAmount) > 0.01) {
                console.warn(`Balance change (${balanceChange} SOL) differs from expected amount (${collateralAmount} SOL)`);
            }
            
            // Verify the transfer succeeded
            const vaultBalance = await this.connection.getBalance(vaultKeypair.publicKey);
            console.log(`Vault balance after transfer: ${vaultBalance / LAMPORTS_PER_SOL} SOL`);
            
            if (vaultBalance < lamports * 0.99) { // Allow for a small margin of error due to fees
                console.error(`Transfer incomplete. Expected ${lamports / LAMPORTS_PER_SOL} SOL, but vault only has ${vaultBalance / LAMPORTS_PER_SOL} SOL`);
                throw new Error(`SOL transfer failed. Expected vault to have ${collateralAmount} SOL, but it only has ${vaultBalance / LAMPORTS_PER_SOL} SOL`);
            }
            
            // Wait a bit before next transaction
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 2. Now mint SAI tokens in a separate transaction
            console.log(`Creating SAI mint transaction for ${saiAmount} SAI tokens`);
            
            const mintTx = new Transaction();
            
            // Add compute budget to ensure enough computational resources
            mintTx.add(
                ComputeBudgetProgram.setComputeUnitLimit({
                    units: 200000
                })
            );
            
            mintTx.add(
                createMintToInstruction(
                    tokenMint,
                    userTokenAccount,
                    this.wallet.publicKey,
                    saiRaw,
                    []
                )
            );

            // Get fresh blockhash
            const { blockhash: mintBlockhash } = await this.connection.getLatestBlockhash('processed');
            mintTx.recentBlockhash = mintBlockhash;
            mintTx.feePayer = this.wallet.publicKey;
            
            // Sign and send
            console.log("Signing SAI mint transaction");
            const signedMintTx = await this.signTransaction(mintTx);
            
            console.log("Sending SAI mint transaction");
            const mintTxId = await this.connection.sendRawTransaction(
                signedMintTx.serialize(),
                { 
                    skipPreflight: false,
                    preflightCommitment: 'processed',
                    maxRetries: 3
                }
            );
            
            console.log("SAI mint transaction sent:", mintTxId);
            
            // Wait more carefully for confirmation
            console.log("Waiting for SAI mint confirmation...");
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            
            await this.connection.confirmTransaction({
                signature: mintTxId,
                lastValidBlockHeight: (await this.connection.getLatestBlockhash()).lastValidBlockHeight,
                commitment: 'confirmed'
            });
            console.log("SAI mint confirmed");
            
            // Verify token balance was updated
            try {
                const tokenAccount = await getAccount(this.connection, userTokenAccount);
                const tokenBalance = Number(tokenAccount.amount) / Math.pow(10, SAI_DECIMALS);
                console.log(`User's SAI balance: ${tokenBalance} SAI`);
            } catch (err) {
                console.error("Error checking SAI balance:", err);
                // Don't throw here, just log the error
            }
            
            // Save the vault to local storage
            try {
                const vaults = JSON.parse(localStorage.getItem('vaults') || '[]');
                vaults.push({
                    vaultAddress: vaultKeypair.publicKey.toString(),
                    address: vaultKeypair.publicKey.toString(), // For compatibility
                    tokenMint: tokenMint.toString(),
                    collateral: collateralAmount,
                    debt: saiAmount,
                    minted: saiAmount,
                    created: new Date().toISOString(),
                    seedPhrase // Store the seed phrase for recreating the keypair
                });
                localStorage.setItem('vaults', JSON.stringify(vaults));
                console.log('Saved vault to localStorage:', vaultKeypair.publicKey.toString());
            } catch (error) {
                console.error('Error saving vault to localStorage:', error);
            }
            
            return {
                success: true,
                vaultAddress: vaultKeypair.publicKey.toString(),
                tokenMint: tokenMint.toString()
            };
        } catch (error) {
            console.error("Error creating CDP:", error);
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
                console.error('Error checking user token balances:', err);
            }
            
            // Save balances to cache
            this._cachedBalances = {
                sol: solAmount,
                sai: totalSaiBalance
            };
            
            console.log('Final balances:', this._cachedBalances);
            return this._cachedBalances;
        } catch (error) {
            console.error('Error getting token balances:', error);
            throw error;
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

    // Add refreshBalances method to refresh cached balances
    async refreshBalances() {
        try {
            console.log('Refreshing balances...');
            if (!this.wallet || !this.wallet.publicKey) {
                console.warn('refreshBalances: No wallet connected');
                return { sol: 0, sai: 0 };
            }
            
            // Force a fresh balance check by bypassing rate limits
            lastBalanceCheck = 0;
            
            // Check if we have a stored SAI mint in localStorage
            const storedSaiMint = localStorage.getItem('sai_token_mint');
            if (storedSaiMint) {
                try {
                    // Set this as our primary SAI mint if not already set
                    this.saiMint = new PublicKey(storedSaiMint);
                    console.log('Using stored SAI mint for balances:', this.saiMint.toString());
                } catch (e) {
                    console.error('Error setting stored SAI mint:', e);
                }
            }
            
            // Get fresh balances
            const balances = await this.getTokenBalances();
            console.log('Refreshed balances:', balances);
            
            return balances;
        } catch (error) {
            console.error('Error refreshing balances:', error);
            return this._cachedBalances || { sol: 0, sai: 0 };
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
                
                // Sign with wallet using our enhanced signing method
                console.log('Signing mint creation transaction...');
                let signedTransaction;
                try {
                    signedTransaction = await this.signTransaction(transaction);
                    console.log('Transaction signed successfully');
                } catch (error) {
                    console.error('Error signing transaction:', error);
                    throw new Error(`Failed to sign transaction: ${error.message}`);
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
            
            // DIAGNOSTIC: Check the vault balance first
            console.log(`[DIAGNOSTIC] Checking vault balance for ${vaultAddress}`);
            const vaultBalance = await this.connection.getBalance(vaultPubkey);
            console.log(`[DIAGNOSTIC] Vault balance: ${vaultBalance / LAMPORTS_PER_SOL} SOL`);
            
            if (vaultBalance <= 0) {
                return {
                    success: false,
                    error: "Vault has no SOL balance to recover"
                };
            }
            
            // Look up the vault data in localStorage to find the original vault details
            let vaultData = null;
            try {
                const vaults = JSON.parse(localStorage.getItem('vaults') || '[]');
                vaultData = vaults.find(v => v.vaultAddress === vaultAddress || v.address === vaultAddress);
                
                if (vaultData) {
                    console.log(`[DIAGNOSTIC] Found vault data in localStorage:`, vaultData);
                } else {
                    console.log(`[DIAGNOSTIC] No vault data found in localStorage for ${vaultAddress}`);
                }
            } catch (err) {
                console.error("[DIAGNOSTIC] Error reading vault data:", err);
            }
            
            // =================================================
            // METHOD 1: DIRECT TRANSFER USING SEED PHRASE
            // =================================================
            if (vaultData && vaultData.seedPhrase) {
                console.log(`[METHOD 1] Attempting to use stored seed phrase: ${vaultData.seedPhrase}`);
                try {
                    // Recreate the vault keypair from the seed phrase
                    const seed = new TextEncoder().encode(vaultData.seedPhrase);
                    const hash = await crypto.subtle.digest('SHA-256', seed);
                    const seedBytes = new Uint8Array(hash);
                    const vaultKeypair = Keypair.fromSeed(seedBytes.slice(0, 32));
                    
                    console.log(`[DIAGNOSTIC] Regenerated keypair address: ${vaultKeypair.publicKey.toString()}`);
                    console.log(`[DIAGNOSTIC] Expected address: ${vaultAddress}`);
                    
                    if (vaultKeypair.publicKey.toString() === vaultAddress) {
                        console.log(`[METHOD 1] Successfully recreated vault keypair`);
                        
                        // Build the transaction
                        const transaction = new Transaction();
                        
                        // Add compute budget
                        transaction.add(
                            ComputeBudgetProgram.setComputeUnitLimit({
                                units: 400000
                            })
                        );
                        
                        // Get recent blockhash
                        const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
                        transaction.recentBlockhash = blockhash;
                        transaction.feePayer = this.wallet.publicKey;
                        
                        // Add SOL transfer from vault to user wallet
                        console.log(`[METHOD 1] Adding instruction to transfer ${vaultBalance - 5000} lamports from vault to user`);
                        transaction.add(
                            SystemProgram.transfer({
                                fromPubkey: vaultKeypair.publicKey,
                                toPubkey: this.wallet.publicKey,
                                lamports: vaultBalance - 5000 // Leave 5000 lamports for rent
                            })
                        );
                        
                        // Sign the transaction with the vault keypair
                        transaction.partialSign(vaultKeypair);
                        
                        // Sign with wallet
                        console.log(`[METHOD 1] Signing transaction with wallet`);
                        const signedTransaction = await this.signTransaction(transaction);
                        
                        // Send and confirm the transaction
                        console.log(`[METHOD 1] Sending transaction`);
                        const signature = await this.connection.sendRawTransaction(
                            signedTransaction.serialize(),
                            { skipPreflight: true }
                        );
                        
                        console.log(`[METHOD 1] Transaction sent: ${signature}`);
                        
                        // Wait a bit before confirming
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        
                        await confirmTransactionWithRetry(this.connection, signature, 5, 120);
                        console.log(`[METHOD 1] Transaction confirmed!`);
                        
                        // Verify the user received the SOL
                        const userBalanceAfter = await this.connection.getBalance(this.wallet.publicKey);
                        console.log(`[METHOD 1] User balance after: ${userBalanceAfter / LAMPORTS_PER_SOL} SOL`);
                        
                        // Check vault balance again
                        const vaultBalanceAfter = await this.connection.getBalance(vaultKeypair.publicKey);
                        console.log(`[METHOD 1] Vault balance after: ${vaultBalanceAfter / LAMPORTS_PER_SOL} SOL`);
                        
                        if (vaultBalanceAfter > 10000) {
                            console.warn(`[METHOD 1] Vault still has ${vaultBalanceAfter / LAMPORTS_PER_SOL} SOL remaining`);
                        }
                        
                        // Update vaults in localStorage
                        try {
                            const vaults = JSON.parse(localStorage.getItem('vaults') || '[]');
                            const updatedVaults = vaults.filter(v => 
                                v.vaultAddress !== vaultAddress && v.address !== vaultAddress
                            );
                            localStorage.setItem('vaults', JSON.stringify(updatedVaults));
                            console.log(`[METHOD 1] Removed vault from localStorage`);
                        } catch (err) {
                            console.error(`[METHOD 1] Error updating localStorage:`, err);
                        }
                        
                        return {
                            success: true,
                            message: `Successfully closed vault and returned ${(vaultBalance - 5000) / LAMPORTS_PER_SOL} SOL to your wallet`,
                            method: "seed_phrase",
                            signature
                        };
                    } else {
                        console.log(`[METHOD 1] Generated keypair doesn't match expected vault address`);
                    }
                } catch (err) {
                    console.error(`[METHOD 1] Error:`, err);
                }
            }
            
            // =================================================
            // METHOD 2: USE TEMPORARY KEYPAIR AS FEE PAYER
            // =================================================
            console.log(`[METHOD 2] Attempting transfer using temporary keypair`);
            try {
                // Create a temporary keypair for this operation
                const tempKeypair = Keypair.generate();
                
                // Get some SOL for the temp keypair (for devnet only)
                let airdropSuccess = false;
                try {
                    console.log(`[METHOD 2] Requesting airdrop for temp keypair: ${tempKeypair.publicKey.toString()}`);
                    const airdropSignature = await this.connection.requestAirdrop(
                        tempKeypair.publicKey, 
                        0.01 * LAMPORTS_PER_SOL
                    );
                    await this.connection.confirmTransaction(airdropSignature, 'confirmed');
                    console.log(`[METHOD 2] Airdrop successful: ${airdropSignature}`);
                    airdropSuccess = true;
                } catch (airdropErr) {
                    console.error(`[METHOD 2] Airdrop failed:`, airdropErr);
                }
                
                // If airdrop failed, we need to fund the temp account from the user wallet
                if (!airdropSuccess) {
                    console.log(`[METHOD 2] Funding temp keypair from user wallet`);
                    const fundTx = new Transaction();
                    
                    // Get a fresh blockhash
                    const { blockhash: fundBlockhash } = await this.connection.getLatestBlockhash('confirmed');
                    fundTx.recentBlockhash = fundBlockhash;
                    fundTx.feePayer = this.wallet.publicKey;
                    
                    // Add transfer instruction
                    fundTx.add(
                        SystemProgram.transfer({
                            fromPubkey: this.wallet.publicKey,
                            toPubkey: tempKeypair.publicKey,
                            lamports: 0.01 * LAMPORTS_PER_SOL
                        })
                    );
                    
                    // Sign and send
                    const signedFundTx = await this.signTransaction(fundTx);
                    const fundSignature = await this.connection.sendRawTransaction(
                        signedFundTx.serialize(),
                        { skipPreflight: true }
                    );
                    
                    console.log(`[METHOD 2] Funding transaction sent: ${fundSignature}`);
                    await this.connection.confirmTransaction(fundSignature, 'confirmed');
                    console.log(`[METHOD 2] Temp keypair funded`);
                }
                
                // Now create the vault closure transaction
                const transaction = new Transaction();
                
                // Get a fresh blockhash
                const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
                transaction.recentBlockhash = blockhash;
                transaction.feePayer = tempKeypair.publicKey; // Temp keypair pays the fee
                
                // Add compute budget instruction
                transaction.add(
                    ComputeBudgetProgram.setComputeUnitLimit({
                        units: 400000
                    })
                );
                
                // Add instruction to transfer SOL from vault to user
                console.log(`[METHOD 2] Adding instruction to transfer ${vaultBalance - 5000} lamports from vault to user`);
                transaction.add(
                    SystemProgram.transfer({
                        fromPubkey: vaultPubkey,
                        toPubkey: this.wallet.publicKey,
                        lamports: vaultBalance - 5000 // Leave 5000 lamports for rent
                    })
                );
                
                // Sign transaction with temp keypair
                transaction.partialSign(tempKeypair);
                
                // Send the transaction
                console.log(`[METHOD 2] Sending transaction`);
                const signature = await this.connection.sendRawTransaction(
                    transaction.serialize(),
                    { skipPreflight: true }
                );
                
                console.log(`[METHOD 2] Transaction sent: ${signature}`);
                
                // Record user's balance before
                const userBalanceBefore = await this.connection.getBalance(this.wallet.publicKey);
                console.log(`[METHOD 2] User balance before: ${userBalanceBefore / LAMPORTS_PER_SOL} SOL`);
                
                // Wait a bit before confirming
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                await confirmTransactionWithRetry(this.connection, signature, 5, 120);
                console.log(`[METHOD 2] Transaction confirmed!`);
                
                // Verify the user received the SOL
                const userBalanceAfter = await this.connection.getBalance(this.wallet.publicKey);
                console.log(`[METHOD 2] User balance after: ${userBalanceAfter / LAMPORTS_PER_SOL} SOL`);
                const balanceChange = (userBalanceAfter - userBalanceBefore) / LAMPORTS_PER_SOL;
                console.log(`[METHOD 2] Balance change: ${balanceChange} SOL`);
                
                // Check vault balance again
                const vaultBalanceAfter = await this.connection.getBalance(vaultPubkey);
                console.log(`[METHOD 2] Vault balance after: ${vaultBalanceAfter / LAMPORTS_PER_SOL} SOL`);
                
                if (vaultBalanceAfter > 10000) {
                    console.warn(`[METHOD 2] Vault still has ${vaultBalanceAfter / LAMPORTS_PER_SOL} SOL remaining`);
                }
                
                // Update vaults in localStorage
                try {
                    const vaults = JSON.parse(localStorage.getItem('vaults') || '[]');
                    const updatedVaults = vaults.filter(v => 
                        v.vaultAddress !== vaultAddress && v.address !== vaultAddress
                    );
                    localStorage.setItem('vaults', JSON.stringify(updatedVaults));
                    console.log(`[METHOD 2] Removed vault from localStorage`);
                } catch (err) {
                    console.error(`[METHOD 2] Error updating localStorage:`, err);
                }
                
                return {
                    success: true,
                    message: `Successfully closed vault and returned ${(vaultBalance - 5000) / LAMPORTS_PER_SOL} SOL to your wallet`,
                    method: "temp_keypair",
                    signature
                };
            } catch (err) {
                console.error(`[METHOD 2] Error:`, err);
            }
            
            // =================================================
            // METHOD 3: ABSOLUTE FALLBACK - DIRECT WALLET RECOVERY
            // =================================================
            console.log(`[METHOD 3] Attempting direct wallet recovery`);
            try {
                // Tell the user the exact amount to ask for in the direct SOL recovery process
                return {
                    success: false, 
                    tempSolution: true,
                    error: `Please use the Force SOL Recovery button, as the regular vault closure couldn't access your SOL.`,
                    vaultBalance: vaultBalance / LAMPORTS_PER_SOL,
                    message: `Unable to close vault through normal methods. Use Force SOL Recovery.`
                };
            } catch (err) {
                console.error(`[METHOD 3] Error:`, err);
            }
            
            return {
                success: false,
                error: "All vault closure methods failed. Please try the Force SOL Recovery button instead."
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

            // Add instruction to burn SAI tokens - FIX THE PARAMETER ORDER
            transaction.add(
                createBurnInstruction(
                    userTokenAccount,  // account (not mint)
                    this.saiMint,      // mint
                    this.wallet.publicKey,  // owner
                    saiRaw,            // amount
                    []                 // signers
                )
            );

            // Get recent blockhash
            const { blockhash } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.wallet.publicKey;

            console.log("Transaction prepared, signing with wallet");
            
            try {
                // Sign with our enhanced signing method
                const signedTransaction = await this.signTransaction(transaction);
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

    // Add emergency SOL recovery method as a fallback when normal vault closure fails
    async emergencyRecoverSol(vaultAddress) {
        try {
            console.log(`[EMERGENCY RECOVERY] Starting recovery for vault ${vaultAddress}`);
            
            if (!this.isInitialized()) {
                await this.initialize();
                if (!this.isInitialized()) {
                    throw new Error("API not initialized. Please initialize first.");
                }
            }
            
            // Parse the address
            const vaultPubkey = new PublicKey(vaultAddress);
            
            // Get vault balance
            const vaultBalance = await this.connection.getBalance(vaultPubkey);
            console.log(`[EMERGENCY RECOVERY] Vault balance: ${vaultBalance / LAMPORTS_PER_SOL} SOL`);
            
            if (vaultBalance <= 0) {
                return {
                    success: false,
                    error: "Vault has no SOL balance to recover"
                };
            }
            
            // First look for the vault data in localStorage to get the seed phrase
            let seedPhrase = null;
            try {
                const vaults = JSON.parse(localStorage.getItem('vaults') || '[]');
                const vaultData = vaults.find(v => v.vaultAddress === vaultAddress || v.address === vaultAddress);
                
                if (vaultData && vaultData.seedPhrase) {
                    seedPhrase = vaultData.seedPhrase;
                    console.log(`[EMERGENCY RECOVERY] Found seed phrase for vault: ${seedPhrase}`);
                }
            } catch (err) {
                console.error("[EMERGENCY RECOVERY] Error getting vault data:", err);
            }
            
            // Try the simplest approach first - using a new keypair as fee payer
            try {
                console.log("[EMERGENCY RECOVERY] Trying direct SOL recovery");
                
                // Create a new keypair to serve as fee payer
                const recoveryKeypair = Keypair.generate();
                
                // Fund the recovery keypair (using airdrop for devnet)
                const airdropSignature = await this.connection.requestAirdrop(
                    recoveryKeypair.publicKey,
                    0.02 * LAMPORTS_PER_SOL
                );
                
                console.log(`[EMERGENCY RECOVERY] Airdrop requested: ${airdropSignature}`);
                await this.connection.confirmTransaction(airdropSignature, 'confirmed');
                console.log(`[EMERGENCY RECOVERY] Airdrop confirmed`);
                
                // Create the recovery transaction
                const transaction = new Transaction();
                transaction.recentBlockhash = (await this.connection.getLatestBlockhash('confirmed')).blockhash;
                transaction.feePayer = recoveryKeypair.publicKey;
                
                // Add compute budget instruction
                transaction.add(
                    ComputeBudgetProgram.setComputeUnitLimit({
                        units: 400000
                    })
                );
                
                // Best effort to recover most of the SOL (leave some for rent)
                console.log(`[EMERGENCY RECOVERY] Adding transfer instruction for ${(vaultBalance - 10000) / LAMPORTS_PER_SOL} SOL`);
                transaction.add(
                    SystemProgram.transfer({
                        fromPubkey: vaultPubkey,
                        toPubkey: this.wallet.publicKey,
                        lamports: vaultBalance - 10000 // Leave 10000 lamports (0.00001 SOL) for rent
                    })
                );
                
                // Sign with the recovery keypair
                transaction.partialSign(recoveryKeypair);
                
                // If we have a seed phrase, also try to sign with the recreated vault keypair
                if (seedPhrase) {
                    try {
                        // Recreate the vault keypair from seed phrase
                        const seed = new TextEncoder().encode(seedPhrase);
                        const hash = await crypto.subtle.digest('SHA-256', seed);
                        const seedBytes = new Uint8Array(hash);
                        const vaultKeypair = Keypair.fromSeed(seedBytes.slice(0, 32));
                        
                        console.log(`[EMERGENCY RECOVERY] Recreated vault keypair: ${vaultKeypair.publicKey.toString()}`);
                        
                        if (vaultKeypair.publicKey.toString() === vaultAddress) {
                            // Also sign with the vault keypair
                            transaction.partialSign(vaultKeypair);
                            console.log(`[EMERGENCY RECOVERY] Also signed with vault keypair`);
                        }
                    } catch (err) {
                        console.error("[EMERGENCY RECOVERY] Error recreating vault keypair:", err);
                    }
                }
                
                // Send the transaction
                console.log(`[EMERGENCY RECOVERY] Sending recovery transaction`);
                const signature = await this.connection.sendRawTransaction(
                    transaction.serialize(),
                    { skipPreflight: true }
                );
                
                console.log(`[EMERGENCY RECOVERY] Transaction sent: ${signature}`);
                
                // Wait for confirmation with retry
                await confirmTransactionWithRetry(this.connection, signature, 3, 60);
                console.log(`[EMERGENCY RECOVERY] Transaction confirmed successfully`);
                
                // Update localStorage to remove the vault
                try {
                    const vaults = JSON.parse(localStorage.getItem('vaults') || '[]');
                    const updatedVaults = vaults.filter(v => v.vaultAddress !== vaultAddress && v.address !== vaultAddress);
                    localStorage.setItem('vaults', JSON.stringify(updatedVaults));
                    console.log(`[EMERGENCY RECOVERY] Removed vault from localStorage`);
                } catch (err) {
                    console.error("[EMERGENCY RECOVERY] Error updating localStorage:", err);
                }
                
                return {
                    success: true,
                    message: `Successfully recovered ${(vaultBalance - 10000) / LAMPORTS_PER_SOL} SOL from your vault!`,
                    signature
                };
            } catch (err) {
                console.error("[EMERGENCY RECOVERY] Direct recovery failed:", err);
            }
            
            // If we get here, the simple approach failed. Try a more complex approach.
            console.log("[EMERGENCY RECOVERY] Trying alternative approach");
            try {
                // Create a transaction that first sends some SOL to the vault, then tries to get it all back
                const transaction = new Transaction();
                transaction.recentBlockhash = (await this.connection.getLatestBlockhash('confirmed')).blockhash;
                transaction.feePayer = this.wallet.publicKey;
                
                // Add compute budget
                transaction.add(
                    ComputeBudgetProgram.setComputeUnitLimit({
                        units: 400000
                    })
                );
                
                // Send a tiny amount to the vault first
                transaction.add(
                    SystemProgram.transfer({
                        fromPubkey: this.wallet.publicKey,
                        toPubkey: vaultPubkey,
                        lamports: 100000 // 0.0001 SOL
                    })
                );
                
                // Then try to extract the SOL back plus the existing balance
                transaction.add(
                    SystemProgram.transfer({
                        fromPubkey: vaultPubkey,
                        toPubkey: this.wallet.publicKey,
                        lamports: vaultBalance + 90000 // Get back almost everything
                    })
                );
                
                // If we have a seed phrase, also try to sign with the recreated vault keypair
                if (seedPhrase) {
                    try {
                        // Recreate the vault keypair from seed phrase
                        const seed = new TextEncoder().encode(seedPhrase);
                        const hash = await crypto.subtle.digest('SHA-256', seed);
                        const seedBytes = new Uint8Array(hash);
                        const vaultKeypair = Keypair.fromSeed(seedBytes.slice(0, 32));
                        
                        console.log(`[EMERGENCY RECOVERY] Recreated vault keypair: ${vaultKeypair.publicKey.toString()}`);
                        
                        if (vaultKeypair.publicKey.toString() === vaultAddress) {
                            // Also sign with the vault keypair
                            transaction.partialSign(vaultKeypair);
                            console.log(`[EMERGENCY RECOVERY] Signed with vault keypair`);
                        }
                    } catch (err) {
                        console.error("[EMERGENCY RECOVERY] Error recreating vault keypair:", err);
                    }
                }
                
                // Sign the transaction with wallet
                console.log("[EMERGENCY RECOVERY] Signing transaction with wallet");
                const signedTransaction = await this.signTransaction(transaction);
                
                // Send the transaction
                console.log("[EMERGENCY RECOVERY] Sending alternative recovery transaction");
                const signature = await this.connection.sendRawTransaction(
                    signedTransaction.serialize(),
                    { skipPreflight: true }
                );
                
                console.log(`[EMERGENCY RECOVERY] Alternative transaction sent: ${signature}`);
                await confirmTransactionWithRetry(this.connection, signature, 3, 60);
                console.log(`[EMERGENCY RECOVERY] Alternative transaction confirmed`);
                
                // Update localStorage to remove the vault
                try {
                    const vaults = JSON.parse(localStorage.getItem('vaults') || '[]');
                    const updatedVaults = vaults.filter(v => v.vaultAddress !== vaultAddress && v.address !== vaultAddress);
                    localStorage.setItem('vaults', JSON.stringify(updatedVaults));
                    console.log(`[EMERGENCY RECOVERY] Removed vault from localStorage`);
                } catch (err) {
                    console.error("[EMERGENCY RECOVERY] Error updating localStorage:", err);
                }
                
                return {
                    success: true,
                    message: `Successfully recovered SOL from your vault using alternative method!`,
                    signature
                };
            } catch (err) {
                console.error("[EMERGENCY RECOVERY] Alternative approach failed:", err);
            }
            
            // If we get here, all automated approaches failed
            return {
                success: false,
                error: "Automated recovery failed. Please manually send some SOL to this address and try again, or contact support."
            };
        } catch (error) {
            console.error("[EMERGENCY RECOVERY] Critical error:", error);
            return {
                success: false,
                error: `Emergency recovery failed: ${error.message}`
            };
        }
    }
}