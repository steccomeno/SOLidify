// Mock API for SOLidify demo
import { mockProposals } from './mockProposals';

// Simulate network delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Mock wallet balance
export const getWalletBalance = async () => {
  await delay(800);
  return {
    sol: 2.45,
    sai: 120.50,
  };
};

// Mock user's CDPs
export const getCDPs = async () => {
  await delay(1000);
  return [
    {
      id: 'cdp-123456789abcdef',
      collateralAmount: 1.5,
      debtAmount: 15,
      collateralizationRatio: 150,
      status: 'safe',
      liquidationPrice: 6.67,
    },
    {
      id: 'cdp-987654321fedcba',
      collateralAmount: 0.8,
      debtAmount: 5,
      collateralizationRatio: 240,
      status: 'safe',
      liquidationPrice: 4.17,
    }
  ];
};

// Mock CDP details
export const getCDPDetails = async (cdpId) => {
  await delay(800);
  
  // Simulate different CDPs based on ID
  if (cdpId === 'cdp-123456789abcdef') {
    return {
      id: cdpId,
      collateralAmount: 1.5,
      debtAmount: 15,
      collateralizationRatio: 150,
      status: 'safe',
      liquidationPrice: 6.67,
      availableToBorrow: 0, // No more SAI can be borrowed
      stabilityFee: '2.5%',
      createdAt: '2023-05-15',
    };
  }
  
  return {
    id: cdpId,
    collateralAmount: 0.8,
    debtAmount: 5,
    collateralizationRatio: 240,
    status: 'safe',
    liquidationPrice: 4.17,
    availableToBorrow: 3, // Can borrow 3 more SAI before hitting 150% ratio
    stabilityFee: '2.5%',
    createdAt: '2023-06-02',
  };
};

// Mock CDP creation
export const createCDP = async (collateralAmount, saiToBorrow) => {
  await delay(1500);
  
  if (collateralAmount < 0.05) {
    throw new Error('Minimum collateral is 0.05 SOL');
  }
  
  const maxSai = collateralAmount * 10; // 150% ratio means max SAI is 2/3 of collateral value in USD
  if (saiToBorrow > maxSai) {
    throw new Error('This would not maintain the minimum collateralization ratio');
  }
  
  return {
    id: `cdp-${Math.random().toString(36).substr(2, 9)}`,
    collateralAmount,
    debtAmount: saiToBorrow,
    collateralizationRatio: Math.floor((collateralAmount * 15) / saiToBorrow),
    status: 'safe',
  };
};

// Mock add collateral
export const addCollateral = async (cdpId, amount) => {
  await delay(1000);
  
  if (amount <= 0) {
    throw new Error('Amount must be greater than 0');
  }
  
  return true;
};

// Mock draw SAI
export const drawSai = async (cdpId, amount) => {
  await delay(1000);
  
  if (amount <= 0) {
    throw new Error('Amount must be greater than 0');
  }
  
  // For cdp-123456789abcdef, we said it has no more available to borrow
  if (cdpId === 'cdp-123456789abcdef') {
    throw new Error('This would exceed the safe borrowing limit');
  }
  
  return true;
};

// Mock repay SAI
export const repaySai = async (cdpId, amount) => {
  await delay(1000);
  
  if (amount <= 0) {
    throw new Error('Amount must be greater than 0');
  }
  
  return true;
};

// Mock close CDP
export const closeCDP = async (cdpId) => {
  await delay(1200);
  
  // Get CDP details to check if debt is repaid
  const cdp = await getCDPDetails(cdpId);
  if (cdp.debtAmount > 0) {
    throw new Error('You must repay all debt before closing the CDP');
  }
  
  return true;
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
export const getUserCDPs = getCDPs;
export const getCDPInfo = getCDPDetails;
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