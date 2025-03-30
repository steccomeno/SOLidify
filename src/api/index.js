import { SolanaAPI } from './solana';
import { connection } from '../utils/walletUtils';
import { Connection, PublicKey } from '@solana/web3.js';

// Define PROGRAM_ID with the same value as in solana.js
const PROGRAM_ID = new PublicKey('GY7XKMrF4VMLBou37oBieKzRM6YZJHnjnic5sorE4rRU');

let solanaAPI = null;

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
    if (!window.solana) {
        throw new Error('Phantom wallet not found');
    }
    try {
        const response = await window.solana.connect();
        return {
            success: true,
            publicKey: response.publicKey.toString()
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
};

export const isAPIInitialized = () => {
    return solanaAPI !== null;
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

// Updated initializeAPI function with better error handling
export const initializeAPI = async (wallet) => {
    try {
        console.log('API INIT - STEP 1: Starting initialization with wallet details:', {
            hasWallet: !!wallet,
            connected: wallet?.connected,
            hasPublicKey: !!wallet?.publicKey,
            publicKeyStr: wallet?.publicKey?.toString(),
            hasSignTransaction: typeof wallet?.signTransaction === 'function'
        });

        if (!wallet) {
            throw new Error('API INIT ERROR: Wallet object is null or undefined');
        }

        // Handle case where wallet adapter doesn't have public key but Phantom is connected
        if (!wallet.publicKey && window.solana && window.solana.isPhantom && window.solana.isConnected) {
            console.log('API INIT - Wallet adapter missing publicKey but Phantom is connected. Attempting to fix...');
            if (window.solana.publicKey) {
                console.log('API INIT - Found publicKey in window.solana:', window.solana.publicKey.toString());
                // Patch the wallet object
                wallet.publicKey = window.solana.publicKey;
                console.log('API INIT - Patched wallet with publicKey from window.solana');
            } else {
                console.error('API INIT - Phantom is connected but publicKey not available in window.solana');
            }
        }

        if (!wallet.connected && window.solana && window.solana.isPhantom) {
            console.log('API INIT - Wallet not showing as connected, checking Phantom directly...');
            if (window.solana.isConnected) {
                console.log('API INIT - Phantom reports connected status, proceeding anyway');
                // Patch the wallet object
                wallet.connected = true;
                console.log('API INIT - Patched wallet.connected = true');
            } else {
                throw new Error('API INIT ERROR: Wallet is not connected');
            }
        } else if (!wallet.connected) {
            throw new Error('API INIT ERROR: Wallet is not connected');
        }

        if (!wallet.publicKey) {
            throw new Error('API INIT ERROR: Wallet public key is not available');
        }

        if (!wallet.signTransaction || typeof wallet.signTransaction !== 'function') {
            // If window.solana has the signTransaction method, use that
            if (window.solana && typeof window.solana.signTransaction === 'function') {
                console.log('API INIT - Using window.solana.signTransaction');
                wallet.signTransaction = (...args) => window.solana.signTransaction(...args);
            } else {
                throw new Error('API INIT ERROR: Wallet signTransaction function is not available');
            }
        }

        console.log('API INIT - STEP 2: Wallet validated, attempting to create SolanaAPI instance');
        
        // Try to get connection with multiple retries
        let connection = null;
        let connectionAttempts = 0;
        const maxConnectionAttempts = 3;
        
        while (!connection && connectionAttempts < maxConnectionAttempts) {
            try {
                connectionAttempts++;
                console.log(`API INIT - Connection attempt ${connectionAttempts}/${maxConnectionAttempts}`);
                connection = await getConnection('devnet');
            } catch (connectionError) {
                console.error(`API INIT - Connection attempt ${connectionAttempts} failed:`, connectionError);
                
                if (connectionAttempts >= maxConnectionAttempts) {
                    console.error('API INIT - All connection attempts failed, using emergency fallback');
                    // Emergency fallback to default connection
                    connection = new Connection('https://api.devnet.solana.com', 'confirmed');
                } else {
                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }
        
        console.log('Connection established with endpoint:', connection.rpcEndpoint);
        
        // Load token info if available
        try {
            console.log('API INIT - STEP 3: Attempting to load config');
            fetch('/api/config')
                .then(response => response.json())
                .then(data => {
                    console.log('Config loaded:', data);
                })
                .catch(error => {
                    console.error('Could not load config:', error);
                });
        } catch (error) {
            console.warn('API INIT - Config loading not available:', error);
        }

        console.log('API INIT - STEP 4: Creating SolanaAPI instance');
        solanaAPI = new SolanaAPI(wallet, PROGRAM_ID.toString());
        
        // Initialize the API with the connection
        try {
            await solanaAPI.ensureConnection();
            console.log('Connection ensured, initializing program...');
            
            const programInitResult = await solanaAPI.initialize();
            
            if (!programInitResult) {
                // Check if we have specific error information
                if (window.solanaInitError) {
                    console.error('Program initialization failed with error:', window.solanaInitError.message);
                    console.error('Original error:', window.solanaInitError.originalError);
                    
                    // If it's a rate limit or network issue, we can try to recover
                    if (window.solanaInitError.message.includes('Rate limit') || 
                        window.solanaInitError.message.includes('Network error')) {
                        
                        console.log('Attempting recovery with different connection...');
                        
                        // Try a different endpoint
                        await refreshConnection();
                        
                        // Wait a moment
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        
                        // Try initialization again
                        const secondAttemptResult = await solanaAPI.initialize();
                        
                        if (!secondAttemptResult) {
                            throw new Error(`Failed to initialize Solana program after multiple attempts: ${window.solanaInitError.message}`);
                        } else {
                            console.log('Program initialization succeeded on second attempt');
                        }
                    } else {
                        throw new Error(`Failed to initialize Solana program: ${window.solanaInitError.message}`);
                    }
                } else {
                    throw new Error('Failed to initialize Solana program: Unknown error');
                }
            }
        } catch (initError) {
            console.error('Program initialization failed:', initError);
            
            // Check if we have a fallback method for simple operations
            console.log('Attempting to configure minimal API functionality...');
            
            // Set up minimal functionality
            solanaAPI.program = null;
            solanaAPI.getTokenBalances = async function() {
                try {
                    // Basic SOL balance check that doesn't require program
                    if (this.wallet && this.wallet.publicKey && this.connection) {
                        const solBalance = await this.connection.getBalance(this.wallet.publicKey);
                        return {
                            sol: solBalance / 1_000_000_000,
                            sai: 0
                        };
                    }
                    return { sol: 0, sai: 0 };
                } catch (e) {
                    console.error('Error in minimal getTokenBalances:', e);
                    return { sol: 0, sai: 0 };
                }
            };
            
            // Throw the original error for handling
            throw initError;
        }
        
        // Make the API available globally for debugging
        window.solanaAPI = solanaAPI;
        
        console.log('API INIT - STEP 5: SolanaAPI instance created successfully');
        
        // Test the connection by getting balances
        console.log('API INIT - STEP 6: Testing connection by fetching balances');
        solanaAPI.getTokenBalances()
            .then(balances => {
                console.log('Initial balances fetched:', balances);
            })
            .catch(error => {
                console.error('Error fetching initial balances:', error);
            });
        
        console.log('API INIT - COMPLETE: API initialized successfully');
        return true;
    } catch (error) {
        console.error('API INIT - CRITICAL ERROR:', error);
        solanaAPI = null;
        throw error;
    }
};

export const createCDP = async (collateralAmount, saiAmount) => {
    if (!solanaAPI) {
        throw new Error('API not initialized. Please connect your wallet first.');
    }
    return await solanaAPI.createCDP(collateralAmount, saiAmount);
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
export const getProposalInfo = getProposalDetails;
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

// Function for admin to mint test SAI tokens
export const mintTestSAI = async (amount) => {
    if (!solanaAPI) {
        throw new Error('API not initialized. Please connect your wallet first.');
    }
    
    try {
        // Check if the caller is the admin
        if (solanaAPI.wallet.publicKey.toString() !== '9J5dNhAcuTs9HqWksBTy3iPvTieH2B8ETtE1td7zr4K1') {
            return {
                success: false,
                error: 'Only the admin can mint test tokens'
            };
        }
        
        console.log(`Admin attempting to mint ${amount} SAI tokens for testing...`);
        
        // Call the mintSai function in the solanaAPI
        return await solanaAPI.mintTestSAI(amount);
    } catch (error) {
        console.error('Error minting test SAI:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

// Add getTokenBalances function before the exports
export const getTokenBalances = async () => {
    if (!solanaAPI) {
        console.warn('getTokenBalances: Solana API not initialized');
        return {
            success: false,
            error: 'Wallet not connected'
        };
    }
    
    try {
        return await solanaAPI.getTokenBalances();
    } catch (error) {
        console.error('Error getting token balances:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

// Keep only one export list
// Remove initialize, getConnection, and connectWallet since they're already exported earlier
export {
    getWalletBalance,
    getUserCDPs,
    getCDPInfo,
    createCDP,
    closeCDP,
    drawSai,
    repaySai,
    addCollateral,
    // Governance
    getGovernanceData,
    getUserSLDBalance,
    getProposals,
    getProposalInfo,
    createProposal,
    castVote,
    executeProposal,
    getProposalDetails,
    getAllProposals,
    // Liquidations
    checkVaultLiquidationRisk,
    getAllActiveLiquidations,
    bidOnLiquidationAuction,
    getLiquidationHistoryForUser,
    // Price Oracle
    getCollateralPrice,
    // SAI Transfer
    transferSai,
    // Admin functions
    mintTestSAI,
    // Utils
    isAPIInitialized,
    initializeAPI
    // getTokenBalances is already exported as a named export above
}; 