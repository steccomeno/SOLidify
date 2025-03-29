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
        console.log('Attempting to initialize API with wallet:', {
            hasWallet: !!wallet,
            connected: wallet?.connected,
            hasPublicKey: !!wallet?.publicKey,
            publicKeyStr: wallet?.publicKey?.toString(),
            hasSignTransaction: !!wallet?.signTransaction
        });

        if (!wallet || !wallet.connected) {
            throw new Error('Wallet is not connected');
        }

        if (!wallet.publicKey) {
            throw new Error('Wallet public key is not available');
        }

        if (!wallet.signTransaction || typeof wallet.signTransaction !== 'function') {
            throw new Error('Wallet signTransaction function is not available');
        }

        solanaAPI = new SolanaAPI(connection, wallet);
        console.log('SolanaAPI instance created successfully');
        return true;
    } catch (error) {
        console.error('Failed to initialize API:', error);
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
    // TODO: Implement real wallet balance check
    return {
        sol: 2.45,
        sai: 120.50,
    };
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