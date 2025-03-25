// Mock data for liquidation engine
export const mockPrices = {
  SOL: 123.45,
  USDC: 1.00,
  BONK: 0.000012,
  mSOL: 130.25,
};

// Mock function to simulate getting price from Pyth oracle
export const getPythPrice = async (assetSymbol) => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Check if we have a price for this asset
  if (!mockPrices[assetSymbol]) {
    throw new Error(`Price not available for ${assetSymbol}`);
  }
  
  // Add some randomness to simulate price fluctuations (±2%)
  const priceVariation = mockPrices[assetSymbol] * (0.98 + Math.random() * 0.04);
  
  return {
    price: priceVariation,
    confidence: priceVariation * 0.01, // 1% confidence interval
    publishTime: Date.now() / 1000 - Math.random() * 30, // Random time within the last 30 seconds
    exponent: assetSymbol === 'BONK' ? -6 : 0, // BONK prices need an exponent
  };
};

// Mock data for liquidation events
export const mockLiquidationEvents = [
  {
    id: 'liq-001',
    vault: 'vault-234',
    owner: 'FGd9Zhbi8xgDK5nUxxBDnhSSk2CxZV7HuXHgWwG6vwKh',
    collateralAmount: 5.25,
    collateralType: 'SOL',
    debtAmount: 500,
    collateralizationRatio: 105.38,
    timestamp: Date.now() - 8640000, // 1 day ago
    status: 'pending',
  },
  {
    id: 'liq-002',
    vault: 'vault-145',
    owner: 'HQtUASVSKMnAQit8GyTJEJ4QEzXUSrQKxks9piKNeUMt',
    collateralAmount: 1250.75,
    collateralType: 'BONK',
    debtAmount: 15,
    collateralizationRatio: 106.20,
    timestamp: Date.now() - 4320000, // 12 hours ago
    status: 'completed',
    auctionData: {
      startPrice: 16.2,
      finalPrice: 15.5,
      winner: 'AH3gVx8K7E6ohFEkJWQPgGWwrG9jcnEbcu4ixqKTJsje',
      bids: 3,
    },
  },
  {
    id: 'liq-003',
    vault: 'vault-387',
    owner: 'D92jUG5PcKEJxLrax31PRXmN3LVUH7btYM3qPWVjLVTZ',
    collateralAmount: 8.75,
    collateralType: 'mSOL',
    debtAmount: 950,
    collateralizationRatio: 103.67,
    timestamp: Date.now() - 1728000, // 8 hours ago
    status: 'auction_active',
    auctionData: {
      startPrice: 1045.00,
      currentPrice: 982.35,
      startTime: Date.now() - 1728000,
      endTime: Date.now() + 1728000,
      bids: 0,
    },
  },
];

// Mock function to get active liquidation events
export const getActiveLiquidations = async () => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  return mockLiquidationEvents.filter(event => 
    event.status === 'pending' || event.status === 'auction_active'
  );
};

// Mock function to get historical liquidation events
export const getLiquidationHistory = async (limit = 10) => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // Return sorted by timestamp (newest first) and limited
  return [...mockLiquidationEvents]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
};

// Mock function to check if a CDP is in danger of liquidation
export const checkLiquidationRisk = async (cdpData) => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 600));
  
  if (!cdpData || !cdpData.collateralAmount || !cdpData.debtAmount || !cdpData.collateralType) {
    throw new Error('Invalid CDP data');
  }
  
  try {
    // Get current price for the collateral
    const priceData = await getPythPrice(cdpData.collateralType);
    
    // Calculate collateralization ratio
    const collateralValue = cdpData.collateralAmount * priceData.price;
    const ratio = (collateralValue / cdpData.debtAmount) * 100;
    
    // Define risk levels
    let riskLevel;
    if (ratio < 110) {
      riskLevel = 'critical';
    } else if (ratio < 120) {
      riskLevel = 'high';
    } else if (ratio < 150) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'safe';
    }
    
    return {
      cdpId: cdpData.id,
      collateralizationRatio: ratio,
      liquidationPrice: (cdpData.debtAmount * 1.1) / cdpData.collateralAmount,
      currentPrice: priceData.price,
      riskLevel,
      liquidationThreshold: 110,
      safeThreshold: 150,
    };
  } catch (error) {
    console.error('Error checking liquidation risk:', error);
    throw error;
  }
};

// Mock function to place a bid on a liquidation auction
export const placeLiquidationBid = async (auctionId, bidAmount) => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1200));
  
  const auction = mockLiquidationEvents.find(event => 
    event.id === auctionId && event.status === 'auction_active'
  );
  
  if (!auction) {
    throw new Error('Auction not found or not active');
  }
  
  if (bidAmount < auction.auctionData.currentPrice) {
    throw new Error('Bid too low');
  }
  
  // In a real implementation, this would interact with the Solana program
  // to place the bid and update the auction state
  
  return {
    success: true,
    auctionId,
    bidAmount,
    timestamp: Date.now(),
    status: 'bid_placed',
  };
};

// Mock function to simulate automatic liquidation checks
export const checkAndLiquidateVaults = async () => {
  // This would be a keeper function that runs periodically
  // to check all vaults and liquidate any that are under-collateralized
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  return {
    checked: 157,
    liquidated: 2,
    safe: 155,
  };
}; 