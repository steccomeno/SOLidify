import React, { useState, useEffect } from 'react';
import { 
    getAllActiveLiquidations, 
    getLiquidationHistoryForUser, 
    bidOnLiquidationAuction,
    connectWallet,
    getCollateralPrice 
} from '../api';
import { checkLiquidationRisk } from '../utils/liquidationUtils';
import AuctionCard from './AuctionCard';
import BidForm from './BidForm';
import LiquidationRiskIndicator from './LiquidationRiskIndicator';
import './LiquidationAuctionInterface.css';

/**
 * LiquidationAuctionInterface Component
 * 
 * A dedicated interface for viewing and participating in liquidation auctions
 * Shows active auctions, allows users to place bids, and displays auction history
 */
const LiquidationAuctionInterface = () => {
    const [walletConnected, setWalletConnected] = useState(false);
    const [loading, setLoading] = useState(false);
    const [activeAuctions, setActiveAuctions] = useState([]);
    const [auctionHistory, setAuctionHistory] = useState([]);
    const [selectedAuction, setSelectedAuction] = useState(null);
    const [activePrices, setActivePrices] = useState({});
    const [activeTab, setActiveTab] = useState('active'); // 'active', 'history'
    const [statusMessage, setStatusMessage] = useState('');
    const [statusType, setStatusType] = useState('info'); // 'info', 'success', 'error'
    
    // Initialize the component
    useEffect(() => {
        checkIfWalletConnected();
    }, []);
    
    // Load auctions when wallet connection changes
    useEffect(() => {
        if (walletConnected) {
            loadActiveAuctions();
            loadAuctionHistory();
        }
    }, [walletConnected]);
    
    // Set up price refresh interval
    useEffect(() => {
        let interval;
        if (walletConnected && activeAuctions.length > 0) {
            // Refresh prices every 10 seconds
            interval = setInterval(() => {
                refreshPrices();
            }, 10000);
        }
        
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [walletConnected, activeAuctions]);
    
    // Check if wallet is connected
    const checkIfWalletConnected = async () => {
        try {
            const connected = await connectWallet();
            setWalletConnected(connected);
        } catch (error) {
            console.error("Failed to check wallet connection:", error);
        }
    };
    
    // Connect wallet handler
    const handleConnectWallet = async () => {
        setLoading(true);
        try {
            const connected = await connectWallet();
            setWalletConnected(connected);
        } catch (error) {
            console.error("Failed to connect wallet:", error);
            showMessage("Failed to connect wallet. Please try again.", "error");
        } finally {
            setLoading(false);
        }
    };
    
    // Load active auctions
    const loadActiveAuctions = async () => {
        try {
            setLoading(true);
            const auctions = await getAllActiveLiquidations();
            // Filter for auctions that are actually in the auction stage
            const activeAuctions = auctions.filter(a => a.status === 'auction_active');
            setActiveAuctions(activeAuctions);
            
            // Load initial prices for each collateral type
            const prices = {};
            for (const auction of activeAuctions) {
                if (!prices[auction.collateralType]) {
                    prices[auction.collateralType] = await getCollateralPrice(auction.collateralType);
                }
            }
            setActivePrices(prices);
            setLoading(false);
        } catch (error) {
            console.error('Error loading active auctions:', error);
            showMessage("Failed to load active auctions", "error");
            setLoading(false);
        }
    };
    
    // Load auction history
    const loadAuctionHistory = async () => {
        try {
            setLoading(true);
            const history = await getLiquidationHistoryForUser();
            // Filter for completed auctions
            const completedAuctions = history.filter(a => a.status === 'completed');
            setAuctionHistory(completedAuctions);
            setLoading(false);
        } catch (error) {
            console.error('Error loading auction history:', error);
            showMessage("Failed to load auction history", "error");
            setLoading(false);
        }
    };
    
    // Refresh collateral prices
    const refreshPrices = async () => {
        try {
            const collateralTypes = [...new Set(activeAuctions.map(a => a.collateralType))];
            const newPrices = { ...activePrices };
            
            for (const type of collateralTypes) {
                newPrices[type] = await getCollateralPrice(type);
            }
            
            setActivePrices(newPrices);
        } catch (error) {
            console.error('Error refreshing prices:', error);
        }
    };

    // Handle bid placement success
    const handleBidSuccess = async (result) => {
        showMessage("Bid placed successfully!", "success");
        
        // Refresh data
        await loadActiveAuctions();
        await loadAuctionHistory();
        
        // If this was an instant buy, select no auction
        if (result.status === 'instant_buy') {
            setSelectedAuction(null);
        }
    };

    // Handle bid placement error
    const handleBidError = (error) => {
        showMessage(error.message || "Failed to place bid", "error");
    };

    // Show status message
    const showMessage = (message, type = 'info') => {
        setStatusMessage(message);
        setStatusType(type);
        
        // Clear message after 5 seconds
        setTimeout(() => {
            setStatusMessage('');
        }, 5000);
    };
    
    // Render the active auctions list
    const renderActiveAuctions = () => {
        if (activeAuctions.length === 0) {
            return (
                <div className="no-auctions">
                    <p>There are no active auctions at this time.</p>
                </div>
            );
        }
        
        return (
            <div className="auctions-grid">
                {activeAuctions.map(auction => (
                    <AuctionCard
                        key={auction.id}
                        auction={auction}
                        priceData={activePrices}
                        selected={selectedAuction?.id === auction.id}
                        onClick={() => setSelectedAuction(auction)}
                    />
                ))}
            </div>
        );
    };
    
    // Render the auction history
    const renderAuctionHistory = () => {
        if (auctionHistory.length === 0) {
            return (
                <div className="no-auctions">
                    <p>No auction history available.</p>
                </div>
            );
        }
        
        return (
            <div className="history-grid">
                {auctionHistory.map(auction => (
                    <div key={auction.id} className="history-item">
                        <div className="history-header">
                            <span className="auction-id">Auction #{auction.id}</span>
                            <span className="auction-date">
                                {new Date(auction.timestamp).toLocaleDateString()}
                            </span>
                        </div>
                        <div className="history-body">
                            <div className="history-collateral">
                                {auction.collateralAmount} {auction.collateralType}
                            </div>
                            <div className="history-details">
                                <div className="history-row">
                                    <span className="history-label">Final Price:</span>
                                    <span className="history-value">${auction.auctionData.finalPrice.toFixed(2)}</span>
                                </div>
                                <div className="history-row">
                                    <span className="history-label">Winner:</span>
                                    <span className="winner-address">
                                        {auction.auctionData.winner.substring(0, 6)}...{auction.auctionData.winner.substring(auction.auctionData.winner.length - 4)}
                                    </span>
                                </div>
                                <div className="history-row">
                                    <span className="history-label">Total Bids:</span>
                                    <span className="history-value">{auction.auctionData.bids}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    };
    
    // Main render function
    return (
        <div className="liquidation-auction-interface">
            <div className="auction-header">
                <h2>Liquidation Auctions</h2>
                <div className="wallet-section">
                    {walletConnected ? (
                        <div className="wallet-connected">Wallet Connected</div>
                    ) : (
                        <button 
                            onClick={handleConnectWallet} 
                            disabled={loading}
                            className="connect-button"
                        >
                            {loading ? 'Connecting...' : 'Connect Wallet'}
                        </button>
                    )}
                </div>
            </div>
            
            {statusMessage && (
                <div className={`status-message ${statusType}`}>
                    {statusMessage}
                </div>
            )}
            
            {walletConnected && (
                <>
                    <div className="auction-tabs">
                        <button 
                            className={`tab-button ${activeTab === 'active' ? 'active' : ''}`}
                            onClick={() => setActiveTab('active')}
                        >
                            Active Auctions
                        </button>
                        <button 
                            className={`tab-button ${activeTab === 'history' ? 'active' : ''}`}
                            onClick={() => setActiveTab('history')}
                        >
                            Auction History
                        </button>
                    </div>
                    
                    {activeTab === 'active' ? (
                        <div className="active-auctions-container">
                            <div className="auctions-section">
                                <h3>Active Auctions</h3>
                                {loading && activeAuctions.length === 0 ? (
                                    <div className="loading">Loading auctions...</div>
                                ) : (
                                    renderActiveAuctions()
                                )}
                            </div>
                            
                            <div className="bid-section">
                                <BidForm
                                    auction={selectedAuction}
                                    priceData={activePrices}
                                    onBidPlaced={handleBidSuccess}
                                    onError={handleBidError}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="history-container">
                            <h3>Auction History</h3>
                            {loading && auctionHistory.length === 0 ? (
                                <div className="loading">Loading history...</div>
                            ) : (
                                renderAuctionHistory()
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default LiquidationAuctionInterface; 