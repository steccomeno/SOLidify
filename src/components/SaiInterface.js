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
    isAPIInitialized,
    mintTestSAI,
    getTokenBalances,
    initializeCDP,
    createVaultAndMintSai,
    validateWalletAdapter
} from '../api/index';
import LiquidationRiskIndicator from './LiquidationRiskIndicator';
import SaiTransfer from './SaiTransfer';
import './SaiInterface.css';
import { refreshConnection } from '../utils/walletUtils';
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
    const [view, setView] = useState('list'); // 'list', 'create', 'detail', 'transfer'
    
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

    const [reconnectAttempts, setReconnectAttempts] = useState(0);
    const [walletStatus, setWalletStatus] = useState('initializing');

    const [retryAction, setRetryAction] = useState(null);
    const [initializing, setInitializing] = useState(false);

    const [balances, setBalances] = useState({ sol: 0, sai: 0, sld: 0 });

    // Add missing variables and states
    const [mintAmount, setMintAmount] = useState(100);
    const [mintingInProgress, setMintingInProgress] = useState(false);
    const [connectionError, setConnectionError] = useState(null);

    const [vaultAddress, setVaultAddress] = useState('');
    const [saiTokenAccount, setSaiTokenAccount] = useState('');
    const [success, setSuccess] = useState(false);

    // Define loadUserData function before it's used
    const loadUserData = async () => {
        try {
            setLoading(true);
            setError(null);

            // Load CDPs
            console.log('Loading user CDPs...');
            const cdpsResult = await getUserCDPs();
            if (!cdpsResult.success) {
                throw new Error(cdpsResult.error || 'Failed to load CDPs');
            }
            setCdps(cdpsResult.data || []);

            // Load balances
            console.log('Loading token balances...');
            const balancesResult = await getTokenBalances();
            if (!balancesResult.success) {
                throw new Error(balancesResult.error || 'Failed to load balances');
            }
            setBalances(balancesResult.data || { sol: 0, sai: 0 });
            setWalletBalance({
                sol: balancesResult.data?.sol || 0,
                sai: balancesResult.data?.sai || 0
            });

            setLoading(false);
        } catch (error) {
            console.error('Error loading user data:', error);
            setError(getErrorMessage(error));
            setLoading(false);
        }
    };

    // Define initializeWallet function
    const initializeWallet = async () => {
        try {
            setInitializing(true);
            setError(null);
            
            // First, ensure Phantom is installed and connected
            if (!window.solana || !window.solana.isPhantom) {
                throw new Error('Phantom wallet not installed');
            }

            // Try to connect if not already connected
            if (!window.solana.isConnected) {
                console.log("Attempting to connect to Phantom");
                await window.solana.connect();
            }

            // Get the public key directly from Phantom
            const phantomPublicKeyRaw = window.solana.publicKey;
            console.log('Phantom public key:', phantomPublicKeyRaw?.toString());

            if (!phantomPublicKeyRaw) {
                throw new Error('Failed to get public key from Phantom');
            }

            // Create wallet adapter object with all required methods
            const walletAdapter = {
                publicKey: phantomPublicKeyRaw,
                connected: true,
                connecting: false,
                disconnecting: false,
                
                signTransaction: async (transaction) => {
                    console.log('Signing transaction...');
                    try {
                        const signed = await window.solana.signTransaction(transaction);
                        console.log('Transaction signed successfully');
                        return signed;
                    } catch (error) {
                        console.error('Error signing transaction:', error);
                        throw error;
                    }
                },
                
                signAllTransactions: async (transactions) => {
                    console.log('Signing multiple transactions...');
                    try {
                        const signed = await window.solana.signAllTransactions(transactions);
                        console.log('All transactions signed successfully');
                        return signed;
                    } catch (error) {
                        console.error('Error signing transactions:', error);
                        throw error;
                    }
                },
                
                sendTransaction: async (transaction, connection, options = {}) => {
                    console.log('Sending transaction...');
                    try {
                        // Ensure transaction has recent blockhash
                        if (!transaction.recentBlockhash) {
                            const { blockhash } = await connection.getLatestBlockhash('finalized');
                            transaction.recentBlockhash = blockhash;
                        }
                        
                        // Sign transaction
                        const signed = await window.solana.signTransaction(transaction);
                        
                        // Send raw transaction
                        const signature = await connection.sendRawTransaction(
                            signed.serialize(),
                            options
                        );
                        
                        console.log('Transaction sent successfully:', signature);
                        
                        if (options.preflightCommitment) {
                            await connection.confirmTransaction(signature, options.preflightCommitment);
                            console.log('Transaction confirmed');
                        }
                        
                        return signature;
                    } catch (error) {
                        console.error('Error sending transaction:', error);
                        throw error;
                    }
                }
            };

            console.log('Created wallet adapter:', {
                hasPublicKey: !!walletAdapter.publicKey,
                publicKeyStr: walletAdapter.publicKey?.toString(),
                connected: walletAdapter.connected
            });

            // Initialize API with the wallet adapter
            console.log('Initializing API with wallet adapter');
            await initializeAPI(walletAdapter);
            
            // Load initial data
            console.log('Loading user data');
            await loadUserData();
            
            console.log('Initialization complete');
            setInitializing(false);
            setError(null);
        } catch (error) {
            console.error('Error initializing wallet:', error);
            setError(getErrorMessage(error));
            setInitializing(false);
            setRetryAction(() => initializeWallet);
        }
    };

    // Update useEffect to use initializeWallet
    useEffect(() => {
        console.log("Component mounted");
        initializeWallet();
        return () => {
            console.log("Component unmounted");
        };
    }, []);

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
            // Load token balances
            await loadTokenBalances();
            
            // Any other wallet data that needs to be loaded can be added here
            // For example, loadPermissions(), loadWalletActivity(), etc.
            
            // Clear any connection errors
            setConnectionError(null);
        } catch (error) {
            console.error('Error loading wallet data:', error);
            // Only set connection error if it's a network issue
            if (
                error.message.includes('network') || 
                error.message.includes('connection') || 
                error.message.includes('timeout')
            ) {
                setConnectionError(error.message);
            }
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

    // Helper function to diagnose Phantom errors
    const tryDiagnosePhantomError = () => {
        try {
            if (!window.solana || !window.solana.isPhantom) {
                return 'Phantom wallet not detected. Please install Phantom wallet extension.';
            }
            
            if (!window.solana.isConnected) {
                return 'Phantom wallet is not connected. Please connect your wallet and try again.';
            }
            
            if (!window.solana.publicKey) {
                return 'Public key not available from Phantom. Please reconnect your wallet.';
            }
            
            // Check network
            if (window.solana.connection && window.solana.connection.rpcEndpoint) {
                const endpoint = window.solana.connection.rpcEndpoint;
                if (!endpoint.includes('devnet')) {
                    return `Phantom is connected to wrong network: ${endpoint}. Please switch to Devnet.`;
                }
            }
            
            // Check transaction methods
            const hasSignAndSend = typeof window.solana.signAndSendTransaction === 'function';
            const hasSignTx = typeof window.solana.signTransaction === 'function';
            
            if (!hasSignAndSend && !hasSignTx) {
                return 'Phantom wallet is missing transaction signing methods. Try updating your extension.';
            }
            
            // If we can't diagnose it specifically, suggest some common solutions
            return 'Transaction failed due to wallet issues. Try the following:\n' +
                '1. Refresh the page\n' +
                '2. Disconnect and reconnect your wallet\n' +
                '3. Make sure you\'re on Devnet network\n' +
                '4. Update your Phantom wallet extension';
        } catch (err) {
            console.error('Error in diagnosis:', err);
            return 'Transaction failed. Please try refreshing the page and connecting again.';
        }
    };

    const validateInputs = () => {
        if (!collateralAmount || !saiAmount) {
            setError('Please enter both collateral and SAI amounts');
            return false;
        }

        const collateral = parseFloat(collateralAmount);
        const sai = parseFloat(saiAmount);

        if (isNaN(collateral) || isNaN(sai)) {
            setError('Please enter valid numbers');
            return false;
        }

        if (collateral <= 0 || sai <= 0) {
            setError('Amounts must be greater than 0');
            return false;
        }
        
        // Check that the user has enough SOL
        if (collateral > walletBalance.sol) {
            setError(`You don't have enough SOL. Your balance: ${walletBalance.sol} SOL`);
            return false;
        }
        
        // Check reasonable ratio (minimum ~150% collateralization)
        const collateralValueInUSD = collateral * 20; // Assuming 1 SOL = $20 USD
        if (collateralValueInUSD < sai * 1.5) {
            setError('Collateralization ratio too low. Add more collateral or reduce SAI amount.');
            return false;
        }

        return true;
    };

    const handleTransaction = async (action, params = {}) => {
        if (!connected || !publicKey) {
            setError('Please connect your wallet first');
            return null;
        }

        setLoading(true);
        setError(null);

        try {
            console.log(`Attempting ${action}...`, params);
            let result;

            switch (action) {
                case 'mintSAI':
                    result = await mintTestSAI(params.amount);
                    break;
                case 'createCDP':
                    result = await createVaultAndMintSai(params.collateral, params.sai, wallet);
                    break;
                case 'addCollateral':
                    result = await addCollateral(params.cdpId, params.amount);
                    break;
                case 'drawSAI':
                    result = await drawSai(params.cdpId, params.amount);
                    break;
                case 'repaySAI':
                    result = await repaySai(params.cdpId, params.amount);
                    break;
                case 'closeCDP':
                    result = await closeCDP(params.cdpId);
                    break;
                default:
                    throw new Error('Unknown action type');
            }

            console.log(`${action} result:`, result);

            if (result.success) {
                // Refresh data
                await Promise.all([
                    loadWalletData(),
                    loadUserData(),
                    params.cdpId && loadCDPDetails(params.cdpId)
                ].filter(Boolean));

                return result;
            } else {
                throw new Error(result.error || `Failed to ${action}`);
            }
        } catch (error) {
            console.error(`Error in ${action}:`, error);
            
            // Handle different types of errors
            let errorMessage = error.message || `Failed to ${action}`;
            
            if (error.message?.includes('User rejected')) {
                errorMessage = 'Transaction was rejected. Please try again.';
            } else if (error.message?.includes('insufficient funds')) {
                errorMessage = 'Insufficient SOL balance for transaction fees.';
            } else if (error.message?.includes('429') || error.message?.includes('rate limit')) {
                errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
            }
            
            setError(errorMessage);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const handleMintTestSAI = async () => {
        if (!connected || !publicKey) {
            setError('Please connect your wallet first');
            return;
        }

        if (!mintAmount || mintAmount <= 0) {
            setError('Please enter a valid amount to mint');
            return;
        }

        setMintingInProgress(true);
        setError(null);

        try {
            // Create a wallet adapter object with the required methods
            const walletAdapter = {
                publicKey: publicKey,
                signTransaction: async (transaction) => {
                    try {
                        return await wallet.signTransaction(transaction);
                    } catch (error) {
                        console.error('Error signing transaction:', error);
                        throw error;
                    }
                },
                signAllTransactions: async (transactions) => {
                    try {
                        return await wallet.signAllTransactions(transactions);
                    } catch (error) {
                        console.error('Error signing transactions:', error);
                        throw error;
                    }
                },
                sendTransaction: async (transaction, connection, options = {}) => {
                    try {
                        return await wallet.sendTransaction(transaction, connection, options);
                    } catch (error) {
                        console.error('Error sending transaction:', error);
                        throw error;
                    }
                }
            };

            // Initialize API with the wallet adapter
            await initializeAPI(walletAdapter);

            // Attempt to mint SAI
            const result = await mintTestSAI(parseFloat(mintAmount));
            console.log('Mint result:', result);

            if (result.success) {
                alert(`Successfully minted ${mintAmount} SAI tokens!`);
                setMintAmount(0);
                await loadWalletData();
            } else {
                throw new Error(result.error || 'Failed to mint SAI tokens');
            }
        } catch (error) {
            console.error('Error minting SAI:', error);
            setError(error.message || 'Failed to mint SAI tokens');
        } finally {
            setMintingInProgress(false);
        }
    };

    const handleCreateVault = async (e) => {
        e.preventDefault();
        
        if (!validateInputs()) {
            return;
        }

        const result = await handleTransaction('createCDP', {
            collateral: parseFloat(collateralAmount),
            sai: parseFloat(saiAmount)
        });

        if (result?.success) {
            setCollateralAmount('');
            setSaiAmount('');
            setView('list');
        }
    };

    const handleAddCollateral = async (e) => {
        e.preventDefault();
        if (!actionAmount || parseFloat(actionAmount) <= 0) {
            setError('Please enter a valid amount');
            return;
        }

        await handleTransaction('addCollateral', {
            cdpId: selectedCDP,
            amount: parseFloat(actionAmount)
        });
    };

    const handleDrawSai = async (e) => {
        e.preventDefault();
        if (!actionAmount || parseFloat(actionAmount) <= 0) {
            setError('Please enter a valid amount');
            return;
        }
        
        await handleTransaction('drawSAI', {
            cdpId: selectedCDP,
            amount: parseFloat(actionAmount)
        });
    };

    const handleRepaySai = async (e) => {
        e.preventDefault();
        if (!actionAmount || parseFloat(actionAmount) <= 0) {
            setError('Please enter a valid amount');
            return;
        }

        await handleTransaction('repaySAI', {
            cdpId: selectedCDP,
            amount: parseFloat(actionAmount)
        });
    };

    const handleCloseCDP = async () => {
        if (!window.confirm('Are you sure you want to close this CDP?')) {
            return;
        }

        const result = await handleTransaction('closeCDP', {
            cdpId: selectedCDP
        });

        if (result?.success) {
            setView('list');
            setSelectedCDP(null);
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
                            {typeof error === 'string' ? error : error.message || 'An unknown error occurred'}
                        </div>
                    )}
                    
                    <form onSubmit={handleCreateVault}>
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

    // Add a function to refresh wallet data after transfers
    const refreshWalletData = () => {
        loadWalletData();
        loadUserData();
    };

    // Add this function inside the component to handle connection recovery
    const recoverFromConnectionError = async () => {
        try {
            console.log('Attempting to recover from connection error...');
            setError('Connection issue detected. Trying to reconnect...');
            setLoading(true);
            
            // Refresh the connection
            await refreshConnection();
            
            // Test the connection by getting balances
            const balances = await getWalletBalance();
            console.log('Connection recovered, balances:', balances);
            
            setWalletBalance(balances);
            setLoading(false);
            setError(null);
            
            return true;
        } catch (error) {
            console.error('Failed to recover from connection error:', error);
            setLoading(false);
            setError('Failed to reconnect. Please refresh the page and try again.');
            return false;
        }
    };

    // Add renderConnectionRecoveryOption function
    const renderConnectionRecoveryOption = () => {
        return (
            <div className="connection-recovery">
                <p>
                    <strong>Connection Issue Detected:</strong> {getErrorMessage(connectionError)}
                </p>
                <p className="recovery-hint">
                    This could be due to Solana network congestion or rate limiting. 
                    You can try to reconnect with a different RPC provider.
                </p>
                    <button 
                    className="recovery-button" 
                    onClick={initializeWallet}
                    >
                    Reconnect Wallet
                    </button>
            </div>
        );
    };

    // Add a retry button component
    const RetryButton = () => {
        if (!retryAction) return null;
        
        return (
            <div className="retry-container">
                    <button 
                    className="retry-button"
                    onClick={() => {
                        setError(null);
                        setInitializing(true);
                        retryAction();
                    }}
                >
                    Retry Connection
                    </button>
                <p className="retry-hint">
                    If the issue persists, try switching to a different network in your wallet settings.
                </p>
                </div>
        );
    };

    // Also fix the Dismiss button for the error message at the top
    const ErrorMessage = ({ message, detail, onDismiss }) => {
        // Check if it's an object with message property
        const errorMsg = typeof message === 'object' && message.message 
            ? message.message 
            : message;
        
        // Check if it has additional details
        const errorDetail = detail || (typeof message === 'object' && message.detail);
        
        // Determine error type for styling
        const isWarning = errorMsg && (
            errorMsg.includes('Please connect to Devnet') ||
            errorMsg.includes('Connection rejected by user')
        );
        
        const isRejection = errorMsg && errorMsg.includes('rejected');
        
        // Apply different classes based on error type
        const errorClass = isWarning ? 'error-warning' : isRejection ? 'error-rejection' : 'error-critical';
        
        return (
            <div className={`error-container ${errorClass}`}>
                <div className="error-message">
                    <div className="error-header">
                        <span className="error-icon">⚠️</span>
                        <span className="error-title">{isWarning ? 'Warning' : isRejection ? 'Transaction Rejected' : 'Error'}</span>
                        {onDismiss && <button className="dismiss-button" onClick={onDismiss}>×</button>}
                    </div>
                    <div className="error-content">
                        {errorMsg}
                        {errorDetail && <div className="error-detail">{errorDetail}</div>}
                    </div>
                </div>
            </div>
        );
    };

    // Add a dismissError function somewhere in the component
    const dismissError = () => {
        setError(null);
    };

    // Update loadTokenBalances to also update walletBalance for backward compatibility
    const loadTokenBalances = async () => {
        try {
            const result = await getTokenBalances();
            
            if (result && result.success && result.data) {
                setBalances(result.data);
                setWalletBalance({
                    sol: result.data.sol,
                    sai: result.data.sai
                });
            } else if (result && typeof result.sol !== 'undefined') {
                setBalances(result);
                setWalletBalance(result);
            } else if (result && !result.success) {
                setError(`Failed to load balances: ${result.error || 'Unknown error'}`);
                setBalances({ sol: 0, sai: 0, sld: 0 });
                setWalletBalance({ sol: 0, sai: 0 });
            } else {
                console.error('Unexpected response from getTokenBalances:', result);
                setBalances({ sol: 0, sai: 0, sld: 0 });
                setWalletBalance({ sol: 0, sai: 0 });
            }
        } catch (error) {
            console.error('Error loading token balances:', error);
            setError(`Failed to load balances: ${error.message || 'Unknown error'}`);
            setBalances({ sol: 0, sai: 0, sld: 0 });
            setWalletBalance({ sol: 0, sai: 0 });
        }
    };

    // Add this helper function at the top of the component
    const getErrorMessage = (error) => {
        if (typeof error === 'string') return error;
        if (error && error.message) return error.message;
        return 'An unknown error occurred';
    };

    // Main render function
    return (
        <div className="sai-interface">
            <h1>SAI Stablecoin Interface</h1>
            
            {error && (
                <ErrorMessage 
                    message={error} 
                    onDismiss={dismissError} 
                />
            )}
            
            {retryAction && error && error.recoverable && <RetryButton />}
            
            {initializing && (
                <div className="loading-state">
                    <p>Initializing wallet connection...</p>
                    <div className="spinner"></div>
                </div>
            )}

            {!initializing && !isAPIInitialized() && !error && (
                <div className="connect-wallet-container">
                    <p>Please connect your wallet to use the application</p>
                    <button onClick={initializeWallet} className="connect-button">Connect Wallet</button>
                    <div className="wallet-instructions">
                        <p>Make sure you have:</p>
                        <ul>
                            <li>Phantom wallet installed</li>
                            <li>Switched to Devnet network</li>
                            <li>Some SOL in your wallet</li>
                        </ul>
                    </div>
                </div>
            )}
            
            {isAPIInitialized() && (
                <>
                    <div className="wallet-info">
                        <h2>Wallet</h2>
                        <p>SOL Balance: {balances.sol.toFixed(4)} SOL</p>
                        <p>SAI Balance: {balances.sai.toFixed(4)} SAI</p>
                        <button onClick={refreshWalletData} className="refresh-button">Refresh</button>
                    </div>
                    
                    <div className="cdp-section">
                        <h2>Your CDPs</h2>
                        {loading ? (
                            <p>Loading CDPs...</p>
                ) : (
                    <>
                                {cdps.length === 0 ? (
                                    <p>You don't have any CDPs yet.</p>
                                ) : (
                                    renderCDPList()
                                )}
                                
                                {renderCreateCDPForm()}
                    </>
                )}
            </div>
                    
                    {selectedCDP && renderCDPDetail()}
                    
                    {/* Conditionally show test minting section for admin */}
                    {publicKey?.toString() === '9J5dNhAcuTs9HqWksBTy3iPvTieH2B8ETtE1td7zr4K1' && (
                        <div className="admin-section">
                            <h2>Admin Functions</h2>
                            <p>As admin, you can mint test SAI tokens</p>
                            {error && (
                                <div className="error-message">
                                    {typeof error === 'string' ? error : error.message || 'An unknown error occurred'}
                                </div>
                            )}
                            <div className="input-group">
                                <input
                                    type="number"
                                    value={mintAmount}
                                    onChange={(e) => {
                                        const value = parseFloat(e.target.value);
                                        if (!isNaN(value) && value >= 0) {
                                            setMintAmount(value);
                                        }
                                    }}
                                    placeholder="Amount of SAI to mint"
                                    min="0"
                                    step="1"
                                />
                                <button 
                                    onClick={handleMintTestSAI} 
                                    disabled={mintingInProgress || !connected || mintAmount <= 0}
                                    className="button primary-button"
                                >
                                    {mintingInProgress ? 'Minting...' : 'Mint Test SAI'}
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
            
            {/* Add network recovery option if applicable */}
            {connectionError && renderConnectionRecoveryOption()}
        </div>
    );
};

export default SaiInterface;
