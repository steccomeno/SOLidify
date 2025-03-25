/**
 * Utility functions for interacting with the SOLidify liquidation engine
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { Program } from '@project-serum/anchor';
import { getWalletBalance } from './walletUtils';

// Mock data for development and demo purposes
const MOCK_VAULTS = [
  {
    id: 'vault-001',
    owner: 'BvR9CWEpLtHHtGZNwGLEiDcbnKX9TnwS1kaZ5pkW8WUF',
    collateralType: 'SOL',
    collateralAmount: 5.5,
    debtAmount: 250,
    liquidationRisk: 'low',
    ratio: 170, // 170% collateralization
    lastUpdated: Date.now() - 3600000 // 1 hour ago
  },
  {
    id: 'vault-002',
    owner: '2JGjPXzGbYki6JQdKepkuGf9RVvTVTyXQmCEAUhYdxnf',
    collateralType: 'SOL',
    collateralAmount: 2.2,
    debtAmount: 140,
    liquidationRisk: 'high',
    ratio: 112, // 112% collateralization, very close to threshold
    lastUpdated: Date.now() - 1200000 // 20 minutes ago
  },
  {
    id: 'vault-003',
    owner: '8oyBL6U7eFSgDz9bBS9H33TDERnG1TKPJqFGWJ5Xnsa5',
    collateralType: 'SOL',
    collateralAmount: 8.0,
    debtAmount: 420,
    liquidationRisk: 'medium',
    ratio: 135, // 135% collateralization
    lastUpdated: Date.now() - 7200000 // 2 hours ago
  },
  {
    id: 'vault-004',
    owner: 'GR4Vth7Jeqk7LB7R2fBQsup5oTunikA5oCNoUFgEuRcA',
    collateralType: 'ETH',
    collateralAmount: 0.8,
    debtAmount: 1600,
    liquidationRisk: 'medium',
    ratio: 145, // 145% collateralization
    lastUpdated: Date.now() - 9000000 // 2.5 hours ago
  },
  {
    id: 'vault-005',
    owner: 'DJQbo5h4X1PcUKVZMoSAvXWEzGsHHa1Sm7BjxzXJRTCt',
    collateralType: 'BTC',
    collateralAmount: 0.05,
    debtAmount: 2500,
    liquidationRisk: 'low',
    ratio: 160, // 160% collateralization
    lastUpdated: Date.now() - 5400000 // 1.5 hours ago
  }
];

const MOCK_LIQUIDATIONS = [
  {
    id: 'auction-001',
    vaultId: 'vault-002',
    status: 'active',
    collateralType: 'SOL',
    collateralAmount: 2.2,
    debtAmount: 140,
    currentPrice: 146, // Current Dutch auction price
    startPrice: 175, // Started at 125% of debt
    startTime: Date.now() - 1800000, // Started 30 minutes ago
    endTime: Date.now() + 1800000, // Ends in 30 minutes
    highestBid: 145,
    highestBidder: '5YNmS1R9nNSCDwYuFwCCvqKqm71179PnVkZLvM4vJ5R8',
    liquidator: '3Ki36FpeRvWSXdxjcQQCLGFJ1zRUdxK9iLj5gHLvVFG3'
  },
  {
    id: 'auction-002',
    vaultId: 'vault-006',
    status: 'completed',
    collateralType: 'ETH',
    collateralAmount: 0.6,
    debtAmount: 1500,
    currentPrice: 1500,
    startPrice: 1875,
    startTime: Date.now() - 4500000, // Started 75 minutes ago
    endTime: Date.now() - 900000, // Ended 15 minutes ago
    highestBid: 1600,
    highestBidder: 'BvR9CWEpLtHHtGZNwGLEiDcbnKX9TnwS1kaZ5pkW8WUF',
    liquidator: '3Ki36FpeRvWSXdxjcQQCLGFJ1zRUdxK9iLj5gHLvVFG3'
  },
  {
    id: 'auction-003',
    vaultId: 'vault-007',
    status: 'pending',
    collateralType: 'BTC',
    collateralAmount: 0.03,
    debtAmount: 1500,
    currentPrice: 1875, // Will start at 125% of debt
    startPrice: 1875,
    startTime: Date.now() + 300000, // Starts in 5 minutes
    endTime: Date.now() + 3900000, // Ends in 65 minutes
    highestBid: 0,
    highestBidder: null,
    liquidator: '3Ki36FpeRvWSXdxjcQQCLGFJ1zRUdxK9iLj5gHLvVFG3'
  }
];

// Liquidation risk thresholds
const RISK_THRESHOLDS = {
  high: 120, // 120% or below is high risk
  medium: 140, // 140% or below is medium risk
  low: 200 // 200% or above is very low risk
};

/**
 * Assess the liquidation risk of a vault based on its collateralization ratio
 * @param {number} ratio - The collateralization ratio (e.g. 150 for 150%)
 * @returns {string} Risk level: 'high', 'medium', or 'low'
 */
