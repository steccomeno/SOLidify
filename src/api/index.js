import { SolanaAPI } from './solana';
import { connection } from '../utils/walletUtils';
import { Connection, PublicKey } from '@solana/web3.js';

// Define PROGRAM_ID with the same value as in solana.js
const PROGRAM_ID = new PublicKey('GY7XKMrF4VMLBou37oBieKzRM6YZJHnjnic5sorE4rRU');

let solanaAPI = null;
let api = null;

// Updated RPC endpoints list with free alternatives only
const RPC_ENDPOINTS = {
  devnet: [
    "https://api.devnet.solana.com", 
    "https://solana-devnet-rpc.publicnode.com",
    "https://devnet.genesysgo.net",
    "https://rpc.ankr.com/solana_devnet",
    "https://devnet.clockwork.xyz",
    "https://solana-devnet.runnode.com"
  ],
  mainnet: [
    "https://api.mainnet-beta.solana.com",
    "https://solana-mainnet-rpc.publicnode.com",
    "https://rpc.ankr.com/solana",
    "https://solana.nima.enterprises"
  ]
};

// Store connection stats to improve endpoint selection
const connectionStats = {
  lastUsed: {},
  successRates: {},
  responseTimesMs: {},
  rateLimitHits: {}
};

// Initialize stats for all endpoints
for (const network in RPC_ENDPOINTS) {
  RPC_ENDPOINTS[network].forEach(endpoint => {
    connectionStats.lastUsed[endpoint] = 0;
    connectionStats.successRates[endpoint] = 1; // Start optimistic
    connectionStats.responseTimesMs[endpoint] = 500; // Default assumption
    connectionStats.rateLimitHits[endpoint] = 0;
  });
}

// Get next best endpoint based on rotation, success rates, and time since last use
function getNextEndpoint(network = 'devnet', excludeEndpoints = []) {
  const endpoints = RPC_ENDPOINTS[network] || RPC_ENDPOINTS.devnet;
  const now = Date.now();
  
  // If all endpoints are excluded, reset exclusions but apply a penalty
  if (excludeEndpoints.length >= endpoints.length) {
    console.warn('All endpoints have been tried and excluded. Resetting exclusions with penalties.');
    excludeEndpoints = [];
    
    // Apply temporary penalties to all endpoints
    endpoints.forEach(endpoint => {
      connectionStats.successRates[endpoint] = Math.max(0.1, (connectionStats.successRates[endpoint] || 0.5) * 0.5);
      connectionStats.lastUsed[endpoint] = now - 30000; // Make them available again, but with a 30s penalty
    });
  }
  
  // Calculate a score for each endpoint
  const scoredEndpoints = endpoints
    .filter(endpoint => !excludeEndpoints.includes(endpoint)) // Skip excluded endpoints
    .map(endpoint => {
      const timeSinceLastUse = now - (connectionStats.lastUsed[endpoint] || 0);
      const timeBonus = Math.min(timeSinceLastUse / 1000, 30); // Max 30 second bonus
      const successRate = connectionStats.successRates[endpoint] || 0.5;
      const responseTime = connectionStats.responseTimesMs[endpoint] || 1000;
      const rateLimitPenalty = connectionStats.rateLimitHits[endpoint] * 10;
      
      // Higher score is better: prioritize success rate, time since last use, and fast response times
      const score = (successRate * 100) + timeBonus - (responseTime / 100) - rateLimitPenalty;
      
      return { endpoint, score };
    });
  
  // If no valid endpoints after filtering, use any endpoint
  if (scoredEndpoints.length === 0) {
    const randomIndex = Math.floor(Math.random() * endpoints.length);
    const randomEndpoint = endpoints[randomIndex];
    console.warn(`No valid endpoints available after filtering. Using random endpoint: ${randomEndpoint}`);
    
    // Mark as used
    connectionStats.lastUsed[randomEndpoint] = now;
    return randomEndpoint;
  }
  
  // Sort by score descending
  scoredEndpoints.sort((a, b) => b.score - a.score);
  
  // Mark as used
  const selectedEndpoint = scoredEndpoints[0].endpoint;
  connectionStats.lastUsed[selectedEndpoint] = now;
  
  console.log(`Selected RPC endpoint: ${selectedEndpoint} (score: ${scoredEndpoints[0].score.toFixed(2)})`);
  return selectedEndpoint;
}

