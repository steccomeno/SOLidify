import React, { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { 
    createCDP, 
    addCollateral, 
    drawSai, 
    repaySai, 
    closeCDP, 
    getUserCDPs,
    getCDPInfo,
    connectWallet
} from '../api';
import './SaiInterface.css';

// Define getWalletBalance function since it's missing in the API
const getWalletBalance = async () => {
    // Mock wallet balance function
    await new Promise(resolve => setTimeout(resolve, 800));
    return {
        sol: 2.45,
        sai: 120.50,
    };
};

const SaiInterface = () => {
    const [walletConnected, setWalletConnected] = useState(false);
    const [loading, setLoading] = useState(false);
    const [userCDPs, setUserCDPs] = useState([]);
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

    const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112'); // Native SOL mint
    const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // USDC Mint on devnet

    useEffect(() => {
        checkIfWalletConnected();
    }, []);
    
    useEffect(() => {
        if (walletConnected) {
            loadUserCDPs();
        }
    }, [walletConnected]);
    
    useEffect(() => {
        if (selectedCDP) {
            loadCDPDetails(selectedCDP);
        }
    }, [selectedCDP]);

    useEffect(() => {
        if (walletConnected) {
            loadWalletData();
        }
    }, [walletConnected]);

    const checkIfWalletConnected = async () => {
        try {
            const connected = await connectWallet();
            setWalletConnected(connected);
        } catch (error) {
            console.error("Failed to check wallet connection:", error);
        }
    };

    const handleConnectWallet = async () => {
        setLoading(true);
        try {
            const connected = await connectWallet();
            setWalletConnected(connected);
        } catch (error) {
            console.error("Failed to connect wallet:", error);
        } finally {
            setLoading(false);
        }
    };
    
    const loadUserCDPs = async () => {
        try {
            setLoading(true);
            const cdps = await getUserCDPs();
            console.log('CDPs loaded:', cdps);
            setUserCDPs(cdps);
            setLoading(false);
        } catch (error) {
            console.error('Error loading CDPs:', error);
            setLoading(false);
        }
    };
    
    const loadCDPDetails = async (cdpAddress) => {
        try {
            setLoading(true);
            const details = await getCDPInfo(cdpAddress);
            setCdpDetails(details);
            setLoading(false);
        } catch (error) {
            console.error('Error loading CDP details:', error);
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
    
    const handleCreateCDP = async (e) => {
        e.preventDefault();
        
        if (!createCollateral || !createAmount) {
            return;
        }
        
        try {
            setLoading(true);
            await createCDP(parseFloat(createCollateral), parseFloat(createAmount));
            setCreateCollateral('');
            setCreateAmount('');
            setView('list');
            loadUserCDPs();
        } catch (error) {
            console.error('Error creating CDP:', error);
        } finally {
            setLoading(false);
        }
    };
    
    const handleAddCollateral = async (e) => {
        e.preventDefault();
        
        if (!actionAmount || !selectedCDP) {
            return;
        }
        
        try {
            setLoading(true);
            await addCollateral(selectedCDP, parseFloat(actionAmount));
            setActionAmount('');
            loadCDPDetails(selectedCDP);
            loadUserCDPs();
        } catch (error) {
            console.error('Error adding collateral:', error);
        } finally {
            setLoading(false);
        }
    };
    
    const handleDrawSai = async (e) => {
        e.preventDefault();
        
        if (!actionAmount || !selectedCDP) {
            return;
        }
        
        try {
            setLoading(true);
            await drawSai(selectedCDP, parseFloat(actionAmount));
            setActionAmount('');
            loadCDPDetails(selectedCDP);
            loadUserCDPs();
            loadWalletData();
        } catch (error) {
            console.error('Error drawing SAI:', error);
        } finally {
            setLoading(false);
        }
    };
    
    const handleRepaySai = async (e) => {
        e.preventDefault();
        
        if (!actionAmount || !selectedCDP) {
            return;
        }
        
        try {
            setLoading(true);
            await repaySai(selectedCDP, parseFloat(actionAmount));
            setActionAmount('');
            loadCDPDetails(selectedCDP);
            loadUserCDPs();
            loadWalletData();
        } catch (error) {
            console.error('Error repaying SAI:', error);
        } finally {
            setLoading(false);
        }
    };
    
    const handleCloseCDP = async () => {
        if (!selectedCDP) {
            return;
        }
        
        try {
            setLoading(true);
            await closeCDP(selectedCDP);
            setCdpDetails(null);
            setSelectedCDP(null);
            setView('list');
            loadUserCDPs();
        } catch (error) {
            console.error('Error closing CDP:', error);
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
                            <div className="stat-value">{userCDPs.length}</div>
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
                
                {userCDPs.length === 0 ? (
                    <div className="empty-state">
                        <h3>No CDPs Found</h3>
                        <p>You don't have any active Collateralized Debt Positions. Create one to get started!</p>
                    </div>
                ) : (
                    <div className="cdp-grid">
                        {userCDPs.map((cdp) => (
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
        return (
            <div className="sai-section">
                <div className="section-header">
                    <h2>Create New CDP</h2>
                    <p className="section-description">
                        Lock your collateral and generate SAI stablecoins
                    </p>
                </div>
                
                <div className="card form-card">
                    <form onSubmit={handleCreateCDP}>
                        <div className="form-group">
                            <label htmlFor="collateralType">Collateral Type</label>
                            <select 
                                id="collateralType"
                                value={collateralType}
                                onChange={(e) => setCollateralType(e.target.value)}
                                required
                            >
                                <option value="SOL">SOL</option>
                            </select>
                        </div>
                        
                        <div className="form-group">
                            <label htmlFor="collateralAmount">Collateral Amount</label>
                            <div className="input-with-suffix">
                                <input 
                                    type="number" 
                                    id="collateralAmount"
                                    value={createCollateral}
                                    onChange={(e) => setCreateCollateral(e.target.value)}
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
                                    value={createAmount}
                                    onChange={(e) => setCreateAmount(e.target.value)}
                                    placeholder="0.0"
                                    step="0.01"
                                    min="1"
                                    required
                                />
                                <span className="suffix">SAI</span>
                            </div>
                        </div>
                        
                        {parseFloat(createCollateral) > 0 && parseFloat(createAmount) > 0 && (
                            <div className="preview-box">
                                <h4>Preview</h4>
                                <div className="preview-stats">
                                    <div className="preview-stat">
                                        <span className="label">Collateralization Ratio</span>
                                        <span className="value">
                                            {Math.floor((parseFloat(createCollateral) * 15) / parseFloat(createAmount))}%
                                        </span>
                                    </div>
                                    <div className="preview-stat">
                                        <span className="label">Liquidation Price</span>
                                        <span className="value">
                                            ${(parseFloat(createAmount) * 10 / parseFloat(createCollateral) / 15).toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="preview-stat">
                                        <span className="label">Stability Fee</span>
                                        <span className="value">2.5%</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        
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
                                disabled={loading}
                            >
                                {loading ? 'Creating...' : 'Create CDP'}
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
    
    // Main render function
    return (
        <div className="sai-interface">
            {!walletConnected ? (
                <div className="connect-prompt">
                    <h2>Connect Your Wallet</h2>
                    <p>Connect your wallet to create and manage Collateralized Debt Positions.</p>
                    <button 
                        className="button primary-button"
                        onClick={handleConnectWallet}
                        disabled={loading}
                    >
                        {loading ? 'Connecting...' : 'Connect Wallet'}
                    </button>
                </div>
            ) : (
                <>
                    {view === 'list' && renderCDPList()}
                    {view === 'create' && renderCreateCDPForm()}
                    {view === 'detail' && renderCDPDetail()}
                </>
            )}
        </div>
    );
};

export default SaiInterface;
