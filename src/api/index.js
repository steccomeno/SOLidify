// Mock API for SOLidify demo

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
  return [
    {
      id: 'prop-001',
      title: 'Adjust collateralization ratio',
      description: 'Proposal to adjust the minimum collateralization ratio from 150% to 160%',
      status: 'active',
      forVotes: 1250000,
      againstVotes: 750000,
      startDate: '2023-06-01',
      endDate: '2023-06-08',
    },
    {
      id: 'prop-002',
      title: 'Add USDC as collateral',
      description: 'Proposal to add USDC as a supported collateral type for CDPs',
      status: 'passed',
      forVotes: 1800000,
      againstVotes: 200000,
      startDate: '2023-05-15',
      endDate: '2023-05-22',
    },
    {
      id: 'prop-003',
      title: 'Reduce stability fee',
      description: 'Proposal to reduce the stability fee from 2.5% to 1.5%',
      status: 'active',
      forVotes: 900000,
      againstVotes: 850000,
      startDate: '2023-06-05',
      endDate: '2023-06-12',
    },
  ];
};

export const getProposalDetails = async (proposalId) => {
  await delay(800);
  
  if (proposalId === 'prop-001') {
    return {
      id: proposalId,
      title: 'Adjust collateralization ratio',
      description: 'Proposal to adjust the minimum collateralization ratio from 150% to 160%',
      fullDescription: `
## Motivation
The current minimum collateralization ratio of 150% leaves the protocol with a smaller safety margin during market volatility than desired. Increasing the ratio to 160% will enhance the protocol's safety without significantly impacting usability.

## Specification
- Change the minimum collateralization ratio from 150% to 160%
- Apply the new ratio to new CDPs only
- Existing CDPs will be grandfathered in at 150% but will need to meet the 160% requirement when making any modifications

## Risk Assessment
A higher collateralization ratio reduces liquidation risk during market volatility, but may reduce capital efficiency for users.
      `,
      status: 'active',
      forVotes: 1250000,
      againstVotes: 750000,
      startDate: '2023-06-01',
      endDate: '2023-06-08',
      quorum: 1000000,
      executor: 'Governance Council',
    };
  }
  
  if (proposalId === 'prop-002') {
    return {
      id: proposalId,
      title: 'Add USDC as collateral',
      description: 'Proposal to add USDC as a supported collateral type for CDPs',
      fullDescription: `
## Motivation
Currently, the protocol only supports SOL as collateral. Adding USDC as a collateral option will diversify the protocol's risk profile and provide users with more flexibility.

## Specification
- Add USDC as a supported collateral type
- Set the minimum collateralization ratio for USDC at 120%
- Set the debt ceiling for USDC-backed SAI at 10 million

## Risk Assessment
USDC is a stablecoin with less price volatility than SOL, allowing for a lower collateralization ratio. However, USDC carries counterparty risk from Circle, its issuer.
      `,
      status: 'passed',
      forVotes: 1800000,
      againstVotes: 200000,
      startDate: '2023-05-15',
      endDate: '2023-05-22',
      quorum: 1000000,
      executor: 'Governance Council',
      implementation: 'Scheduled for June 15, 2023',
    };
  }
  
  return {
    id: proposalId,
    title: 'Reduce stability fee',
    description: 'Proposal to reduce the stability fee from 2.5% to 1.5%',
    fullDescription: `
## Motivation
The current stability fee of 2.5% is higher than necessary to maintain the peg and attract users to the platform. Reducing it to 1.5% will make the protocol more competitive while still ensuring stability.

## Specification
- Reduce the stability fee from 2.5% to 1.5% for all collateral types
- Apply the change immediately upon proposal execution

## Risk Assessment
A lower stability fee may lead to higher SAI issuance, putting more pressure on the peg. However, the current level of overcollateralization should mitigate this risk.
    `,
    status: 'active',
    forVotes: 900000,
    againstVotes: 850000,
    startDate: '2023-06-05',
    endDate: '2023-06-12',
    quorum: 1000000,
    executor: 'Governance Council',
  };
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