export function assessLiquidationRisk(ratio) {
  if (ratio <= RISK_THRESHOLDS.high) {
    return 'high';
  } else if (ratio <= RISK_THRESHOLDS.medium) {
    return 'medium';
  } else {
    return 'low';
  }
}

/**
 * Calculate the current price in a Dutch auction based on time elapsed
 * @param {object} auction - The auction object
 * @returns {number} Current price in SAI
 */
export function calculateCurrentAuctionPrice(auction) {
  if (!auction) return 0;
  
  const now = Date.now();
  
  // If auction hasn't started yet, return the start price
  if (now < auction.startTime) {
    return auction.startPrice;
  }
  
  // If auction has ended, return the debt amount
  if (now >= auction.endTime) {
    return auction.debtAmount;
  }
  
  // Calculate the progress of the auction (0 to 1)
  const totalDuration = auction.endTime - auction.startTime;
  const elapsed = now - auction.startTime;
  const progress = elapsed / totalDuration;
  
  // Linear interpolation between start price and debt amount
  const priceDrop = auction.startPrice - auction.debtAmount;
  const currentPrice = auction.startPrice - (priceDrop * progress);
  
  return Math.round(currentPrice * 100) / 100; // Round to 2 decimal places
}

/**
 * Calculate the discount percentage in a Dutch auction
 * @param {object} auction - The auction object
 * @param {number} solPrice - Current SOL price in USD
 * @returns {number} Discount percentage (e.g. 15 for 15% discount)
 */
export function calculateAuctionDiscount(auction, solPrice) {
  if (!auction || !solPrice) return 0;
  
  const collateralValue = auction.collateralAmount * solPrice;
  const currentPrice = calculateCurrentAuctionPrice(auction);
  
  // Calculate discount percentage
  const discount = 100 - ((currentPrice / collateralValue) * 100);
  
  // Cap discount at 0 (no negative discounts)
  return Math.max(0, Math.round(discount * 10) / 10); // Round to 1 decimal place
}

/**
 * Get all vaults at risk of liquidation
 * @param {string} riskLevel - Filter by risk level: 'high', 'medium', 'low', or 'all'
 * @returns {Promise<Array>} Vaults at risk
 */
export async function getVaultsAtRisk(riskLevel = 'all') {
  // In a real implementation, this would call the blockchain
  return new Promise((resolve) => {
    setTimeout(() => {
      let vaults = [...MOCK_VAULTS];
      
      if (riskLevel !== 'all') {
        vaults = vaults.filter(vault => vault.liquidationRisk === riskLevel);
      }
      
      resolve(vaults);
    }, 600);
  });
}

/**
 * Get active liquidation auctions
 * @param {string} status - Filter by status: 'active', 'pending', 'completed', or 'all'
 * @returns {Promise<Array>} Active auctions
 */
export async function getLiquidationAuctions(status = 'all') {
  // In a real implementation, this would call the blockchain
  return new Promise((resolve) => {
    setTimeout(() => {
      let auctions = [...MOCK_LIQUIDATIONS];
      
      if (status !== 'all') {
        auctions = auctions.filter(auction => auction.status === status);
      }
      
      // Update current price for active auctions
      auctions = auctions.map(auction => {
        if (auction.status === 'active') {
          return {
            ...auction,
            currentPrice: calculateCurrentAuctionPrice(auction)
          };
        }
        return auction;
      });
      
      resolve(auctions);
    }, 800);
  });
}

