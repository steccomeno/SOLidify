import { SolanaAPI } from './solana';
import { connection } from '../utils/walletUtils';

let solanaAPI = null;

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

export const initializeAPI = (wallet) => {
    try {
        console.log('API INIT - STEP 1: Starting initialization with wallet details:', {
            hasWallet: !!wallet,
            connected: wallet?.connected,
            hasPublicKey: !!wallet?.publicKey,
            publicKeyStr: wallet?.publicKey?.toString(),
            hasSignTransaction: !!wallet?.signTransaction
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
        
        // Check if connection is valid
        console.log('API INIT - Connection details:', {
            endpoint: connection.rpcEndpoint,
            commitment: connection.commitment
        });

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
        solanaAPI = new SolanaAPI(connection, wallet);
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
    return await solanaAPI.getUserCDPs();
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