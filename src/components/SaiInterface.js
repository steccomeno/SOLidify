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
            setLoading(true);
            const balance = await getWalletBalance();
            setWalletBalance(balance);
        } catch (error) {
            console.error("Error loading wallet data:", error);
        } finally {
            setLoading(false);
        }
    };
    
    const handleCreateCDP = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            
            // Convert inputs to program-compatible units
            const saiAmount = parseFloat(createAmount) * 1e6; // SAI to micro-units
            
            let collateralMint, collateralAmount;
            
            if (collateralType === 'SOL') {
                collateralMint = SOL_MINT;
                collateralAmount = parseFloat(createCollateral) * 1e9; // SOL to lamports
            } else {
                collateralMint = USDC_MINT;
                collateralAmount = parseFloat(createCollateral) * 1e6; // USDC to micro-units
            }
            
            await createCDP(saiAmount, collateralAmount, collateralMint);
            
            alert(`CDP created successfully! Deposited ${createCollateral} ${collateralType} and generated ${createAmount} SAI.`);
            
            // Reset form and go back to list
            setCreateAmount('');
            setCreateCollateral('');
            setCollateralType('SOL');
            setView('list');
            await loadUserCDPs();
            
            setLoading(false);
        } catch (error) {
            console.error('Error creating CDP:', error);
            alert('Failed to create CDP: ' + error.message);
            setLoading(false);
        }
    };
    
    const handleAddCollateral = async () => {
        try {
            setLoading(true);
            
            // Convert input to program-compatible units
            let amount;
            if (cdpDetails.collateralType === SOL_MINT.toString()) {
                amount = parseFloat(actionAmount) * 1e9; // SOL to lamports
            } else {
                amount = parseFloat(actionAmount) * 1e6; // USDC to micro-units
            }
            
            const collateralMint = new PublicKey(cdpDetails.collateralType);
            
            await addCollateral(selectedCDP, amount, collateralMint);
            alert('Collateral added successfully!');
            
            // Reload CDP details
            await loadCDPDetails(selectedCDP);
            setActionAmount('');
            
            setLoading(false);
        } catch (error) {
            console.error('Error adding collateral:', error);
            alert('Failed to add collateral: ' + error.message);
            setLoading(false);
        }
    };
    
    const handleDrawSai = async () => {
        try {
            setLoading(true);
            
            // Convert input to micro-units
            const amount = parseFloat(actionAmount) * 1e6; // SAI to micro-units
            const collateralMint = new PublicKey(cdpDetails.collateralType);
            
            await drawSai(selectedCDP, amount, collateralMint);
            alert('SAI drawn successfully!');
            
            // Reload CDP details
            await loadCDPDetails(selectedCDP);
            setActionAmount('');
            
            setLoading(false);
        } catch (error) {
            console.error('Error drawing SAI:', error);
            alert('Failed to draw SAI: ' + error.message);
            setLoading(false);
        }
    };
    
    const handleRepaySai = async () => {
        try {
            setLoading(true);
            
            // Convert input to micro-units
            const amount = parseFloat(actionAmount) * 1e6; // SAI to micro-units
            const collateralMint = new PublicKey(cdpDetails.collateralType);
            
            await repaySai(selectedCDP, amount, collateralMint);
            alert('SAI repaid successfully!');
            
            // Reload CDP details
            await loadCDPDetails(selectedCDP);
            setActionAmount('');
            
            setLoading(false);
        } catch (error) {
            console.error('Error repaying SAI:', error);
            alert('Failed to repay SAI: ' + error.message);
            setLoading(false);
        }
    };
    
    const handleCloseCDP = async () => {
        try {
            setLoading(true);
            
            const collateralMint = new PublicKey(cdpDetails.collateralType);
            
            await closeCDP(selectedCDP, collateralMint);
            alert('CDP closed successfully!');
            
            // Reset and go back to list
            setSelectedCDP(null);
            setCdpDetails(null);
            setView('list');
            await loadUserCDPs();
            
            setLoading(false);
        } catch (error) {
            console.error('Error closing CDP:', error);
            alert('Failed to close CDP: ' + error.message);
            setLoading(false);
        }
    };
    
    const renderCDPList = () => {
        if (loading) return <div className="loading">Loading your CDPs...</div>;
        
        if (userCDPs.length === 0) {
            return (
                <div className="no-cdps">
                    <h2>Your CDPs</h2>
                    <p>You don't have any Collateralized Debt Positions yet.</p>
                    <button onClick={() => setView('create')} className="create-button">Create New CDP</button>
                </div>
            );
        }
        
        return (
            <div className="cdp-list">
                <h2>Your CDPs</h2>
                <button onClick={() => setView('create')} className="create-button">Create New CDP</button>
                <div className="cdp-grid">
                    {userCDPs.map(cdp => (
                        <div 
                            key={cdp.address} 
                            className={`cdp-card ${cdp.liquidated ? 'liquidated' : ''}`}
                            onClick={() => {
                                setSelectedCDP(cdp.address);
                                setView('detail');
                            }}
                        >
                            <div className="cdp-card-header">
                                <div className="cdp-id">
                                    <span></span>
                                    CDP #{cdp.address.slice(0, 8)}...
                                </div>
                                {cdp.liquidated && <div className="liquidated-badge">Liquidated</div>}
                            </div>
                            <div className="cdp-info">
                                <div className="cdp-info-row">
                                    <span className="cdp-info-label">Collateral:</span>
                                    <span className="cdp-info-value collateral">{Number(cdp.collateralAmount) / 1e9} SOL</span>
                                </div>
                                <div className="cdp-info-row">
                                    <span className="cdp-info-label">Debt:</span>
                                    <span className="cdp-info-value debt">{Number(cdp.saiDebt) / 1e6} SAI</span>
                                </div>
                                <div className="cdp-info-row">
                                    <span className="cdp-info-label">Created:</span>
                                    <span className="cdp-info-value">{cdp.createdAt}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };
    
    const renderCreateCDP = () => {
        return (
            <div className="create-cdp">
                <h2>Create New CDP</h2>
                <button onClick={() => setView('list')} className="back-button">Back to CDPs</button>
                
                <form onSubmit={handleCreateCDP} className="detail-card">
                    <div className="form-group">
                        <label>Collateral Type:</label>
                        <select 
                            value={collateralType} 
                            onChange={(e) => setCollateralType(e.target.value)}
                        >
                            <option value="SOL">SOL</option>
                            <option value="USDC">USDC</option>
                        </select>
                    </div>
                    
                    <div className="form-group">
                        <label>Collateral Amount:</label>
                        <input 
                            type="number" 
                            value={createCollateral} 
                            onChange={(e) => setCreateCollateral(e.target.value)}
                            placeholder="Amount of collateral"
                            min="0.001"
                            step="0.001"
                            required
                        />
                    </div>
                    
                    <div className="form-group">
                        <label>SAI to Generate:</label>
                        <input 
                            type="number" 
                            value={createAmount} 
                            onChange={(e) => setCreateAmount(e.target.value)}
                            placeholder="Amount of SAI"
                            min="1"
                            step="1"
                            required
                        />
                    </div>
                    
                    <button 
                        type="submit" 
                        className="action-button"
                        disabled={loading}
                    >
                        {loading ? 'Creating...' : 'Create CDP'}
                    </button>
                </form>
            </div>
        );
    };
    
    const renderCDPDetail = () => {
        if (loading || !cdpDetails) return <div className="loading">Loading CDP details...</div>;
        
        const collateralAmount = Number(cdpDetails.collateralAmount) / 1e9;
        const debtAmount = Number(cdpDetails.saiDebt) / 1e6;
        const isLiquidated = cdpDetails.liquidated;
        
        // For a real app, you would fetch the current price and calculate this
        const collateralValueUSD = collateralAmount * 100; // Example: SOL price $100
        const collateralizationRatio = debtAmount > 0 ? (collateralValueUSD / debtAmount) * 100 : 0;
        const liquidationPrice = debtAmount > 0 ? (debtAmount * 1.5 / collateralAmount) : 0;
        
        return (
            <div className="cdp-detail">
                <button 
                    onClick={() => {
                        setView('list');
                        setSelectedCDP(null);
                        setCdpDetails(null);
                    }} 
                    className="back-button"
                >
                    Back to CDPs
                </button>
                
                <h2>CDP #{selectedCDP.slice(0, 8)}...</h2>
                
                <div className="detail-section">
                    <h3>Overview</h3>
                    <div className="info-grid">
                        <div className="info-card collateral">
                            <div className="info-label">Collateral</div>
                            <div className="info-value">{collateralAmount.toFixed(4)} SOL</div>
                        </div>
                        <div className="info-card">
                            <div className="info-label">Value</div>
                            <div className="info-value">${collateralValueUSD.toFixed(2)}</div>
                        </div>
                        <div className="info-card debt">
                            <div className="info-label">Debt</div>
                            <div className="info-value">{debtAmount.toFixed(2)} SAI</div>
                        </div>
                        <div className="info-card ratio">
                            <div className="info-label">Collateral Ratio</div>
                            <div className="info-value">{collateralizationRatio.toFixed(2)}%</div>
                        </div>
                    </div>
                </div>
                
                <div className="detail-section">
                    <h3>Liquidation Info</h3>
                    <div className="info-grid">
                        <div className="info-card">
                            <div className="info-label">Liquidation Price</div>
                            <div className="info-value">${liquidationPrice.toFixed(2)}</div>
                        </div>
                        <div className="info-card">
                            <div className="info-label">Min. Collateralization</div>
                            <div className="info-value">150%</div>
                        </div>
                        <div className="info-card">
                            <div className="info-label">Status</div>
                            <div className="info-value">{isLiquidated ? 'Liquidated' : 'Active'}</div>
                        </div>
                    </div>
                </div>
                
                {!isLiquidated && (
                    <div className="detail-section">
                        <h3>Manage Position</h3>
                        <div className="detail-card">
                            <div className="form-group">
                                <label>Amount:</label>
                                <input 
                                    type="number" 
                                    value={actionAmount} 
                                    onChange={(e) => setActionAmount(e.target.value)}
                                    placeholder="Enter amount"
                                    min="0.001"
                                    step="0.001"
                                />
                            </div>
                            
                            <div className="actions-grid">
                                <button 
                                    onClick={handleAddCollateral}
                                    disabled={loading || !actionAmount}
                                    className="action-button"
                                >
                                    Add Collateral
                                </button>
                                
                                <button 
                                    onClick={handleDrawSai}
                                    disabled={loading || !actionAmount}
                                    className="action-button"
                                >
                                    Draw SAI
                                </button>
                                
                                <button 
                                    onClick={handleRepaySai}
                                    disabled={loading || !actionAmount}
                                    className="action-button"
                                >
                                    Repay SAI
                                </button>
                            </div>
                            
                            {debtAmount === 0 && (
                                <button 
                                    onClick={handleCloseCDP}
                                    disabled={loading}
                                    className="close-button"
                                >
                                    Close CDP
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    if (!walletConnected) {
        return (
            <div className="sai-interface">
                <div className="connect-wallet">
                    <h1>SAI Stablecoin</h1>
                    <p>Create and manage Collateralized Debt Positions (CDPs) to generate SAI stablecoins using your SOL as collateral. Maintain your position, add collateral, or repay debt - all in one place.</p>
                    <button 
                        className="connect-button" 
                        onClick={handleConnectWallet}
                        disabled={loading}
                    >
                        {loading ? 'Connecting...' : 'Connect Wallet'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="sai-interface">
            {view === 'list' && renderCDPList()}
            {view === 'create' && renderCreateCDP()}
            {view === 'detail' && renderCDPDetail()}
        </div>
    );
};

export default SaiInterface;