/**
 * Get auction details by ID
 * @param {string} auctionId - The auction ID
 * @returns {Promise<object|null>} Auction details or null if not found
 */
export async function getAuctionDetails(auctionId) {
  // In a real implementation, this would call the blockchain
  return new Promise((resolve) => {
    setTimeout(() => {
      const auction = MOCK_LIQUIDATIONS.find(a => a.id === auctionId);
      
      if (!auction) {
        resolve(null);
        return;
      }
      
      // If auction is active, update the current price
      if (auction.status === 'active') {
        resolve({
          ...auction,
          currentPrice: calculateCurrentAuctionPrice(auction)
        });
      } else {
        resolve(auction);
      }
    }, 500);
  });
}

/**
 * Get bidding history for an auction
 * @param {string} auctionId - The auction ID
 * @returns {Promise<Array>} Bid history
 */
export async function getAuctionBidHistory(auctionId) {
  // Mock bid history data
  const mockBidHistory = {
    'auction-001': [
      {
        bidder: '5YNmS1R9nNSCDwYuFwCCvqKqm71179PnVkZLvM4vJ5R8',
        amount: 260,
        timestamp: Date.now() - 300000 // 5 minutes ago
      },
      {
        bidder: '3Q84XatHdE83Foo7hp3SZc5QkQ3ZkWPe1ivbT6sqmhK2',
        amount: 255,
        timestamp: Date.now() - 900000 // 15 minutes ago
      }
    ],
    'auction-002': [
      {
        bidder: 'BvR9CWEpLtHHtGZNwGLEiDcbnKX9TnwS1kaZ5pkW8WUF',
        amount: 370,
        timestamp: Date.now() - 1200000 // 20 minutes ago
      },
      {
        bidder: '8oyBL6U7eFSgDz9bBS9H33TDERnG1TKPJqFGWJ5Xnsa5',
        amount: 360,
        timestamp: Date.now() - 1800000 // 30 minutes ago
      },
      {
        bidder: '2JGjPXzGbYki6JQdKepkuGf9RVvTVTyXQmCEAUhYdxnf',
        amount: 355,
        timestamp: Date.now() - 2400000 // 40 minutes ago
      }
    ],
    'auction-003': []
  };
  
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(mockBidHistory[auctionId] || []);
    }, 600);
  });
}

/**
 * Place a bid on a liquidation auction
 * @param {string} auctionId - The auction ID
 * @param {number} bidAmount - Bid amount in SAI
 * @param {object} wallet - Connected wallet
 * @returns {Promise<object>} Transaction result
 */
export async function placeBid(auctionId, bidAmount, wallet) {
  if (!wallet.connected) {
    throw new Error('Wallet not connected');
  }
  
  // In a real implementation, this would call the blockchain
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        const auction = await getAuctionDetails(auctionId);
        
        if (!auction) {
          reject(new Error('Auction not found'));
          return;
        }
        
        if (auction.status !== 'active') {
          reject(new Error(`Auction is ${auction.status}, not active`));
          return;
        }
        
        const currentPrice = calculateCurrentAuctionPrice(auction);
        
        if (bidAmount < currentPrice) {
          reject(new Error(`Bid amount (${bidAmount}) is below current price (${currentPrice})`));
          return;
        }
        
        // Check wallet balance
        const walletBalance = await getWalletBalance(wallet.publicKey);
        
        if (walletBalance < bidAmount) {
          reject(new Error(`Insufficient funds: ${walletBalance} SAI available, ${bidAmount} SAI required`));
          return;
        }
        
        // Mock successful transaction
        resolve({
          success: true,
          transactionId: 'mock-tx-' + Math.random().toString(36).substring(2, 15),
          auction: {
            ...auction,
            highestBid: bidAmount,
            highestBidder: wallet.publicKey.toString()
          }
        });
      } catch (error) {
        reject(error);
      }
    }, 1000);
  });
}

/**
 * Claim collateral after winning an auction
 * @param {string} auctionId - The auction ID
 * @param {object} wallet - Connected wallet
 * @returns {Promise<object>} Transaction result
 */
