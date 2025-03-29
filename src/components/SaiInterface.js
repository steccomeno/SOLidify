import React, { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { 
    createCDP, 
    addCollateral, 
    drawSai, 
    repaySai, 
    closeCDP, 
    getUserCDPs,
    getCDPInfo,
    getWalletBalance,
    getCollateralPrice,
    checkVaultLiquidationRisk,
    getAllActiveLiquidations,
    initializeAPI,
    isAPIInitialized
} from '../api/index';
import LiquidationRiskIndicator from './LiquidationRiskIndicator';
import './SaiInterface.css';
require('@solana/wallet-adapter-react-ui/styles.css');

const SaiInterface = () => {
    const { connected, publicKey, wallet } = useWallet();
    const { setVisible } = useWalletModal();
    const [cdps, setCdps] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [collateralAmount, setCollateralAmount] = useState('');
    const [saiAmount, setSaiAmount] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [selectedCDP, setSelectedCDP] = useState(null);
    const [cdpDetails, setCdpDetails] = useState(null);
    const [view, setView] = useState('list'); // 'list', 'create', 'detail'
    
    // Form states
    const [createAmount, setCreateAmount] = useState('');
    const [createCollateral, setCreateCollateral] = useState('');
    const [collateralType, setCollateralType] = useState('SOL');
    const [actionAmount, setActionAmount] = useState('');
    
    const [walletBalance, setWalletBalance] = useState({
        sol: 0,
        sai: 0,
    });

    // New states for liquidation-related data
    const [collateralPrice, setCollateralPrice] = useState(0);
    const [liquidationRisk, setLiquidationRisk] = useState(null);
    const [activeLiquidations, setActiveLiquidations] = useState([]);
    const [showLiquidations, setShowLiquidations] = useState(false);

    useEffect(() => {
        const initializeWalletAndLoadData = async () => {
            if (connected && wallet && publicKey) {
                try {
                    console.log('Initializing wallet connection:', {
                        connected,
                        hasWallet: !!wallet,
                        hasPublicKey: !!publicKey,
                        publicKeyStr: publicKey.toString()
                    });

                    // Clear any existing errors
                    setError(null);

                    // Initialize API if not already initialized
                    if (!isAPIInitialized()) {
                        console.log('Initializing API...');
                        await initializeAPI(wallet);
                    }

                    // Load data only after API is initialized
                    console.log('Loading user data...');
                    await Promise.all([
                        loadUserCDPs(),
                        loadWalletData(),
                        loadActiveLiquidations()
                    ]);
                    console.log('User data loaded successfully');
                } catch (error) {
                    console.error('Failed to initialize:', error);
                    setError(error.message || 'Failed to initialize wallet connection. Please try reconnecting your wallet.');
                }
            }
        };

        initializeWalletAndLoadData();
    }, [connected, wallet, publicKey]);

    useEffect(() => {
        if (selectedCDP) {
            loadCDPDetails(selectedCDP);
        }
    }, [selectedCDP]);

    useEffect(() => {
        if (cdpDetails && cdpDetails.collateralType) {
            loadCollateralPrice(cdpDetails.collateralType);
            checkLiquidationRisk();
        }
    }, [cdpDetails]);

    const loadUserCDPs = async () => {
        try {
            setLoading(true);
            const result = await getUserCDPs();
            if (result.success) {
                setCdps(result.data);
            } else {
                setError(result.error || 'Failed to load CDPs');
            }
        } catch (error) {
            setError('Failed to load CDPs');
            console.error('Error loading CDPs:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadCDPDetails = async (cdpAddress) => {
        try {
            setLoading(true);
            const result = await getCDPInfo(cdpAddress);
            if (result.success) {
                setCdpDetails(result.data);
            } else {
                console.error('Failed to load CDP details:', result.error);
            }
        } catch (error) {
            console.error('Error loading CDP details:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadWalletData = async () => {
        try {
            const balance = await getWalletBalance();
            setWalletBalance(balance);
        } catch (error) {
            console.error('Error loading wallet data:', error);
        }
    };

    const loadActiveLiquidations = async () => {
        try {
            const liquidations = await getAllActiveLiquidations();
            setActiveLiquidations(liquidations);
        } catch (error) {
            console.error('Error loading liquidations:', error);
        }
    };

    const loadCollateralPrice = async (type) => {
        try {
            const price = await getCollateralPrice(type);
            setCollateralPrice(price);
        } catch (error) {
            console.error('Error loading collateral price:', error);
        }
    };

    const checkLiquidationRisk = async () => {
        if (!selectedCDP) return;
        try {
            const risk = await checkVaultLiquidationRisk(selectedCDP);
            setLiquidationRisk(risk);
        } catch (error) {
            console.error('Error checking liquidation risk:', error);
        }
    };

    const handleCreateCDP = async (e) => {
        e.preventDefault();
        
        if (!connected || !wallet || !publicKey) {
            setError('Please connect your wallet first');
            return;
        }

        // Ensure API is initialized
        if (!isAPIInitialized()) {
            try {
                console.log('Initializing API before creating CDP...');
                await initializeAPI({
                    ...wallet,
                    publicKey: publicKey
                });
                console.log('API initialized successfully');
            } catch (error) {
                console.error('Failed to initialize API:', error);
                setError('Failed to initialize wallet connection. Please try reconnecting your wallet.');
                return;
            }
        }

        if (!collateralAmount || !saiAmount) {
            setError('Please enter both collateral and SAI amounts');
            return;
        }

        const collateral = parseFloat(collateralAmount);
        const sai = parseFloat(saiAmount);

        if (isNaN(collateral) || isNaN(sai)) {
            setError('Please enter valid numbers');
            return;
        }

        if (collateral <= 0 || sai <= 0) {
            setError('Amounts must be greater than 0');
            return;
        }

        try {
            setIsCreating(true);
            setError(null);
            
            console.log('Creating CDP with:', { collateral, sai });
            const result = await createCDP(collateral, sai);
            console.log('CDP creation result:', result);

            if (result.success) {
                setCollateralAmount('');
                setSaiAmount('');
                setView('list');
                await loadUserCDPs();
            } else {
                setError(result.error || 'Failed to create CDP');
            }
        } catch (error) {
            console.error('Error creating CDP:', error);
            setError(error.message || 'Failed to create CDP');
        } finally {
            setIsCreating(false);
        }
    };

    const handleAddCollateral = async () => {
        try {
            setLoading(true);
            const amount = parseFloat(actionAmount);

            if (isNaN(amount)) {
                throw new Error('Please enter a valid amount');
            }

            const result = await addCollateral(selectedCDP, amount * 1e9);

            if (result.success) {
                loadCDPDetails(selectedCDP);
                setActionAmount('');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Error adding collateral:', error);
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDrawSai = async () => {
        try {
            setLoading(true);
            const amount = parseFloat(actionAmount);

            if (isNaN(amount)) {
                throw new Error('Please enter a valid amount');
            }

            const result = await drawSai(selectedCDP, amount * 1e9);

            if (result.success) {
                loadCDPDetails(selectedCDP);
                setActionAmount('');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Error drawing SAI:', error);
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRepaySai = async () => {
        try {
            setLoading(true);
            const amount = parseFloat(actionAmount);

            if (isNaN(amount)) {
                throw new Error('Please enter a valid amount');
            }

            const result = await repaySai(selectedCDP, amount * 1e9);

            if (result.success) {
                loadCDPDetails(selectedCDP);
                setActionAmount('');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Error repaying SAI:', error);
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCloseCDP = async () => {
        try {
            setLoading(true);
            const result = await closeCDP(selectedCDP);

            if (result.success) {
                setView('list');
                loadUserCDPs();
                setSelectedCDP(null);
                setCdpDetails(null);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Error closing CDP:', error);
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    // Render the CDP list view
    const renderCDPList = () => {
        return (
            <div className="sai-section">
                <div className="section-header">
                    <h2>Your Collateralized Debt Positions</h2>
                    <p className="section-description">
                        Create and manage your CDPs to generate SAI
                    </p>
                </div>
                
                <div className="dashboard-stats">
                    <div className="stat-card">
                        <div className="stat-icon solana-icon">
                            <span>◎</span>
                        </div>
                        <div className="stat-content">
                            <h3 className="stat-title">SOL Balance</h3>
                            <div className="stat-value">{walletBalance.sol} SOL</div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon sai-icon">
                            <span>$</span>
                        </div>
                        <div className="stat-content">
                            <h3 className="stat-title">SAI Balance</h3>
                            <div className="stat-value">{walletBalance.sai} SAI</div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon cdp-icon">
                            <span>#</span>
                        </div>
                        <div className="stat-content">
                            <h3 className="stat-title">Active CDPs</h3>
                            <div className="stat-value">{cdps.length}</div>
                        </div>
                    </div>
                </div>
                
                <div className="action-bar">
                    <button 
                        className="button primary-button"
                        onClick={() => setView('create')}
                    >
                        Create New CDP
                    </button>
                </div>
                
                {cdps.length === 0 ? (
                    <div className="empty-state">
                        <h3>No CDPs Found</h3>
                        <p>You don't have any active Collateralized Debt Positions. Create one to get started!</p>
                    </div>
                ) : (
                    <div className="cdp-grid">
                        {cdps.map((cdp) => (
                            cdp && cdp.id ? (
                            <div 
                                key={cdp.id} 
                                className={`cdp-card ${selectedCDP === cdp.id ? 'selected' : ''}`}
                                onClick={() => {
                                    setSelectedCDP(cdp.id);
                                    setView('detail');
                                }}
                            >
                                <div className="cdp-header">
                                    <h3 className="cdp-id">CDP #{cdp.id && typeof cdp.id === 'string' ? cdp.id.substring(4, 10) : 'Unknown'}</h3>
                                    <span className={`cdp-status ${cdp.status}`}>{cdp.status}</span>
                                </div>
                                
                                <div className="cdp-stats">
                                    <div className="cdp-stat">
                                        <span className="stat-label">Collateral</span>
                                        <span className="stat-value">{cdp.collateralAmount} SOL</span>
                                    </div>
                                    <div className="cdp-stat">
                                        <span className="stat-label">Debt</span>
                                        <span className="stat-value">{cdp.debtAmount} SAI</span>
                                    </div>
                                    <div className="cdp-stat">
                                        <span className="stat-label">Ratio</span>
                                        <span className="stat-value">{cdp.collateralizationRatio}%</span>
                                    </div>
                                </div>
                                
                                <div className="cdp-ratio-bar">
                                    <div 
                                        className={`ratio-fill ${getRatioStatus(cdp.collateralizationRatio)}`}
                                        style={{ width: `${Math.min(100, cdp.collateralizationRatio / 3)}%` }}
                                    ></div>
                                </div>
                                
                                <div className="liquidation-info">
                                    <span className="label">Liquidation Price</span>
                                    <span className="value">${cdp.liquidationPrice}</span>
                                </div>
                            </div>
                            ) : null
                        ))}
                    </div>
                )}
            </div>
        );
    };
    
    const getRatioStatus = (ratio) => {
        if (ratio >= 200) return 'excellent';
        if (ratio >= 175) return 'good';
        if (ratio >= 150) return 'safe';
        return 'danger';
    };
    
    // Render the CDP creation form
    const renderCreateCDPForm = () => {
        if (!connected) {
            return (
                <div className="sai-section">
                    <div className="section-header">
                        <h2>Create New CDP</h2>
                        <p className="section-description">
                            Lock your collateral and generate SAI stablecoins
                        </p>
                    </div>
                    
                    <div className="card form-card">
                        <div className="wallet-connect-prompt">
                            <p>Please connect your wallet to create a CDP</p>
                            <WalletMultiButton className="wallet-button" />
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="sai-section">
                <div className="section-header">
                    <h2>Create New CDP</h2>
                    <p className="section-description">
                        Lock your collateral and generate SAI stablecoins
                    </p>
                </div>
                
                <div className="card form-card">
                    {error && (
                        <div className="error-message">
                            {error}
                        </div>
                    )}
                    
                    <form onSubmit={handleCreateCDP}>
                        <div className="form-group">
                            <label htmlFor="collateralAmount">Collateral Amount</label>
                            <div className="input-with-suffix">
                                <input 
                                    type="number" 
                                    id="collateralAmount"
                                    value={collateralAmount}
                                    onChange={(e) => setCollateralAmount(e.target.value)}
                                    placeholder="0.0"
                                    step="0.01"
                                    min="0.05"
                                    required
                                />
                                <span className="suffix">SOL</span>
                            </div>
                            <div className="balance-display">
                                Available: {walletBalance.sol} SOL
                            </div>
                        </div>
                        
                        <div className="form-group">
                            <label htmlFor="saiAmount">SAI to Generate</label>
                            <div className="input-with-suffix">
                                <input 
                                    type="number" 
                                    id="saiAmount"
                                    value={saiAmount}
                                    onChange={(e) => setSaiAmount(e.target.value)}
                                    placeholder="0.0"
                                    step="0.01"
                                    min="0.01"
                                    required
                                />
                                <span className="suffix">SAI</span>
                            </div>
                        </div>
                        
                        <div className="form-actions">
                            <button 
                                type="button" 
                                className="button secondary-button"
                                onClick={() => setView('list')}
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit" 
                                className="button primary-button"
                                disabled={isCreating || !connected}
                            >
                                {isCreating ? 'Creating...' : 'Create CDP'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    };
    
    // Render the CDP detail view
    const renderCDPDetail = () => {
        if (!cdpDetails) {
            return (
                <div className="loading-state">
                    <p>Loading CDP details...</p>
                </div>
            );
        }
        
        return (
            <div className="sai-section">
                <div className="section-header with-back">
                    <button 
                        className="back-button"
                        onClick={() => setView('list')}
                    >
                        &larr; Back to CDP List
                    </button>
                    <h2>CDP Details</h2>
                </div>
                
                <div className="cdp-detail-grid">
                    <div className="cdp-overview card">
                        <div className="cdp-detail-header">
                            <h3>CDP #{cdpDetails.id && typeof cdpDetails.id === 'string' ? cdpDetails.id.substring(4, 10) : 'Unknown'}</h3>
                            <span className={`cdp-status ${cdpDetails.status}`}>{cdpDetails.status}</span>
                        </div>
                        
                        <div className="cdp-detail-stats">
                            <div className="detail-stat">
                                <span className="stat-label">Collateral</span>
                                <span className="stat-value">{cdpDetails.collateralAmount} SOL</span>
                            </div>
                            <div className="detail-stat">
                                <span className="stat-label">Debt</span>
                                <span className="stat-value">{cdpDetails.debtAmount} SAI</span>
                            </div>
                            <div className="detail-stat">
                                <span className="stat-label">Collateralization Ratio</span>
                                <span className={`stat-value ${getRatioStatus(cdpDetails.collateralizationRatio)}`}>
                                    {cdpDetails.collateralizationRatio}%
                                </span>
                            </div>
                        </div>
                        
                        <div className="cdp-ratio-visualization">
                            <h4>Collateralization Ratio</h4>
                            <div className="ratio-bar">
                                <div className="danger-zone" style={{ width: '33.3%' }}>
                                    <span>Danger</span>
                                </div>
                                <div className="safe-zone" style={{ width: '16.7%' }}>
                                    <span>Safe</span>
                                </div>
                                <div className="good-zone" style={{ width: '50%' }}>
                                    <span>Excellent</span>
                                </div>
                                <div 
                                    className="ratio-marker"
                                    style={{ left: `${Math.min(100, cdpDetails.collateralizationRatio / 3)}%` }}
                                >
                                    <span>{cdpDetails.collateralizationRatio}%</span>
                                </div>
                            </div>
                        </div>
                        
                        <div className="extra-info">
                            <div className="info-row">
                                <span className="label">Liquidation Price</span>
                                <span className="value">${cdpDetails.liquidationPrice}</span>
                            </div>
                            <div className="info-row">
                                <span className="label">Available to Withdraw</span>
                                <span className="value">
                                    {Math.max(0, cdpDetails.collateralAmount - (cdpDetails.debtAmount / 10 * 1.5)).toFixed(2)} SOL
                                </span>
                            </div>
                            <div className="info-row">
                                <span className="label">Available to Generate</span>
                                <span className="value">
                                    {cdpDetails.availableToBorrow} SAI
                                </span>
                            </div>
                            <div className="info-row">
                                <span className="label">Stability Fee</span>
                                <span className="value">{cdpDetails.stabilityFee}</span>
                            </div>
                            <div className="info-row">
                                <span className="label">Creation Date</span>
                                <span className="value">{cdpDetails.createdAt}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="cdp-actions">
                        <div className="action-card card">
                            <h4>Add Collateral</h4>
                            <form onSubmit={handleAddCollateral}>
                                <div className="form-group">
                                    <div className="input-with-suffix">
                                        <input 
                                            type="number" 
                                            value={view === 'detail' && actionAmount}
                                            onChange={(e) => setActionAmount(e.target.value)}
                                            placeholder="0.0"
                                            step="0.01"
                                            min="0.01"
                                            required
                                        />
                                        <span className="suffix">SOL</span>
                                    </div>
                                    <div className="balance-display">
                                        Available: {walletBalance.sol} SOL
                                    </div>
                                </div>
                                <button 
                                    type="submit" 
                                    className="button secondary-button full-width"
                                    disabled={loading}
                                >
                                    Add Collateral
                                </button>
                            </form>
                        </div>
                        
                        <div className="action-card card">
                            <h4>Generate SAI</h4>
                            <form onSubmit={handleDrawSai}>
                                <div className="form-group">
                                    <div className="input-with-suffix">
                    <input
                        type="number"
                                            value={view === 'detail' && actionAmount}
                                            onChange={(e) => setActionAmount(e.target.value)}
                                            placeholder="0.0"
                                            step="0.01"
                                            min="0.01"
                                            required
                                        />
                                        <span className="suffix">SAI</span>
                                    </div>
                                    <div className="balance-display">
                                        Available: {cdpDetails.availableToBorrow} SAI
                                    </div>
                                </div>
                                <button 
                                    type="submit" 
                                    className="button primary-button full-width"
                                    disabled={loading || cdpDetails.availableToBorrow <= 0}
                                >
                                    Generate SAI
                                </button>
                            </form>
                        </div>
                        
                        <div className="action-card card">
                            <h4>Repay SAI</h4>
                            <form onSubmit={handleRepaySai}>
                                <div className="form-group">
                                    <div className="input-with-suffix">
                    <input
                                            type="number" 
                                            value={view === 'detail' && actionAmount}
                                            onChange={(e) => setActionAmount(e.target.value)}
                                            placeholder="0.0"
                                            step="0.01"
                                            min="0.01"
                                            max={cdpDetails.debtAmount}
                                            required
                                        />
                                        <span className="suffix">SAI</span>
                                    </div>
                                    <div className="balance-display">
                                        Your Balance: {walletBalance.sai} SAI
                                    </div>
                                </div>
                                <button 
                                    type="submit" 
                                    className="button secondary-button full-width"
                                    disabled={loading || cdpDetails.debtAmount <= 0}
                                >
                                    Repay SAI
                                </button>
                            </form>
                        </div>
                        
                        {cdpDetails.debtAmount === 0 && (
                            <div className="action-card card danger-card">
                                <h4>Close CDP</h4>
                                <p>
                                    This CDP has no outstanding debt. You can close it and withdraw all collateral.
                                </p>
                                <button 
                                    onClick={handleCloseCDP}
                                    className="button danger-button full-width"
                                    disabled={loading}
                                >
                                    Close CDP
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };
    
    // Add this inside the render, in the 'detail' view section
    const renderLiquidationRisk = () => {
        if (!cdpDetails || !collateralPrice) return null;
        
        return (
            <LiquidationRiskIndicator
                collateralAmount={cdpDetails.collateralAmount}
                debtAmount={cdpDetails.debtAmount}
                collateralPrice={collateralPrice}
                liquidationThreshold={110}
                safeThreshold={150}
            />
        );
    };

    const renderActiveLiquidations = () => {
        if (activeLiquidations.length === 0) {
            return (
                <div className="no-liquidations">
                    <p>No active liquidations at this time.</p>
                </div>
            );
        }

        return (
            <div className="liquidations-list">
                <h3>Active Liquidations</h3>
                {activeLiquidations.map(liquidation => (
                    <div className="liquidation-item" key={liquidation.id}>
                        <div className="liquidation-header">
                            <span className="liquidation-id">{liquidation.id}</span>
                            <span className={`liquidation-status ${liquidation.status}`}>
                                {liquidation.status === 'auction_active' ? 'Auction Active' : 'Pending Liquidation'}
                            </span>
                        </div>
                        <div className="liquidation-details">
                            <div>Collateral: {liquidation.collateralAmount} {liquidation.collateralType}</div>
                            <div>Debt: {liquidation.debtAmount} SAI</div>
                            <div>Ratio: {liquidation.collateralizationRatio.toFixed(2)}%</div>
                            {liquidation.status === 'auction_active' && liquidation.auctionData && (
                                <div className="auction-data">
                                    <div>Current Price: {liquidation.auctionData.currentPrice.toFixed(2)} SAI</div>
                                    <div>Ends: {new Date(liquidation.auctionData.endTime).toLocaleString()}</div>
                                    <button 
                                        className="bid-button"
                                        onClick={() => window.alert('Bidding feature coming soon!')}
                                    >
                                        Place Bid
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    // Main render function
    return (
        <div className="sai-interface">
            <div className="sai-content">
                <div className="sai-header">
                    <h2>CDP Management</h2>
                    <div className="wallet-info">
                        {connected ? (
                            <>
                                <span>Connected: {publicKey.toString().slice(0, 4)}...{publicKey.toString().slice(-4)}</span>
                                <span>SOL Balance: {walletBalance.sol}</span>
                                <span>SAI Balance: {walletBalance.sai}</span>
                            </>
                        ) : (
                            <WalletMultiButton className="wallet-button" />
                        )}
                    </div>
                </div>

                <div className="sai-navigation">
                    <button 
                        className={`nav-button ${view === 'list' ? 'active' : ''}`}
                        onClick={() => setView('list')}
                    >
                        My CDPs
                    </button>
                    <button 
                        className={`nav-button ${view === 'create' ? 'active' : ''}`}
                        onClick={() => setView('create')}
                    >
                        Create CDP
                    </button>
                </div>

                {loading ? (
                    <div className="loading-container">
                        <div className="loading-spinner"></div>
                        <p>Loading...</p>
                    </div>
                ) : (
                    <>
                        {view === 'list' && renderCDPList()}
                        {view === 'create' && renderCreateCDPForm()}
                        {view === 'detail' && renderCDPDetail()}
                    </>
                )}
            </div>
        </div>
    );
};

export default SaiInterface;
