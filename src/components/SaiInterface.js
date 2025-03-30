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
    mintTestSAI
} from '../api/index';
import LiquidationRiskIndicator from './LiquidationRiskIndicator';
import SaiTransfer from './SaiTransfer';
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

    useEffect(() => {
        console.log("SaiInterface - Component mounted");
        
        // Try to auto-connect to Phantom on component mount
        if (window.solana && window.solana.isPhantom && !connected) {
            console.log("SaiInterface - Attempting to auto-connect to Phantom");
            window.solana.connect({ onlyIfTrusted: true })
                .then(() => {
                    console.log("SaiInterface - Auto-connected to Phantom");
                })
                .catch(err => {
                    console.log("SaiInterface - Auto-connect failed:", err.message);
                });
        }
        
        return () => {
            console.log("SaiInterface - Component unmounted");
        };
    }, []);

    useEffect(() => {
        console.log("SaiInterface - Wallet connection state changed:", {
            connected,
            hasWallet: !!wallet,
            hasPublicKey: !!publicKey,
            publicKeyStr: publicKey?.toString()
        });
    }, [connected, wallet, publicKey]);

    const attemptWalletReconnect = async () => {
        if (reconnectAttempts >= 3) {
            setError("Maximum reconnection attempts reached. Please try again later or refresh the page.");
            return false;
        }
        
        setWalletStatus('reconnecting');
        setReconnectAttempts(prev => prev + 1);
        
        console.log("SaiInterface - Attempting wallet reconnect...");
        try {
            if (window.solana && window.solana.isPhantom) {
                // Disconnect first to clear any stale state
                try {
                    await window.solana.disconnect();
                    console.log("SaiInterface - Disconnected from Phantom");
                } catch (e) {
                    console.log("SaiInterface - Error disconnecting:", e);
                }
                
                // Wait a bit
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Reconnect
                await window.solana.connect();
                console.log("SaiInterface - Reconnected to Phantom");
                setWalletStatus('connected');
                setError(null);
                
                // Wait a bit more before initializing
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Try initializing again
                await initializeWalletAndLoadData();
                return true;
            }
        } catch (error) {
            console.error("SaiInterface - Reconnect failed:", error);
            setWalletStatus('error');
        }
        return false;
    };

    const initializeWalletAndLoadData = async () => {
        console.log("SaiInterface - Initializing wallet and loading data");
        setWalletStatus('initializing');
        
        if (connected && wallet) {
            try {
                console.log('SaiInterface - Wallet connected:', {
                    connected,
                    hasWallet: !!wallet,
                    hasPublicKey: !!publicKey,
                    publicKeyStr: publicKey?.toString()
                });

                // If we don't have a public key from wallet adapter but Phantom is available
                if (!publicKey && window.solana && window.solana.isPhantom) {
                    console.log('SaiInterface - Public key not available from wallet adapter. Trying direct connection to Phantom');
                    try {
                        // Try to connect directly to Phantom and get its public key
                        const directPhantomResponse = await window.solana.connect();
                        console.log('SaiInterface - Direct Phantom connection succeeded:', directPhantomResponse);
                        
                        // Create a local patch for the wallet object that includes the public key
                        const patchedWallet = {
                            ...wallet,
                            publicKey: directPhantomResponse.publicKey,
                            connected: true,
                            // If wallet lacks signTransaction, use the one from Phantom
                            signTransaction: wallet.signTransaction || 
                                ((tx) => window.solana.signTransaction(tx)),
                            // Also add the sendTransaction method which is needed for most operations
                            sendTransaction: wallet.sendTransaction || 
                                (async (tx, connection, options = {}) => {
                                    console.log('Using patched sendTransaction from Phantom');
                                    
                                    // Ensure transaction has a recent blockhash 
                                    if (!tx.recentBlockhash) {
                                        console.log('Transaction missing recentBlockhash, adding it now');
                                        try {
                                            const { blockhash } = await connection.getLatestBlockhash('confirmed');
                                            tx.recentBlockhash = blockhash;
                                            console.log('Added recentBlockhash to transaction:', blockhash);
                                        } catch (error) {
                                            console.error('Error getting blockhash:', error);
                                            throw error;
                                        }
                                    }
                                    
                                    // Use the appropriate method from Phantom to send the transaction
                                    return window.solana.signAndSendTransaction ? 
                                        window.solana.signAndSendTransaction(tx) : 
                                        window.solana.sendTransaction(tx);
                                }),
                            // Add signAllTransactions for completeness
                            signAllTransactions: wallet.signAllTransactions ||
                                ((txs) => window.solana.signAllTransactions(txs))
                        };
                        
                        console.log('SaiInterface - Created patched wallet with publicKey:', 
                            patchedWallet.publicKey.toString());
                        
                        // Initialize API with our patched wallet
                        if (!isAPIInitialized()) {
                            console.log('SaiInterface - API not initialized, initializing with patched wallet...');
                            try {
                                await initializeAPI(patchedWallet);
                                console.log('SaiInterface - API initialized successfully with patched wallet');
                                setWalletStatus('connected');
                                
                                // Load data with patched wallet
                                await Promise.all([
                                    loadUserCDPs(),
                                    loadWalletData(),
                                    loadActiveLiquidations()
                                ]);
                                
                                return true;
                            } catch (apiError) {
                                console.error('SaiInterface - API initialization with patched wallet failed:', apiError);
                                throw apiError;
                            }
                        }
                    } catch (phantomError) {
                        console.error('SaiInterface - Direct Phantom connection failed:', phantomError);
                    }
                }

                // Clear any existing errors
                setError(null);

                // Initialize API if not already initialized
                if (!isAPIInitialized()) {
                    console.log('SaiInterface - API not initialized, initializing now...');
                    try {
                        await initializeAPI(wallet);
                        console.log('SaiInterface - API initialized successfully');
                        setWalletStatus('connected');
                    } catch (apiError) {
                        console.error('SaiInterface - API initialization failed:', apiError);
                        setError(`Failed to initialize API: ${apiError.message}`);
                        setWalletStatus('error');
                        
                        // Try to reconnect if the error is related to wallet connection
                        if (apiError.message.includes('Wallet is not connected') || 
                            apiError.message.includes('public key is not available')) {
                            return await attemptWalletReconnect();
                        }
                        return false;
                    }
                } else {
                    console.log('SaiInterface - API already initialized');
                    setWalletStatus('connected');
                }

                // Load data only after API is initialized
                console.log('SaiInterface - Loading user data...');
                try {
                    await Promise.all([
                        loadUserCDPs(),
                        loadWalletData(),
                        loadActiveLiquidations()
                    ]);
                    console.log('SaiInterface - User data loaded successfully');
                    return true;
                } catch (dataError) {
                    console.error('SaiInterface - Failed to load user data:', dataError);
                    setError(`Failed to load user data: ${dataError.message}`);
                    return false;
                }
            } catch (error) {
                console.error('SaiInterface - Failed to initialize:', error);
                setError(error.message || 'Failed to initialize wallet connection. Please try reconnecting your wallet.');
                setWalletStatus('error');
                return false;
            }
        } else {
            console.log('SaiInterface - Wallet not ready:', {
                connected,
                hasWallet: !!wallet,
                hasPublicKey: !!publicKey
            });
            setWalletStatus('disconnected');
            return false;
        }
    };

    useEffect(() => {
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
        console.log("SaiInterface - Loading wallet balances");
        try {
            const balance = await getWalletBalance();
            console.log("SaiInterface - Wallet balances received:", balance);
            setWalletBalance(balance);
        } catch (error) {
            console.error('SaiInterface - Error loading wallet data:', error);
            setError(`Failed to load wallet balances: ${error.message}`);
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

        // Parse values and check if they're valid
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
        
        // Check that the user has enough SOL
        if (collateral > walletBalance.sol) {
            setError(`You don't have enough SOL. Your balance: ${walletBalance.sol} SOL`);
            return;
        }
        
        // Check reasonable ratio (minimum ~150% collateralization)
        const collateralValueInUSD = collateral * 20; // Assuming 1 SOL = $20 USD
        if (collateralValueInUSD < sai * 1.5) {
            setError('Collateralization ratio too low. Add more collateral or reduce SAI amount.');
            return;
        }

        try {
            setIsCreating(true);
            setError(null);
            
            console.log('Creating CDP with:', { collateral, sai });
            
            // Check if we can use Phantom directly for better compatibility
            if (window.solana && window.solana.isPhantom) {
                console.log('Using direct Phantom wallet for better compatibility');
                
                // Ensure Phantom is connected
                if (!window.solana.isConnected) {
                    try {
                        await window.solana.connect();
                        console.log('Connected to Phantom wallet');
                    } catch (connectError) {
                        console.error('Failed to connect to Phantom:', connectError);
                        throw new Error('Failed to connect to Phantom wallet');
                    }
                }
            }
            
            // Add a retry mechanism
            let retryCount = 0;
            let result = null;
            
            while (retryCount < 2) {
                try {
                    result = await createCDP(collateral, sai);
                    console.log('CDP creation result:', result);
                    break; // If successful, exit the loop
                } catch (error) {
                    console.error(`CDP creation attempt ${retryCount+1} failed:`, error);
                    
                    if (error.message.includes('rejected') && retryCount < 1) {
                        // User may have rejected, give them another chance
                        console.log('Transaction was rejected, retrying once...');
                        retryCount++;
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait a second
                    } else {
                        // Other error or we've already retried
                        throw error;
                    }
                }
            }

            if (result && result.success) {
                setCollateralAmount('');
                setSaiAmount('');
                setView('list');
                await loadUserCDPs();
                await loadWalletData(); // Refresh balances
            } else if (result) {
                // Handle known error types with user-friendly messages
                let errorMessage = result.error;
                
                if (result.error.includes('rejected') || result.error.includes('cancelled')) {
                    errorMessage = 'Transaction cancelled. You rejected the transaction in your wallet.';
                } else if (result.error.includes('Unexpected error')) {
                    errorMessage = tryDiagnosePhantomError();
                } else if (result.error.includes('insufficient funds')) {
                    errorMessage = 'Insufficient funds for transaction. Make sure you have enough SOL to cover fees.';
                }
                
                setError(errorMessage);
            } else {
                setError('Failed to create CDP due to an unknown error');
            }
        } catch (error) {
            console.error('Error creating CDP:', error);
            let errorMessage = error.message;
            
            // Make errors more user friendly
            if (error.message.includes('rejected')) {
                errorMessage = 'Transaction was rejected in your wallet.';
            } else if (error.message.includes('blockhash')) {
                errorMessage = 'Network error. Please try again in a moment.';
            } else if (error.message.includes('timed out')) {
                errorMessage = 'Transaction timed out. The network may be congested, please try again.';
            } else if (error.message.includes('Unexpected error')) {
                errorMessage = tryDiagnosePhantomError();
            }
            
            setError(errorMessage);
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

    const handleMintTestSAI = async () => {
        try {
            setLoading(true);
            const result = await mintTestSAI(10); // Mint 10 SAI
            if (result.success) {
                alert('Successfully minted test SAI tokens');
                // Refresh balances
                await loadWalletData();
            } else {
                alert(`Failed to mint: ${result.error}`);
            }
        } catch (error) {
            console.error('Error minting SAI:', error);
            alert(`Error: ${error.message}`);
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

    // Add a function to refresh wallet data after transfers
    const refreshWalletData = async () => {
        await loadWalletData();
    };

    // Main render function
    return (
        <div className="sai-interface-container">
            <div className="header">
                <h1>SAI Stablecoin Interface</h1>
                <div className="wallet-section">
                    {!connected ? (
                        <div className="connect-wallet-prompt">
                            <WalletMultiButton />
                            <p>Connect your wallet to manage SAI stablecoins</p>
                        </div>
                    ) : (
                        <div className="wallet-info">
                            <div className="wallet-balance">
                                <div className="balance-item">
                                    <span className="balance-label">SOL Balance:</span>
                                    <span className="balance-value">{walletBalance.sol.toFixed(4)} SOL</span>
                                </div>
                                <div className="balance-item">
                                    <span className="balance-label">SAI Balance:</span>
                                    <span className="balance-value">{walletBalance.sai.toFixed(2)} SAI</span>
                                </div>
                            </div>
                            <div className="wallet-address">
                                <span>{publicKey.toString().substring(0, 4)}...{publicKey.toString().substring(publicKey.toString().length - 4)}</span>
                                {walletStatus === 'error' && (
                                    <button 
                                        className="reconnect-button"
                                        onClick={attemptWalletReconnect}
                                        disabled={reconnectAttempts >= 3}
                                    >
                                        Reconnect
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            {connected && (
                <div className="sai-tabs">
                    <button 
                        className={view === 'list' ? 'active' : ''} 
                        onClick={() => setView('list')}>
                        My Vaults
                    </button>
                    <button 
                        className={view === 'create' ? 'active' : ''} 
                        onClick={() => setView('create')}>
                        Create Vault
                    </button>
                    <button 
                        className={view === 'transfer' ? 'active' : ''} 
                        onClick={() => setView('transfer')}>
                        Transfer SAI
                    </button>
                    {showLiquidations && (
                        <button 
                            className={view === 'liquidations' ? 'active' : ''} 
                            onClick={() => setView('liquidations')}>
                            Liquidation Auctions
                        </button>
                    )}
                </div>
            )}
            
            {error && (
                <div className="error-message">
                    <p>{error}</p>
                    <button onClick={() => setError(null)}>Dismiss</button>
                    {error.includes('Wallet is not connected') && (
                        <button onClick={attemptWalletReconnect}>
                            Try Reconnecting
                        </button>
                    )}
                </div>
            )}
            
            {!connected ? (
                <div className="sai-landing">
                    <div className="sai-info">
                        <h2>What is SAI?</h2>
                        <p>SAI is a decentralized stablecoin built on Solana, backed by crypto collateral. Create a vault, deposit collateral, and mint SAI tokens pegged to the US dollar.</p>
                        
                        <h3>Key Benefits</h3>
                        <ul>
                            <li>Fully collateralized and transparent</li>
                            <li>Governed by token holders</li>
                            <li>Fast and inexpensive transactions on Solana</li>
                        </ul>
                    </div>
                </div>
            ) : (
                <div className="sai-main">
                    {loading && (
                        <div className="loading-overlay">
                            <div className="loading-spinner"></div>
                            <p>Loading...</p>
                        </div>
                    )}
                    
                    {view === 'list' && renderCDPList()}
                    {view === 'create' && renderCreateCDPForm()}
                    {view === 'detail' && renderCDPDetail()}
                    {view === 'transfer' && (
                        <SaiTransfer 
                            onSuccess={refreshWalletData} 
                            walletBalance={walletBalance} 
                        />
                    )}
                    {view === 'liquidations' && renderActiveLiquidations()}
                </div>
            )}

            {publicKey && publicKey.toString() === '9J5dNhAcuTs9HqWksBTy3iPvTieH2B8ETtE1td7zr4K1' && (
                <div className="admin-section">
                    <h3>Admin Controls</h3>
                    <button 
                        className="admin-button"
                        onClick={handleMintTestSAI}
                        disabled={loading}
                    >
                        {loading ? 'Processing...' : 'Mint Test SAI (Admin Only)'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default SaiInterface;