// Update endpoint stats after a request
function updateEndpointStats(endpoint, success, responseTimeMs, wasRateLimit = false) {
  // Update success rate using weighted average (recent results matter more)
  const currentRate = connectionStats.successRates[endpoint] || 0.5;
  connectionStats.successRates[endpoint] = currentRate * 0.7 + (success ? 0.3 : 0);
  
  // Update response time using weighted average
  if (responseTimeMs && responseTimeMs > 0) {
    const currentTime = connectionStats.responseTimesMs[endpoint] || 500;
    connectionStats.responseTimesMs[endpoint] = currentTime * 0.7 + responseTimeMs * 0.3;
  }
  
  // Track rate limit hits
  if (wasRateLimit) {
    connectionStats.rateLimitHits[endpoint] = (connectionStats.rateLimitHits[endpoint] || 0) + 1;
    // Slowly decay rate limit hits over time
    setTimeout(() => {
      if (connectionStats.rateLimitHits[endpoint] > 0) {
        connectionStats.rateLimitHits[endpoint]--;
      }
    }, 60000); // Reduce penalty after 1 minute
  }
}

// Enhanced connection creation with endpoint rotation
async function createConnectionWithFallback(network = 'devnet', retryCount = 0, usedEndpoints = []) {
  // Safety check to prevent infinite recursion
  if (retryCount >= RPC_ENDPOINTS[network].length * 2) {
    console.error('All RPC endpoints failed after maximum retries');
    throw new Error('Unable to connect to Solana network: All RPC endpoints failed');
  }

  // Get next best endpoint, excluding previously used ones
  const endpoint = getNextEndpoint(network, usedEndpoints);
  
  // Track this attempt
  const updatedUsedEndpoints = [...usedEndpoints, endpoint];
  
  console.log(`Creating connection to ${endpoint} (attempt ${retryCount + 1})`);
  
  try {
    const startTime = performance.now();
    
    // Create connection with optimized parameters
    const connection = new Connection(endpoint, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000, // 60 seconds
      disableRetryOnRateLimit: false
    });
    
    // Test the connection
    await connection.getVersion();
    
    const endTime = performance.now();
    const responseTime = endTime - startTime;
    
    console.log(`Successfully connected to ${endpoint} in ${responseTime.toFixed(2)}ms`);
    
    // Store custom properties on the connection object
    connection._endpoint = endpoint;
    connection._network = network;
    
    // Update stats
    updateEndpointStats(endpoint, true, responseTime);
    
    return connection;
  } catch (error) {
    const isRateLimit = error.message?.includes('429') || 
                        error.message?.includes('rate limit') || 
                        error.message?.includes('Connection rate limits exceeded');
    
    console.error(`Failed to connect to ${endpoint}:`, error.message);
    
    // Update stats
    updateEndpointStats(endpoint, false, null, isRateLimit);
    
    // Check if we should retry
    if (retryCount < RPC_ENDPOINTS[network].length * 2) {
      console.log(`Falling back to next RPC endpoint...`);
      // Use exponential backoff
      const delay = Math.min(500 * (retryCount + 1), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
      return createConnectionWithFallback(network, retryCount + 1, updatedUsedEndpoints);
    } else {
      console.error('All RPC endpoints failed');
      throw new Error('Unable to connect to Solana network: All RPC endpoints failed');
    }
  }
}

// Export getConnection function that uses the enhanced rotation mechanism
export const getConnection = async (network = 'devnet') => {
  try {
    return await createConnectionWithFallback(network);
  } catch (error) {
    console.error('Failed to establish connection:', error);
    throw error;
  }
};