export async function claimCollateral(auctionId, wallet) {
  if (!wallet.connected) {
    throw new Error('Wallet not connected');
  }
  
  // In a real implementation, this would call the blockchain
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        const auction = await getAuctionDetails(auctionId);
        
        if (!auction) {
          reject(new Error('Auction not found'));
          return;
        }
        
        if (auction.status !== 'completed') {
          reject(new Error('Auction is not completed'));
          return;
        }
        
        if (auction.highestBidder !== wallet.publicKey.toString()) {
          reject(new Error('Only the highest bidder can claim collateral'));
          return;
        }
        
        // Mock successful transaction
        resolve({
          success: true,
          transactionId: 'mock-tx-' + Math.random().toString(36).substring(2, 15),
          collateralAmount: auction.collateralAmount,
          collateralType: auction.collateralType
        });
      } catch (error) {
        reject(error);
      }
    }, 1000);
  });
}

/**
 * Start liquidation auction for a vault (liquidator function)
 * @param {string} vaultId - The vault ID
 * @param {object} wallet - Connected wallet
 * @returns {Promise<object>} Transaction result
 */
export async function startLiquidationAuction(vaultId, wallet) {
  if (!wallet.connected) {
    throw new Error('Wallet not connected');
  }
  
  // In a real implementation, this would call the blockchain
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        const vault = MOCK_VAULTS.find(v => v.id === vaultId);
        
        if (!vault) {
          reject(new Error('Vault not found'));
          return;
        }
        
        if (vault.liquidationRisk !== 'high') {
          reject(new Error('Vault is not eligible for liquidation'));
          return;
        }
        
        // Mock successful transaction
        const now = Date.now();
        const newAuction = {
          id: 'auction-new-' + Math.random().toString(36).substring(2, 10),
          vaultId: vault.id,
          status: 'active',
          collateralAmount: vault.collateralAmount,
          collateralType: vault.collateralType,
          debtAmount: vault.debtAmount,
          currentPrice: vault.debtAmount * 1.5, // 150% of debt
          startPrice: vault.debtAmount * 1.5,
          startTime: now,
          endTime: now + 3600000, // 1 hour later
          highestBid: 0,
          highestBidder: null,
          liquidator: wallet.publicKey.toString()
        };
        
        // Add to mock data (in a real implementation, this would be done on-chain)
        MOCK_LIQUIDATIONS.push(newAuction);
        
        resolve({
          success: true,
          transactionId: 'mock-tx-' + Math.random().toString(36).substring(2, 15),
          auction: newAuction
        });
      } catch (error) {
        reject(error);
      }
    }, 1200);
  });
}

/**
 * Calculate health factor of a vault
 * @param {number} collateralAmount - Amount of collateral in the vault
 * @param {number} collateralPrice - Current price of the collateral
 * @param {number} debtAmount - Amount of debt in the vault
 * @returns {number} Health factor as a ratio (e.g., 1.5 for 150%)
 */
export function calculateHealthFactor(collateralAmount, collateralPrice, debtAmount) {
  if (!collateralAmount || !collateralPrice || !debtAmount || debtAmount === 0) {
    return 0;
  }
  
  // Calculate collateral value
  const collateralValue = collateralAmount * collateralPrice;
  
  // Calculate health factor (collateral value / debt)
  const healthFactor = collateralValue / debtAmount;
  
  return healthFactor;
}

/**
 * Generate a color for the health factor
 * @param {number} healthFactor - The health factor (0-100)
 * @returns {string} CSS color string
 */
export function getHealthFactorColor(healthFactor) {
  if (healthFactor <= 20) {
    return '#ff4d4f'; // Red
  } else if (healthFactor <= 50) {
    return '#faad14'; // Yellow
  } else {
    return '#52c41a'; // Green
  }
}

/**
 * Format a currency value with appropriate formatting
 * @param {number} value - Value to format
 * @param {number} decimals - Number of decimal places to show
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (value, decimals = 2) => {
  if (value === undefined || value === null) return '0.00';
  
  // Handle large numbers by condensing them
  if (value >= 1000000) {
    return (value / 1000000).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + 'M';
  } else if (value >= 1000) {
    return (value / 1000).toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }) + 'K';
  }
  
  // Regular formatting
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}; 