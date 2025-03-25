import React, { useState, useEffect } from 'react';
import { 
  getVaultsAtRisk, 
  getHealthFactorColor, 
  calculateHealthFactor,
  getLiquidationAuctions,
  formatCurrency
} from '../utils/liquidationUtils';
import { isWalletConnected, connectWallet } from '../utils/walletUtils';
import LiquidationRiskIndicator from '../components/LiquidationRiskIndicator';
import LiquidationAuctionInterface from '../components/LiquidationAuctionInterface';
import AuctionCard from '../components/AuctionCard';
import { getPythPrice } from '../utils/solanaUtils';
import { getSolanaConnection, getSolBalance, PYTH_PRICE_FEEDS } from '../utils/solanaUtils';
import SolanaTransactionLog from '../components/SolanaTransactionLog';
import './LiquidationDashboard.css';

/**
 * LiquidationDashboard Page
 * 
 * A comprehensive dashboard for liquidators to monitor at-risk vaults,
 * participate in auctions, and track performance
 */
const LiquidationDashboard = () => {
  // State management
  const [walletConnected, setWalletConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalVaults: 0,
    atRiskVaults: 0,
    activeAuctions: 0,
    liquidationVolume: 0,
    avgDiscount: 0,
    totalCollateralAtRisk: 0
  });
  const [atRiskVaults, setAtRiskVaults] = useState([]);
  const [activeAuctions, setActiveAuctions] = useState([]);
  const [priceData, setPriceData] = useState({});
  const [view, setView] = useState('overview'); // 'overview', 'auctions', 'vaults'
  const [currentRiskLevel, setCurrentRiskLevel] = useState('all');
  const [currentCollateralType, setCurrentCollateralType] = useState('all');
  const [solBalance, setSolBalance] = useState(0);
  const [pythFeedData, setPythFeedData] = useState({});
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [networkStatus, setNetworkStatus] = useState('connected'); // 'connected', 'disconnected', 'syncing'
  
  // Wallet connection management
  useEffect(() => {
    const checkWallet = async () => {
      const connected = isWalletConnected();
      setWalletConnected(connected);
    };
    
    checkWallet();
  }, []);
  
  // Load dashboard data
  useEffect(() => {
    const loadDashboardData = async () => {
      setLoading(true);
      try {
        // Load vaults at risk for monitoring
        const vaults = await getVaultsAtRisk(currentRiskLevel);
        setAtRiskVaults(vaults);
        
        // Filter by collateral type if needed
        const filteredVaults = currentCollateralType === 'all' 
          ? vaults 
          : vaults.filter(v => v.collateralType === currentCollateralType);
        
        // Load active auctions
        const auctions = await getLiquidationAuctions('active');
        setActiveAuctions(auctions);
        
        // Calculate total collateral at risk
        const totalCollateralAtRisk = filteredVaults.reduce((sum, vault) => {
          const collateralValue = vault.collateralAmount * priceData[vault.collateralType];
          return sum + collateralValue;
        }, 0);
        
        // Update stats
        setStats({
          totalVaults: 250, // This would come from the actual system
          atRiskVaults: filteredVaults.length,
          activeAuctions: auctions.length,
          liquidationVolume: auctions.reduce((sum, a) => sum + a.debtAmount, 0),
          avgDiscount: 12.5, // This would be calculated from actual auction data
          totalCollateralAtRisk
        });

        // If wallet is connected, get SOL balance
        if (walletConnected) {
          const balance = await getSolBalance("SLDifYuM6bE18jA7fTynPvqjZpNLEVzKUFXqNhyw3EV");
          setSolBalance(balance);
        }

        // Fetch Pyth prices for assets
        const priceFeedIds = Object.keys(PYTH_PRICE_FEEDS);
        const pricePromises = priceFeedIds.map(id => getPythPrice(id));
        const prices = await Promise.all(pricePromises);
        
        const priceMap = {};
        const pythData = {};
        
        // Process price data from Pyth
        priceFeedIds.forEach((id, index) => {
          // Extract asset symbol from pair (e.g., 'SOL' from 'SOL/USD')
          const asset = id.split('/')[0];
          priceMap[asset] = prices[index];
          
          // Store more detailed price data for display
          pythData[id] = {
            price: prices[index],
            lastUpdated: new Date(),
            confidence: 0.9998, // Mock confidence level
            feedAddress: PYTH_PRICE_FEEDS[id].toString()
          };
        });
        
        setPriceData(priceMap);
        setPythFeedData(pythData);

        setNetworkStatus('connected');
      } catch (error) {
        console.error('Error loading dashboard data:', error);
        setNetworkStatus('disconnected');
      } finally {
        setLoading(false);
      }
    };
    
    loadDashboardData();
    
    // Set up interval for refreshing data
    const interval = setInterval(() => {
      setRefreshCounter(prev => prev + 1);
    }, 30000);
    
    return () => clearInterval(interval);
  }, [currentRiskLevel, currentCollateralType, walletConnected]);
  
  // Format risk level for display
  const formatRiskLevel = (riskLevel) => {
    switch(riskLevel) {
      case 'critical':
        return <span className="vault-risk risk-critical">Critical</span>;
      case 'high':
        return <span className="vault-risk risk-high">High</span>;
      case 'medium':
        return <span className="vault-risk risk-medium">Medium</span>;
      case 'low':
        return <span className="vault-risk risk-low">Low</span>;
      default:
        return <span className="vault-risk risk-unknown">Unknown</span>;
    }
  };
  
  // Start liquidation auction for a vault
  const startLiquidation = async (vaultId) => {
    if (!walletConnected) {
      // Prompt to connect wallet
      const result = await connectWallet();
      setWalletConnected(result.success);
      if (!result.success) return;
    }
    
    // In a real app, this would call a contract to initiate liquidation
    alert(`Liquidation initiated for vault ${vaultId}`);
    
    // Refresh data after liquidation
    const vaults = await getVaultsAtRisk(currentRiskLevel);
    setAtRiskVaults(vaults);
    
    const auctions = await getLiquidationAuctions('active');
    setActiveAuctions(auctions);
  };
  
  // Handle wallet connection
  const handleConnectWallet = async () => {
    const result = await connectWallet();
    setWalletConnected(result.success);
  };
  
  // If loading, show spinner
  if (loading) {
    return (
      <div className="liquidation-dashboard">
        <div className="dashboard-header">
          <h1>Liquidation Dashboard</h1>
        </div>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading dashboard data...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="liquidation-dashboard">
      <div className="dashboard-header">
        <h1>Liquidation Dashboard</h1>
        {!walletConnected && (
          <button className="connect-wallet-button" onClick={handleConnectWallet}>
            Connect Wallet to Participate
          </button>
        )}
      </div>
      
      {/* Stats Overview */}
      <div className="stats-cards">
        <div className="stat-card">
          <div className="stat-value">{stats.totalVaults.toLocaleString()}</div>
          <div className="stat-label">Total Vaults</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.atRiskVaults.toLocaleString()}</div>
          <div className="stat-label">Vaults at Risk</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.activeAuctions.toLocaleString()}</div>
          <div className="stat-label">Active Auctions</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">${formatCurrency(stats.liquidationVolume)}</div>
          <div className="stat-label">Liquidation Volume</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">${formatCurrency(stats.totalCollateralAtRisk)}</div>
          <div className="stat-label">Collateral at Risk</div>
        </div>
      </div>
      
      {/* View Selector */}
      <div className="view-selector">
        <button 
          className={`view-button ${view === 'overview' ? 'active' : ''}`}
          onClick={() => setView('overview')}
        >
          Overview
        </button>
        <button 
          className={`view-button ${view === 'auctions' ? 'active' : ''}`}
          onClick={() => setView('auctions')}
        >
          Active Auctions ({stats.activeAuctions})
        </button>
        <button 
          className={`view-button ${view === 'vaults' ? 'active' : ''}`}
          onClick={() => setView('vaults')}
        >
          At-Risk Vaults ({stats.atRiskVaults})
        </button>
      </div>
      
      {/* Overview View */}
      {view === 'overview' && (
        <div className="dashboard-overview">
          {/* Overview Charts */}
          <div className="overview-charts">
            {/* Risk Distribution */}
            <div className="risk-distribution-card">
              <div className="section-header">
                <h2>Risk Distribution</h2>
                <p>Distribution of vaults by risk level</p>
              </div>
              
              <div className="chart-content">
                {atRiskVaults.length === 0 ? (
                  <div className="empty-state">No vaults at risk currently</div>
                ) : (
                  <div className="risk-bars">
                    {renderRiskDistribution()}
                  </div>
                )}
              </div>
            </div>
            
            {/* Recent Liquidations */}
            <div className="recent-liquidations-card">
              <div className="section-header">
                <h2>Recent Liquidations</h2>
                <p>Most recent vault liquidations</p>
              </div>
              
              <div className="chart-content">
                {renderRecentLiquidations()}
              </div>
            </div>
          </div>
          
          {/* Featured Sections */}
          <div className="featured-sections">
            {/* Featured Auctions */}
            <div className="featured-section">
              <div className="section-header">
                <h2>Featured Auctions</h2>
                <p>Highest value auctions currently active</p>
              </div>
              
              <div className="featured-content">
                {renderFeaturedAuctions()}
              </div>
            </div>
            
            {/* Critical Vaults */}
            <div className="featured-section">
              <div className="section-header">
                <h2>Critical Vaults</h2>
                <p>Vaults at high risk of liquidation</p>
              </div>
              
              <div className="featured-content">
                {renderCriticalVaults()}
              </div>
            </div>
          </div>
          
          <div className="section">
            {renderPriceFeeds()}
          </div>
          
          <div className="section">
            <SolanaTransactionLog />
          </div>
        </div>
      )}
      
      {/* Auctions View */}
      {view === 'auctions' && (
        <div className="auctions-view">
          <div className="section-header">
            <h2>Active Liquidation Auctions</h2>
            <p>Participate in these Dutch auctions to acquire collateral at a discount</p>
          </div>
          
          {activeAuctions.length === 0 ? (
            <div className="empty-state">
              No active auctions at this time
            </div>
          ) : (
            <LiquidationAuctionInterface />
          )}
        </div>
      )}
      
      {/* At-Risk Vaults View */}
      {view === 'vaults' && (
        <div className="vaults-view">
          <div className="section-header">
            <h2>Vaults at Risk of Liquidation</h2>
            <p>Monitor these vaults that are close to the liquidation threshold</p>
          </div>
          
          {/* Filter Controls */}
          <div className="filter-controls">
            <div className="filter-group">
              <label>Risk Level:</label>
              <div className="filter-options">
                <button 
                  className={`filter-option ${currentRiskLevel === 'all' ? 'active' : ''}`}
                  onClick={() => setCurrentRiskLevel('all')}
                >
                  All
                </button>
                <button 
                  className={`filter-option ${currentRiskLevel === 'critical' ? 'active' : ''}`}
                  onClick={() => setCurrentRiskLevel('critical')}
                >
                  Critical
                </button>
                <button 
                  className={`filter-option ${currentRiskLevel === 'high' ? 'active' : ''}`}
                  onClick={() => setCurrentRiskLevel('high')}
                >
                  High
                </button>
                <button 
                  className={`filter-option ${currentRiskLevel === 'medium' ? 'active' : ''}`}
                  onClick={() => setCurrentRiskLevel('medium')}
                >
                  Medium
                </button>
              </div>
            </div>
            
            <div className="filter-group">
              <label>Collateral:</label>
              <div className="filter-options">
                <button 
                  className={`filter-option ${currentCollateralType === 'all' ? 'active' : ''}`}
                  onClick={() => setCurrentCollateralType('all')}
                >
                  All
                </button>
                <button 
                  className={`filter-option ${currentCollateralType === 'SOL' ? 'active' : ''}`}
                  onClick={() => setCurrentCollateralType('SOL')}
                >
                  SOL
                </button>
                <button 
                  className={`filter-option ${currentCollateralType === 'ETH' ? 'active' : ''}`}
                  onClick={() => setCurrentCollateralType('ETH')}
                >
                  ETH
                </button>
                <button 
                  className={`filter-option ${currentCollateralType === 'BTC' ? 'active' : ''}`}
                  onClick={() => setCurrentCollateralType('BTC')}
                >
                  BTC
                </button>
              </div>
            </div>
          </div>
          
          {atRiskVaults.length === 0 ? (
            <div className="empty-state">
              No vaults matching the selected criteria
            </div>
          ) : (
            <div className="at-risk-grid">
              {atRiskVaults.map(vault => {
                const healthFactor = calculateHealthFactor(vault.collateralAmount, priceData[vault.collateralType], vault.debtAmount);
                const riskLevel = getRiskLevel(healthFactor);
                const canLiquidate = healthFactor < 1.05;
                
                return (
                  <div className="vault-card" key={vault.id}>
                    <div className="vault-header">
                      <div className="vault-id">Vault #{vault.id}</div>
                      {formatRiskLevel(riskLevel)}
                    </div>
                    <div className="vault-body">
                      <div className="vault-details">
                        <div className="detail-row">
                          <span className="detail-label">Collateral</span>
                          <span className="detail-value">{vault.collateralAmount} {vault.collateralType}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label">Debt</span>
                          <span className="detail-value">{vault.debtAmount.toFixed(2)} SAI</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label">C-Ratio</span>
                          <span className="detail-value">{(healthFactor * 100).toFixed(2)}%</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label">Value</span>
                          <span className="detail-value highlight">
                            ${formatCurrency(vault.collateralAmount * priceData[vault.collateralType])}
                          </span>
                        </div>
                      </div>
                      
                      <div className="health-indicator">
                        <LiquidationRiskIndicator 
                          vault={vault} 
                          priceData={priceData}
                          size="medium" 
                          showLabel={true}
                          showDetails={false}
                        />
                      </div>
                    </div>
                    <div className="vault-footer">
                      <button 
                        className="liquidate-button"
                        disabled={!canLiquidate || !walletConnected}
                        onClick={() => startLiquidation(vault.id)}
                      >
                        {canLiquidate ? 'Start Liquidation' : 'Monitor'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
  
  // Helper function to determine risk level from health factor
  function getRiskLevel(healthFactor) {
    if (healthFactor < 1.05) return 'critical';
    if (healthFactor < 1.2) return 'high';
    if (healthFactor < 1.5) return 'medium';
    return 'low';
  }
  
  // Render risk distribution chart
  function renderRiskDistribution() {
    const critical = atRiskVaults.filter(v => {
      const health = calculateHealthFactor(v.collateralAmount, priceData[v.collateralType], v.debtAmount);
      return health < 1.05;
    }).length;
    
    const high = atRiskVaults.filter(v => {
      const health = calculateHealthFactor(v.collateralAmount, priceData[v.collateralType], v.debtAmount);
      return health >= 1.05 && health < 1.2;
    }).length;
    
    const medium = atRiskVaults.filter(v => {
      const health = calculateHealthFactor(v.collateralAmount, priceData[v.collateralType], v.debtAmount);
      return health >= 1.2 && health < 1.5;
    }).length;
    
    const low = atRiskVaults.filter(v => {
      const health = calculateHealthFactor(v.collateralAmount, priceData[v.collateralType], v.debtAmount);
      return health >= 1.5;
    }).length;
    
    const total = critical + high + medium + low;
    if (total === 0) return <div className="empty-state">No vaults at risk</div>;
    
    const criticalPercent = (critical / total) * 100;
    const highPercent = (high / total) * 100;
    const mediumPercent = (medium / total) * 100;
    const lowPercent = (low / total) * 100;
    
    return (
      <>
        <div className="risk-bar">
          <div className="risk-bar-label">Critical</div>
          <div className="risk-bar-container">
            <div 
              className="risk-bar-fill risk-critical" 
              style={{ width: `${criticalPercent}%` }}
            ></div>
          </div>
          <div className="risk-bar-value">{critical}</div>
        </div>
        <div className="risk-bar">
          <div className="risk-bar-label">High</div>
          <div className="risk-bar-container">
            <div 
              className="risk-bar-fill risk-high" 
              style={{ width: `${highPercent}%` }}
            ></div>
          </div>
          <div className="risk-bar-value">{high}</div>
        </div>
        <div className="risk-bar">
          <div className="risk-bar-label">Medium</div>
          <div className="risk-bar-container">
            <div 
              className="risk-bar-fill risk-medium" 
              style={{ width: `${mediumPercent}%` }}
            ></div>
          </div>
          <div className="risk-bar-value">{medium}</div>
        </div>
        <div className="risk-bar">
          <div className="risk-bar-label">Low</div>
          <div className="risk-bar-container">
            <div 
              className="risk-bar-fill risk-low" 
              style={{ width: `${lowPercent}%` }}
            ></div>
          </div>
          <div className="risk-bar-value">{low}</div>
        </div>
      </>
    );
  }
  
  // Render featured auctions section
  function renderFeaturedAuctions() {
    if (activeAuctions.length === 0) {
      return <div className="empty-state">No active auctions</div>;
    }
    
    // Sort by collateral value and take top 3
    const featuredAuctions = [...activeAuctions]
      .sort((a, b) => {
        const aValue = a.collateralAmount * priceData[a.collateralType] || 0;
        const bValue = b.collateralAmount * priceData[b.collateralType] || 0;
        return bValue - aValue;
      })
      .slice(0, 3);
    
    return (
      <div className="featured-auctions">
        {featuredAuctions.map(auction => (
          <AuctionCard
            key={auction.id}
            auction={auction}
            priceData={priceData}
            compact={true}
            onClick={() => setView('auctions')}
          />
        ))}
        
        {activeAuctions.length > 3 && (
          <button className="view-all-button" onClick={() => setView('auctions')}>
            View All Auctions ({activeAuctions.length})
          </button>
        )}
      </div>
    );
  }
  
  // Render critical vaults section
  function renderCriticalVaults() {
    const criticalVaults = atRiskVaults
      .filter(v => {
        const health = calculateHealthFactor(v.collateralAmount, priceData[v.collateralType], v.debtAmount);
        return health < 1.05;
      })
      .sort((a, b) => {
        // Sort by health factor (lowest first)
        const healthA = calculateHealthFactor(a.collateralAmount, priceData[a.collateralType], a.debtAmount);
        const healthB = calculateHealthFactor(b.collateralAmount, priceData[b.collateralType], b.debtAmount);
        return healthA - healthB;
      })
      .slice(0, 3);
    
    if (criticalVaults.length === 0) {
      return <div className="empty-state">No critical vaults</div>;
    }
    
    return (
      <div className="critical-vaults">
        {criticalVaults.map(vault => (
          <div className="critical-vault-item" key={vault.id}>
            <div className="vault-summary">
              <div className="vault-name">Vault #{vault.id}</div>
              <div className="vault-collateral">
                {vault.collateralAmount} {vault.collateralType}
              </div>
            </div>
            <div className="vault-risk">
              <LiquidationRiskIndicator 
                vault={vault} 
                priceData={priceData}
                size="small" 
                showLabel={true}
                showDetails={false}
              />
            </div>
            <button 
              className="liquidate-now-button"
              disabled={!walletConnected}
              onClick={() => startLiquidation(vault.id)}
            >
              Liquidate
            </button>
          </div>
        ))}
        
        {atRiskVaults.filter(v => {
          const health = calculateHealthFactor(v.collateralAmount, priceData[v.collateralType], v.debtAmount);
          return health < 1.05;
        }).length > 3 && (
          <button className="view-all-button" onClick={() => {
            setCurrentRiskLevel('critical');
            setView('vaults');
          }}>
            View All Critical Vaults
          </button>
        )}
      </div>
    );
  }
  
  // Render recent liquidations section
  function renderRecentLiquidations() {
    // In a real app, this would come from the backend
    const recentLiquidations = [
      {
        id: 'L1001',
        vaultId: 'V3045',
        collateralType: 'SOL',
        collateralAmount: 3.5,
        debtAmount: 220,
        liquidator: '0x1234...5678',
        timestamp: Date.now() - 1000 * 60 * 15, // 15 mins ago
        discount: 12
      },
      {
        id: 'L1002',
        vaultId: 'V2089',
        collateralType: 'ETH',
        collateralAmount: 0.8,
        debtAmount: 2100,
        liquidator: '0x8765...4321',
        timestamp: Date.now() - 1000 * 60 * 45, // 45 mins ago
        discount: 8
      },
      {
        id: 'L1003',
        vaultId: 'V4102',
        collateralType: 'BTC',
        collateralAmount: 0.05,
        debtAmount: 2800,
        liquidator: '0xabcd...efgh',
        timestamp: Date.now() - 1000 * 60 * 120, // 2 hours ago
        discount: 15
      }
    ];
    
    if (recentLiquidations.length === 0) {
      return <div className="empty-state">No recent liquidations</div>;
    }
    
    return (
      <div className="liquidation-history">
        {recentLiquidations.map(liq => (
          <div className="liquidation-history-item" key={liq.id}>
            <div className="liquidation-info">
              <div className="liquidation-id">Liquidation #{liq.id}</div>
              <div className="liquidation-vault">Vault #{liq.vaultId}</div>
              <div className="liquidation-time">
                {new Date(liq.timestamp).toLocaleString()}
              </div>
            </div>
            <div className="liquidation-details">
              <div className="liquidation-collateral">
                {liq.collateralAmount} {liq.collateralType}
              </div>
              <div className="liquidation-debt">
                {liq.debtAmount.toFixed(2)} SAI
              </div>
              <div className="liquidation-discount">
                {liq.discount}% discount
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Render price feeds from Pyth
  function renderPriceFeeds() {
    if (Object.keys(pythFeedData).length === 0) {
      return <div className="empty-state">No price data available</div>;
    }
    
    return (
      <div className="price-feeds">
        <h2>Pyth Network Price Feeds</h2>
        <div className="price-feeds-grid">
          {Object.entries(pythFeedData).map(([pairId, data]) => (
            <div className="price-feed-card" key={pairId}>
              <div className="price-feed-header">
                <div className="pair-name">{pairId}</div>
                <div className="price-value">${formatCurrency(data.price)}</div>
              </div>
              <div className="price-feed-details">
                <div className="detail-row">
                  <span className="detail-label">Last Updated:</span>
                  <span className="detail-value">
                    {data.lastUpdated.toLocaleTimeString()}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Confidence:</span>
                  <span className="detail-value">
                    {(data.confidence * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Feed Address:</span>
                  <span className="detail-value address">
                    {`${data.feedAddress.substring(0, 4)}...${data.feedAddress.substring(data.feedAddress.length - 4)}`}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
};

export default LiquidationDashboard; 