// Make rotation system available globally
if (typeof window !== 'undefined') {
  window.solanaRpcSystem = {
    getNextEndpoint,
    updateEndpointStats,
    getStats: () => ({ ...connectionStats }),
    forceEndpoint: (endpoint) => {
      if (RPC_ENDPOINTS.devnet.includes(endpoint) || RPC_ENDPOINTS.mainnet.includes(endpoint)) {
        connectionStats.lastUsed[endpoint] = 0; // Reset last used time to prioritize this endpoint
        connectionStats.successRates[endpoint] = 1; // Set high success rate
        return true;
      }
      return false;
    }
  };
}

// Mock wallet connection function
export const connectWallet = async () => {
    console.log('Attempting to connect wallet...');
    
    // Check if Phantom is installed
    if (!window.solana || !window.solana.isPhantom) {
        console.error('Phantom wallet not detected');
        return {
            success: false,
            error: 'Phantom wallet not installed. Please install Phantom from https://phantom.app/'
        };
    }
    
    try {
        // Check if already connected
        if (window.solana.isConnected) {
            console.log('Wallet already connected, returning current connection');
            try {
                // Force disconnect and reconnect to ensure fresh connection
                await window.solana.disconnect();
                console.log('Forced disconnect for a fresh connection');
                // Small delay before reconnecting
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (discError) {
                console.log('Error during disconnect (can be ignored):', discError);
            }
        }
        
        console.log('Requesting Phantom wallet connection...');
        const response = await window.solana.connect();
        
        console.log('Phantom wallet connected successfully:', {
            publicKey: response.publicKey.toString(),
            isConnected: window.solana.isConnected
        });
        
        // Add wallet to global window for easier debugging
        window.phantomWallet = {
            publicKey: response.publicKey.toString(),
            isConnected: window.solana.isConnected
        };
        
        return {
            success: true,
            publicKey: response.publicKey.toString()
        };
    } catch (error) {
        console.error('Error connecting to Phantom wallet:', error);
        
        // Provide user-friendly error message based on error type
        let userMessage = 'Failed to connect wallet: ' + error.message;
        
        if (error.message.includes('declined')) {
            userMessage = 'Connection request declined. Please approve the connection request in your Phantom wallet.';
        } else if (error.message.includes('timeout')) {
            userMessage = 'Connection request timed out. Please try again and respond to the wallet prompt.';
        } else if (error.message.includes('already in progress')) {
            userMessage = 'A connection request is already pending. Please check your Phantom wallet for a connection prompt.';
        }
        
        return {
            success: false,
            error: userMessage
        };
    }
};

// Updated initialize function with recovery logic
export const initialize = async () => {
  try {
    console.log('Initializing API with automatic RPC endpoint rotation');
    
    // Use enhanced getConnection instead of directly creating a Connection
    let connection = null;
    try {
      connection = await getConnection('devnet');
      console.log('Connection established with endpoint:', connection.rpcEndpoint);
    } catch (connectionError) {
      console.error('Failed to establish connection with rotation system:', connectionError);
      
      // Emergency fallback to default RPC endpoint
      console.warn('Falling back to default RPC endpoint as last resort');
      connection = new Connection('https://api.devnet.solana.com', {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 30000
      });
    }
    
    console.log('Using automatic endpoint rotation for better reliability');
    return connection;
  } catch (error) {
    console.error('Fatal error initializing API:', error);
    throw error;
  }
};

// Add a flag to the SolanaAPI instance to indicate fast mode
let isFastMode = false;

// Updated initializeAPI function that works with any wallet adapter
export const initializeAPI = async (wallet) => {
    try {
        console.log("Starting API initialization with raw wallet instance");
        
        // Check if API is already initialized with a wallet
        if (solanaAPI && solanaAPI.wallet && solanaAPI.wallet.publicKey) {
            const existingPubKey = solanaAPI.wallet.publicKey.toString();
            const currentPubKey = wallet.publicKey ? wallet.publicKey.toString() : null;
            
            console.log("API already has a wallet with public key:", existingPubKey);
            console.log("Current wallet has public key:", currentPubKey);
            
            // If current wallet matches existing one, just return true
            if (currentPubKey && existingPubKey === currentPubKey) {
                console.log("API already initialized with this wallet, reusing existing initialization");
                return true;
            }
            
            // If a different wallet is trying to initialize, log a warning
            if (currentPubKey && existingPubKey !== currentPubKey) {
                console.warn("WARNING: Attempting to reinitialize API with a different wallet!");
                console.warn(`Existing: ${existingPubKey}, New: ${currentPubKey}`);
                // We'll continue with the existing wallet, not replace it
                return true;
            }
        }
        
        // Validate wallet is available
        if (!wallet) {
            console.error("No wallet provided for initialization");
            return false;
        }
        
        // Detailed debug logging of wallet object
        console.log("Wallet debug info:", {
            type: typeof wallet,
            keys: Object.keys(wallet),
            hasPublicKey: !!wallet.publicKey,
            publicKeyType: wallet.publicKey ? typeof wallet.publicKey : 'undefined',
            publicKeyToString: wallet.publicKey ? 
                (typeof wallet.publicKey.toString === 'function' ? wallet.publicKey.toString() : 'no toString method') 
                : 'no publicKey',
            hasAdapter: !!wallet.adapter,
            adapterKeys: wallet.adapter ? Object.keys(wallet.adapter) : []
        });
        
        // Try to extract a usable public key
        let publicKey = null;
        if (wallet.publicKey) {
            publicKey = wallet.publicKey;
            console.log("Using direct publicKey from wallet");
        } else if (wallet.adapter && wallet.adapter.publicKey) {
            publicKey = wallet.adapter.publicKey;
            console.log("Using publicKey from wallet.adapter");
        } else {
            // Last resort - try to find anything that looks like a public key
            for (const key of Object.keys(wallet)) {
                if (wallet[key] && typeof wallet[key] === 'object' && wallet[key].toBase58) {
                    publicKey = wallet[key];
                    console.log(`Found publicKey in wallet.${key}`);
                    break;
                }
            }
        }
        
        // Verify we have a usable public key
        if (!publicKey) {
            console.error("Could not find usable public key in wallet object");
            return false;
        }
        
        // Create or reuse SolanaAPI instance
        if (!solanaAPI) {
            console.log("Creating new SolanaAPI instance");
            solanaAPI = new SolanaAPI();
        }
        
        // Create a standardized wallet interface that works with any adapter
        const standardizedWallet = {
            publicKey: publicKey,
            signTransaction: async (tx) => {
                console.log("Signing transaction with wallet adapter");
                
                // Try multiple signing methods in order
                if (wallet.signTransaction) {
                    return wallet.signTransaction(tx);
                } else if (wallet.adapter && wallet.adapter.signTransaction) {
                    return wallet.adapter.signTransaction(tx);
                } else if (window.solflare && window.solflare.signTransaction) {
                    return window.solflare.signTransaction(tx);
                } else if (window.solana && window.solana.signTransaction) {
                    return window.solana.signTransaction(tx);
                }
                
                throw new Error("No method to sign transaction found");
            },
            signAllTransactions: async (txs) => {
                console.log("Signing multiple transactions with wallet adapter");
                
                // Try multiple signing methods in order
                if (wallet.signAllTransactions) {
                    return wallet.signAllTransactions(txs);
                } else if (wallet.adapter && wallet.adapter.signAllTransactions) {
                    return wallet.adapter.signAllTransactions(txs);
                } else if (window.solflare && window.solflare.signAllTransactions) {
                    return window.solflare.signAllTransactions(txs);
                } else if (window.solana && window.solana.signAllTransactions) {
                    return window.solana.signAllTransactions(txs);
                }
                
                throw new Error("No method to sign multiple transactions found");
            },
            connected: true
        };
        
        // Set the standardized wallet directly
        solanaAPI.wallet = standardizedWallet;
        
        // Initialize the API (with the wallet already set)
        console.log("Initializing SolanaAPI with standardized wallet...");
        const initialized = await solanaAPI.initialize();
        if (!initialized) {
            console.error("Failed to initialize SolanaAPI");
            return false;
        }
        
        // Make global API available
        api = solanaAPI;
        
        console.log("API initialization completed successfully");
        return true;
    } catch (error) {
        console.error("API initialization failed:", error);
        return false;
    }
};

// Check if API is initialized
export const isAPIInitialized = () => {
    // First check if the API is initialized in memory
    const memoryInitialized = !!solanaAPI && solanaAPI.isInitialized && !!solanaAPI.wallet;
    
    // If initialized in memory, return true immediately
    if (memoryInitialized) {
        return true;
    }
    
    // If not in memory, check if we have initialization flag in localStorage
    try {
        const storedInitialized = localStorage.getItem('solidify_api_initialized') === 'true';
        const storedWallet = localStorage.getItem('solidify_initialized_wallet');
        
        if (storedInitialized && storedWallet) {
            console.log("API not initialized in memory but found initialization flag in localStorage");
            console.log("Previously initialized with wallet:", storedWallet);
            return true;
        }
    } catch (e) {
        // Ignore localStorage errors
    }
    
    // If we get here, API is not initialized
    return false;
};

// Get token balances with better error handling
export const getTokenBalances = async (publicKey) => {
    try {
        if (!solanaAPI) {
            console.error("API not initialized");
            throw new Error("API not initialized. Please connect your wallet.");
        }
        
        // Check if we have cached balances from a recent transaction
        if (solanaAPI._cachedBalances) {
            console.log("Using cached balances:", solanaAPI._cachedBalances);
            const cachedBalances = solanaAPI._cachedBalances;
            
            // Clear the cache so future calls will fetch fresh balances
            solanaAPI._cachedBalances = null;
            
            return cachedBalances;
        }
        
        // If no cache, get actual balances
        return await solanaAPI.getTokenBalances(publicKey);
    } catch (error) {
        console.error("Error getting token balances:", error);
        // Return zero balances instead of throwing
        return { sol: 0, sai: 0 };
    }
};

// Export createCDP function with better error handling
export const createCDP = async (collateralAmount, saiAmount) => {
    try {
        console.log(`Creating CDP with ${collateralAmount} SOL and ${saiAmount} SAI`);
        
        // Check if API is initialized
        if (!api) {
            console.error('API not initialized');
            return {
                success: false,
                error: 'API not initialized. Please initialize first.'
            };
        }
        
        // Call the createCDP method on the SolanaAPI instance
        return await api.createCDP(collateralAmount, saiAmount);
    } catch (error) {
        console.error('Error creating CDP:', error);
        return {
            success: false,
            error: error.message || 'Failed to create CDP'
        };
    }
};

export const addCollateral = async (cdpAddress, amount) => {
    if (!solanaAPI) {
        throw new Error('API not initialized. Please connect your wallet first.');
    }
    return await solanaAPI.addCollateral(cdpAddress, amount);
};

export const drawSai = async (cdpAddress, amount) => {
    if (!solanaAPI) {
        throw new Error('API not initialized. Please connect your wallet first.');
    }
    return await solanaAPI.drawSai(cdpAddress, amount);
};

export const repaySai = async (cdpAddress, amount) => {
    if (!solanaAPI) {
        throw new Error('API not initialized. Please connect your wallet first.');
    }
    return await solanaAPI.repaySai(cdpAddress, amount);
};

export const closeCDP = async (cdpAddress) => {
    if (!solanaAPI) {
        throw new Error('API not initialized. Please connect your wallet first.');
    }
    return await solanaAPI.closeCDP(cdpAddress);
};

export const getUserCDPs = async () => {
    if (!solanaAPI) {
        throw new Error('API not initialized. Please connect your wallet first.');
    }
    
    // Handle case where program failed to initialize
    if (!solanaAPI.program) {
        console.warn('Program not initialized, returning empty CDP list');
        return {
            success: true,
            data: []
        };
    }
    
    try {
        return await solanaAPI.getUserCDPs();
    } catch (error) {
        console.error('Error fetching user CDPs:', error);
        return {
            success: false,
            error: error.message || 'Failed to fetch user CDPs'
        };
    }
};

export const getCDPInfo = async (cdpAddress) => {
    if (!solanaAPI) {
        throw new Error('API not initialized. Please connect your wallet first.');
    }
    return await solanaAPI.getCDPInfo(cdpAddress);
};

// Keep the mock functions for development/testing
export const getWalletBalance = async () => {
    if (!solanaAPI) {
        throw new Error('API not initialized. Please connect your wallet first.');
    }
    
    try {
        return await solanaAPI.getTokenBalances();
    } catch (error) {
        console.error('Error getting wallet balance:', error);
        return {
            sol: 0,
            sai: 0,
        };
    }
};

export const getCollateralPrice = async (collateralType) => {
    // TODO: Implement real price feed
    return 15; // Mock SOL price in USD
};

export const checkVaultLiquidationRisk = async (cdpAddress) => {
    if (!solanaAPI) {
        throw new Error('API not initialized. Please connect your wallet first.');
    }
    const cdpInfo = await solanaAPI.getCDPInfo(cdpAddress);
    if (!cdpInfo.success) {
        throw new Error('Failed to get CDP info');
    }
    
    const collateralPrice = await getCollateralPrice(cdpInfo.data.collateralType);
    const collateralValue = cdpInfo.data.collateralAmount * collateralPrice;
    const collateralizationRatio = (collateralValue / cdpInfo.data.saiDebt) * 100;
    
    return {
        ratio: collateralizationRatio,
        status: collateralizationRatio >= 150 ? 'safe' : 'at_risk',
        liquidationPrice: (cdpInfo.data.saiDebt * 1.5) / cdpInfo.data.collateralAmount
    };
};

export const getAllActiveLiquidations = async () => {
    if (!solanaAPI) {
        throw new Error('API not initialized. Please connect your wallet first.');
    }
    // TODO: Implement real liquidation fetching
    return [];
};

// Mock governance functions
export const getProposals = async () => {
  await delay(1000);
  return mockProposals;
};

export const getProposalDetails = async (proposalId) => {
  await delay(800);
  const proposal = mockProposals.find(p => p.id === proposalId);
  if (!proposal) {
    throw new Error('Proposal not found');
  }
  return proposal;
};

export const castVote = async (proposalId, vote) => {
  await delay(1200);
  
  // Validate vote
  if (vote !== 'for' && vote !== 'against') {
    throw new Error('Invalid vote. Must be "for" or "against"');
  }
  
  // Check if proposal is active
  const proposal = await getProposalDetails(proposalId);
  if (proposal.status !== 'active') {
    throw new Error('Cannot vote on a proposal that is not active');
  }
  
  return {
    success: true,
    message: `Vote cast successfully for proposal ${proposalId}`,
  };
};

export const createProposal = async (title, description, changes) => {
  await delay(1500);
  
  if (!title || !description || !changes) {
    throw new Error('Title, description, and changes are required');
  }
  
  return {
    success: true,
    proposalId: `prop-${Math.random().toString(36).substr(2, 9)}`,
    message: 'Proposal created successfully',
  };
};

// Export aliases for function names that are used in the components
export const getAllProposals = getProposals;
export const getUserSLDBalance = async () => {
  await delay(800);
  return 5000; // Mock SLD balance
};
export const getGovernanceData = async () => {
  await delay(800);
  return {
    totalSLD: 10000000,
    activeProposals: 2,
    totalVotes: 2050000
  };
};
export const executeProposal = async (proposalId) => {
  await delay(1000);
  return true;
};

export const getLiquidationHistoryForUser = async () => {
    if (!solanaAPI) {
        throw new Error('API not initialized. Please connect your wallet first.');
    }
    // TODO: Implement real liquidation history fetching
    return [];
};

export const bidOnLiquidationAuction = async (auctionId, bidAmount) => {
    if (!solanaAPI) {
        throw new Error('API not initialized. Please connect your wallet first.');
    }
    // TODO: Implement real auction bidding
    return {
        success: true,
        message: 'Bid placed successfully'
    };
};

// New function to transfer SAI tokens
export const transferSai = async (recipientAddress, amount) => {
    if (!solanaAPI) {
        throw new Error('API not initialized. Please connect your wallet first.');
    }
    
    try {
        return await solanaAPI.transferToken(recipientAddress, amount);
    } catch (error) {
        console.error('Error transferring SAI tokens:', error);
        return {
            success: false,
            error: error.message || 'Failed to transfer SAI tokens'
        };
    }
};

// Export closeVault function to allow users to get their SOL back
export const closeVault = async (vaultAddress, tokenMint, tokenAmount) => {
    try {
        if (!solanaAPI) {
            console.error("API not initialized");
            throw new Error("API not initialized. Please connect your wallet.");
        }
        
        return await solanaAPI.closeVault(vaultAddress, tokenMint, tokenAmount);
    } catch (error) {
        console.error("Error closing vault:", error);
        return {
            success: false,
            error: error.message || "Failed to close vault"
        };
    }
};

async function verifyWalletConnection() {
    // Try to detect and connect to Solflare if it exists but isn't connected
    if (window.solflare && !window.solflare.isConnected) {
        console.log("Solflare detected but not connected. Attempting to connect...");
        try {
            await window.solflare.connect();
            console.log("Solflare connected successfully");
            return true;
        } catch (e) {
            console.error("Error connecting to Solflare:", e);
        }
    }
    
    // Try to detect and connect to Phantom if it exists but isn't connected  
    if (window.solana && !window.solana.isConnected) {
        console.log("Phantom detected but not connected. Attempting to connect...");
        try {
            await window.solana.connect();
            console.log("Phantom connected successfully");
            return true;
        } catch (e) {
            console.error("Error connecting to Phantom:", e);
        }
    }
    
    // Return true if any wallet is already connected
    if ((window.solflare && window.solflare.isConnected) || 
        (window.solana && window.solana.isConnected)) {
        console.log("Wallet already connected");
        return true;
    }
    
    console.warn("No connected wallet found and unable to auto-connect");
    return false;
}

async function initWalletApi() {
    console.log("Initializing wallet API...");
    
    // First verify wallet connections
    await verifyWalletConnection();

    // Now set up the API with a safely wrapped wallet
    const wallet = getWallet();
    
    if (!wallet) {
        console.warn("No wallet available for API initialization");
        return false;
    }
    
    // Create a safe wrapper around the wallet
    const safeWallet = createSafeWalletWrapper(wallet);
    
    // Use the safe wrapper for the API
    solanaApi.wallet = safeWallet;
    
    // Try to set the SAI mint to a stored value if it exists
    const storedSaiMint = localStorage.getItem('sai_token_mint');
    if (storedSaiMint) {
        try {
            solanaApi.saiMint = new PublicKey(storedSaiMint);
            console.log("Using stored SAI mint:", solanaApi.saiMint.toString());
        } catch (err) {
            console.error("Error parsing stored SAI mint:", err);
        }
    }

    // Initialize the API
    const initialized = await solanaApi.initialize();
    
    if (initialized) {
        console.log("Wallet API initialized successfully");
        isFastMode = true;
        
        try {
            // Get token accounts and balances
            const balances = await solanaApi.getTokenBalances();
            console.log("Initial balances:", balances);
        } catch (error) {
            console.error("Error getting initial balances:", error);
        }
    } else {
        console.error("Failed to initialize wallet API");
    }
    
    return initialized;
}

// Initialize the API
export const init = async (wallet = null) => {
    try {
        if (isAPIInitialized() && wallet === null) {
            console.log('API already initialized');
            return true;
        }

        // Initialize wallet API
        const success = await initWalletApi();
        
        if (success) {
            // Try to auto-create token account if needed
            try {
                await solanaAPI.ensureSaiTokenAccount();
            } catch (e) {
                console.warn('Failed to ensure SAI token account:', e);
            }
        }
        
        return success;
    } catch (error) {
        console.error('API initialization error:', error);
        return false;
    }
};

// Add utility function to create a more reliable wallet wrapper
function createSafeWalletWrapper(wallet) {
    // Return a proxy-like object that safely wraps the wallet
    return {
        publicKey: wallet.publicKey,
        
        // Safe signing implementation that avoids using this.emit
        signTransaction: async (transaction) => {
            console.log("Using safe signTransaction wrapper");
            
            // First try direct wallet object if Solflare is present
            if (window.solflare && window.solflare.isConnected) {
                try {
                    console.log("Using Solflare window object for signing");
                    return await window.solflare.signTransaction(transaction);
                } catch (err) {
                    console.error("Solflare window signing failed:", err);
                }
            }
            
            // Try Phantom if available
            if (window.solana && window.solana.isConnected) {
                try {
                    console.log("Using Phantom window object for signing");
                    return await window.solana.signTransaction(transaction);
                } catch (err) {
                    console.error("Phantom window signing failed:", err);
                }
            }
            
            // Last resort: use wallet adapter's method directly but with safe call
            console.log("Using direct function call for signing");
            const walletSignMethod = wallet.signTransaction;
            
            return new Promise((resolve, reject) => {
                try {
                    const result = walletSignMethod(transaction);
                    if (result instanceof Promise) {
                        result.then(resolve).catch(reject);
                    } else {
                        resolve(result);
                    }
                } catch (err) {
                    reject(err);
                }
            });
        },
        
        // Basic methods needed for wallet adapter
        connect: async () => {
            console.log("Using safe connect wrapper");
            if (wallet.connect) {
                return wallet.connect();
            }
        },
        
        disconnect: async () => {
            console.log("Using safe disconnect wrapper");
            if (wallet.disconnect) {
                return wallet.disconnect();
            }
        },
        
        // Pass through any other needed methods
        signAllTransactions: wallet.signAllTransactions,
        signMessage: wallet.signMessage
    };
}

// Update the existing getWallet function to use our wrapper
function getWallet() {
    // Check for Solflare first
    if (window.solflare && window.solflare.isConnected) {
        console.log("Using Solflare wallet");
        return createSafeWalletWrapper({
            publicKey: window.solflare.publicKey,
            signTransaction: window.solflare.signTransaction.bind(window.solflare),
            signAllTransactions: window.solflare.signAllTransactions?.bind(window.solflare),
            signMessage: window.solflare.signMessage?.bind(window.solflare),
            connect: window.solflare.connect?.bind(window.solflare),
            disconnect: window.solflare.disconnect?.bind(window.solflare)
        });
    }
    
    // Then check for Phantom
    if (window.solana && window.solana.isConnected) {
        console.log("Using Phantom wallet");
        return createSafeWalletWrapper({
            publicKey: window.solana.publicKey,
            signTransaction: window.solana.signTransaction.bind(window.solana),
            signAllTransactions: window.solana.signAllTransactions?.bind(window.solana),
            signMessage: window.solana.signMessage?.bind(window.solana),
            connect: window.solana.connect?.bind(window.solana),
            disconnect: window.solana.disconnect?.bind(window.solana)
        });
    }
    
    // Fall back to injected wallet
    console.log("No direct wallet found, looking for injected wallet");
    if (window.ethereum && window.ethereum.isSolana) {
        console.log("Using injected Solana wallet");
        return createSafeWalletWrapper({
            publicKey: window.ethereum.publicKey,
            signTransaction: window.ethereum.signTransaction?.bind(window.ethereum),
            signAllTransactions: window.ethereum.signAllTransactions?.bind(window.ethereum),
            signMessage: window.ethereum.signMessage?.bind(window.ethereum),
            connect: window.ethereum.connect?.bind(window.ethereum),
            disconnect: window.ethereum.disconnect?.bind(window.ethereum)
        });
    }
    
    console.warn("No wallet found");
    return null;
}

// Add function to get token info
export const getSaiTokenInfo = () => {
    try {
        // Check if we have detailed token info in localStorage
        const storedInfo = localStorage.getItem('sai_token_info');
        if (storedInfo) {
            try {
                return JSON.parse(storedInfo);
            } catch (e) {
                console.error("Error parsing stored token info:", e);
            }
        }

        // Fallback to just the mint address
        const storedMint = localStorage.getItem('sai_token_mint');
        if (storedMint) {
            return {
                address: storedMint,
                name: "SAI Stablecoin",
                symbol: "SAI",
                decimals: 9,
                created: new Date().toISOString()
            };
        }

        return null;
    } catch (e) {
        console.error("Error getting token info:", e);
        return null;
    }
}; 