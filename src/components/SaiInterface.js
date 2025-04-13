import React, { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useNavigate } from 'react-router-dom';
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
    getTokenBalances,
    closeVault
} from '../api/index';
import { SolanaAPI } from '../api/solana';
import LiquidationRiskIndicator from './LiquidationRiskIndicator';
import SaiTransfer from './SaiTransfer';
import './SaiInterface.css';
import { refreshConnection } from '../utils/walletUtils';
require('@solana/wallet-adapter-react-ui/styles.css');

const SaiInterface = () => {
    // 1. All state declarations at the top
    const { connected, publicKey, wallet } = useWallet();
    const { setVisible } = useWalletModal();
    const navigate = useNavigate();
    
    // State declarations
    const [cdps, setCdps] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [collateralAmount, setCollateralAmount] = useState('');
    const [saiAmount, setSaiAmount] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [selectedCDP, setSelectedCDP] = useState(null);
    const [cdpDetails, setCdpDetails] = useState(null);
    const [view, setView] = useState('list');
    const [internalWallet, setInternalWallet] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [createAmount, setCreateAmount] = useState('');
    const [createCollateral, setCreateCollateral] = useState('');
    const [collateralType, setCollateralType] = useState('SOL');
    const [actionAmount, setActionAmount] = useState('');
    const [walletBalance, setWalletBalance] = useState({ sol: 0, sai: 0 });
    const [collateralPrice, setCollateralPrice] = useState(0);
    const [liquidationRisk, setLiquidationRisk] = useState(null);
    const [activeLiquidations, setActiveLiquidations] = useState([]);
    const [showLiquidations, setShowLiquidations] = useState(false);
    const [reconnectAttempts, setReconnectAttempts] = useState(0);
    const [walletStatus, setWalletStatus] = useState('initializing');
    const [retryAction, setRetryAction] = useState(null);
    const [initializing, setInitializing] = useState(false);
    const [initializationProgress, setInitializationProgress] = useState(0);
    const [api, setApi] = useState(null);
    const [balances, setBalances] = useState({ sol: 0, sai: 0, sld: 0 });
    const [connectionError, setConnectionError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [vaultForm, setVaultForm] = useState({
        solAmount: '',
        saiAmount: ''
    });
    const [initialized, setInitialized] = useState(false);
    const [transactionInProgress, setTransactionInProgress] = useState(false);
    const [transactionSuccess, setTransactionSuccess] = useState(false);
    const [transactionError, setTransactionError] = useState(null);
    const [apiInitialized, setApiInitialized] = useState(false);
    const [creatingVault, setCreatingVault] = useState(false);
    const [tokenInfo, setTokenInfo] = useState(null);
    const [vaults, setVaults] = useState([]);
    const [closingVault, setClosingVault] = useState(false);

    // Debug function to help with vault issues
    const debugVaults = () => {
        try {
            // Clear any potentially corrupted vaults data
            localStorage.removeItem('vaults');
            console.log("Cleared existing vaults data");
            
            // Add a debug function to window to help check vaults anytime
            window.debugVaults = () => {
                try {
                    const vaults = JSON.parse(localStorage.getItem('vaults') || '[]');
                    console.log("Current vaults in localStorage:", vaults);
                    return vaults;
                } catch (err) {
                    console.error("Error parsing vaults:", err);
                    return [];
                }
            };
            
            // Also add a function to track SAI tokens
            window.debugTokens = () => {
                try {
                    const mainMint = localStorage.getItem('sai_token_mint');
                    const allTokens = JSON.parse(localStorage.getItem('user_tokens') || '[]');
                    return {
                        mainSaiMint: mainMint,
                        allTokens: allTokens
                    };
                } catch (err) {
                    console.error("Error getting tokens:", err);
                    return { mainSaiMint: null, allTokens: [] };
                }
            };
        } catch (err) {
            console.error("Error in debugVaults:", err);
        }
    };

    // Call debugVaults on mount
    useEffect(() => {
        debugVaults();
    }, []);

    // Function to automatically initialize API and load balances
    const initializeAndLoadData = async () => {
        if (!connected || !publicKey) return;
        
        try {
            setLoading(true);
            setError(null);
            
            // Check if API is already initialized instead of re-initializing
            console.log("Checking API initialization status...");
            if (isAPIInitialized()) {
                console.log("API already initialized, skipping initialization");
            } else {
                // Only initialize if not already initialized
                console.log("API not initialized, initializing now...");
                // Use the wallet from the wallet adapter instead of window.solana
                const initialized = await initializeAPI(wallet);
                if (!initialized) {
                    throw new Error("Failed to initialize API. Please refresh and try again.");
                }
            }
            
            // Load balances
            console.log("Loading balances...");
            const newBalances = await getTokenBalances(publicKey);
            console.log("Balances loaded:", newBalances);
            setBalances(newBalances);
            
        } catch (err) {
            console.error("Error during initialization:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Initialize automatically when wallet connects
    useEffect(() => {
        if (connected && publicKey) {
            initializeAndLoadData();
        }
    }, [connected, publicKey]);

    // Add a function to refresh balances after vault creation
    const refreshBalances = async () => {
        if (!connected || !publicKey) return;
        
        try {
            setLoading(true);
            console.log("Refreshing balances...");
            const newBalances = await getTokenBalances(publicKey);
            console.log("New balances:", newBalances);
            setBalances(newBalances);
        } catch (err) {
            console.error("Error refreshing balances:", err);
            setError("Failed to refresh balances: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    // Load vaults from localStorage on mount
    useEffect(() => {
        try {
            console.log("Loading vaults from localStorage...");
            
            // First attempt recovery from any old vaults format
            let savedVaults = [];
            try {
                const storedVaults = localStorage.getItem('vaults');
                console.log("Raw vaults data:", storedVaults);
                
                if (storedVaults) {
                    savedVaults = JSON.parse(storedVaults);
                    console.log("Parsed vaults:", savedVaults);
                }
            } catch (parseError) {
                console.error("Failed to parse vaults from localStorage:", parseError);
                // If we can't parse, reset to empty array
                savedVaults = [];
                localStorage.setItem('vaults', JSON.stringify([]));
            }
            
            // If we have vaults, ensure they have all required fields
            if (savedVaults && savedVaults.length > 0) {
                console.log(`Found ${savedVaults.length} vaults in localStorage`);
                
                // Filter out any invalid vault entries
                const validVaults = savedVaults.filter(vault => {
                    return vault && 
                           vault.id && 
                           vault.address && 
                           vault.tokenMint &&
                           typeof vault.collateral !== 'undefined' &&
                           typeof vault.minted !== 'undefined';
                });
                
                console.log(`${validVaults.length} valid vaults after filtering`);
                
                // If we lost some vaults in filtering, save the valid ones back
                if (validVaults.length !== savedVaults.length) {
                    localStorage.setItem('vaults', JSON.stringify(validVaults));
                }
                
                setVaults(validVaults);
            } else {
                console.log("No vaults found in localStorage");
                setVaults([]);
            }
        } catch (error) {
            console.error("Error loading vaults from localStorage:", error);
            // Reset localStorage if corrupt
            localStorage.removeItem('vaults');
            localStorage.setItem('vaults', JSON.stringify([]));
            setVaults([]);
        }
    }, []);

    // Add a separate localStorage save function to use throughout the component
    const saveVaultsToLocalStorage = (updatedVaults) => {
        try {
            console.log("Saving vaults to localStorage:", updatedVaults);
            localStorage.setItem('vaults', JSON.stringify(updatedVaults));
            console.log("Vaults saved successfully");
            return true;
        } catch (err) {
            console.error("Error saving vaults to localStorage:", err);
            return false;
        }
    };

    // Update handleCreateVault to use the new save function
    const handleCreateVault = async (e) => {
        e.preventDefault();
        
        if (!connected || !publicKey) {
            setError("Please connect your wallet first");
            return;
        }
        
        try {
            setCreatingVault(true);
            setError(null);
            setTransactionSuccess(false);
            setTokenInfo(null); // Reset token info
            
            const solAmount = parseFloat(vaultForm.solAmount);
            const saiAmount = parseFloat(vaultForm.saiAmount);

            if (isNaN(solAmount) || solAmount <= 0) {
                throw new Error("Please enter a valid SOL amount");
            }

            if (isNaN(saiAmount) || saiAmount <= 0) {
                throw new Error("Please enter a valid SAI amount");
            }

            console.log(`Creating vault with ${solAmount} SOL for ${saiAmount} SAI`);
            const result = await createCDP(solAmount, saiAmount);
            
            if (!result || !result.success) {
                throw new Error(result?.error || "Failed to create vault");
            }
            
            console.log("Vault created successfully:", result);
            setTransactionSuccess(true);
            
            // Store token information for display
            if (result.tokenMint) {
                setTokenInfo({
                    mint: result.tokenMint,
                    account: result.tokenAccount,
                    amount: saiAmount,
                    message: result.message
                });
                
                // Generate a unique ID for the vault
                const uniqueId = Date.now().toString() + Math.random().toString(36).substring(2, 10);
                
                // Create new vault object
                const newVault = {
                    id: uniqueId,
                    address: result.vault,
                    tokenMint: result.tokenMint,
                    collateral: solAmount,
                    minted: saiAmount,
                    created: new Date().toLocaleString()
                };
                
                // Update state with the new vault
                const updatedVaults = [...vaults, newVault];
                setVaults(updatedVaults);
                
                // Save to localStorage
                saveVaultsToLocalStorage(updatedVaults);
                
                // Force refresh balances after vault creation
                setTimeout(() => {
                    refreshBalances();
                }, 2000);
            }
            
            // Reset form
            setVaultForm({ solAmount: '', saiAmount: '' });
            
        } catch (err) {
            console.error("Error creating vault:", err);
            setError("Failed to create vault: " + err.message);
        } finally {
            setCreatingVault(false);
        }
    };

    // Add function to close a vault
    const handleCloseVault = async (vault) => {
        if (!connected || !publicKey) {
            setError("Please connect your wallet first");
            return;
        }
        
        try {
            setClosingVault(true);
            setError(null);
            
            // Confirm with user
            const confirmClose = window.confirm(
                `Are you sure you want to close this vault?\n\n` +
                `This will:\n` +
                `- Burn ${vault.minted} SAI tokens\n` +
                `- Return ${vault.collateral} SOL to your wallet\n\n` +
                `This action cannot be undone.`
            );
            
            if (!confirmClose) {
                return;
            }
            
            console.log(`Closing vault ${vault.address} and returning ${vault.collateral} SOL`);
            const result = await closeVault(vault.address, vault.tokenMint, vault.minted);
            
            if (!result || !result.success) {
                throw new Error(result?.error || "Failed to close vault");
            }
            
            console.log("Vault closed successfully:", result);
            
            // Remove vault from state
            const updatedVaults = vaults.filter(v => v.id !== vault.id);
            setVaults(updatedVaults);
            
            // Save updated list to localStorage
            saveVaultsToLocalStorage(updatedVaults);
            
            // Show success message
            setTransactionSuccess(true);
            setTokenInfo({
                message: result.message
            });
            
            // Refresh balances after a short delay to allow for network propagation
            setTimeout(() => {
                refreshBalances();
            }, 2000);
            
        } catch (err) {
            console.error("Error closing vault:", err);
            setError("Failed to close vault: " + err.message);
        } finally {
            setClosingVault(false);
        }
    };

    // Add function to repay SAI
    const handleRepayVault = async (vault) => {
        if (!connected || !publicKey) {
            setError("Please connect your wallet first");
            return;
        }
        
        try {
            setLoading(true);
            setError(null);
            
            const repayAmount = parseFloat(vault.repayAmount);
            if (isNaN(repayAmount) || repayAmount <= 0) {
                throw new Error("Please enter a valid amount to repay");
            }
            
            if (repayAmount > balances.sai) {
                throw new Error("Insufficient SAI balance");
            }

            console.log(`Repaying ${repayAmount} SAI to vault ${vault.address}`);
            const result = await repaySai(vault.address, repayAmount);
            
            if (!result || !result.success) {
                throw new Error(result?.error || "Failed to repay SAI");
            }
            
            console.log("SAI repaid successfully:", result);
            
            // Update vault in state
            const updatedVaults = vaults.map(v => {
                if (v.id === vault.id) {
                    return {
                        ...v,
                        minted: Math.max(0, v.minted - repayAmount),
                        repayAmount: ''
                    };
                }
                return v;
            });
            setVaults(updatedVaults);
            
            // Save updated list to localStorage
            saveVaultsToLocalStorage(updatedVaults);
            
            // Show success message
            setTransactionSuccess(true);
            setTokenInfo({
                message: `Successfully repaid ${repayAmount} SAI`
            });
            
            // Refresh balances after a short delay
            setTimeout(() => {
                refreshBalances();
            }, 2000);
            
        } catch (err) {
            console.error("Error repaying SAI:", err);
            setError("Failed to repay SAI: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    // Wallet connection UI
    if (!connected) {
        return (
            <div className="sai-interface">
                <h1>SAI Stablecoin Interface</h1>
                <div className="connect-prompt">
                    <p>Please connect your wallet to continue</p>
                    <WalletMultiButton />
                </div>
            </div>
        );
    }

    return (
        <div className="sai-interface">
            <h1>SAI Stablecoin Interface</h1>
            
            {/* Error Message */}
            {error && (
                <div className="error-message">
                    <p>{error}</p>
                    <button onClick={() => {
                        setError(null);
                        initializeAndLoadData();
                    }}>
                        Retry
                    </button>
                </div>
            )}
            
            {/* Success Message */}
            {transactionSuccess && (
                <div className="success-message">
                    <div>
                        <p>Transaction successful! Your vault has been created.</p>
                        {tokenInfo && (
                            <div className="token-info">
                                <p>To see your tokens in Phantom wallet:</p>
                                <ol>
                                    <li>Open Phantom wallet</li>
                                    <li>Click "Tokens"</li>
                                    <li>Click "Manage token list" (+ icon)</li>
                                    <li>Select "Custom token"</li>
                                    <li>Paste this token address: <code>{tokenInfo.mint}</code></li>
                                </ol>
                                <p>You've minted {tokenInfo.amount} tokens!</p>
                            </div>
                        )}
                    </div>
                    <button onClick={() => {
                        setTransactionSuccess(false);
                        setTokenInfo(null);
                    }}>
                        Dismiss
                    </button>
                </div>
            )}
            
            {/* Loading State */}
            {loading && (
                <div className="loading-state">
                    <div className="loading-content">
                        <div className="spinner"></div>
                        <p>Loading...</p>
                    </div>
                </div>
            )}
            
            {/* Main Interface */}
            {!loading && (
                <div className="interface-content">
                    <div className="balances">
                        <h2>Your Balances</h2>
                        <p>SOL: {balances.sol}</p>
                        <p>SAI: {balances.sai}</p>
                        <button 
                            onClick={async () => {
                                try {
                                    setLoading(true);
                                    const newBalances = await getTokenBalances(publicKey);
                                    setBalances(newBalances);
                                } catch (err) {
                                    setError(err.message);
                                } finally {
                                    setLoading(false);
                                }
                            }} 
                            disabled={loading || creatingVault}>
                            Refresh Balances
                        </button>
                    </div>

                    <div className="create-vault-form">
                        <h2>Create New Vault</h2>
                        <form onSubmit={handleCreateVault}>
                            <div className="form-group">
                                <label>SOL Collateral Amount:</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    value={vaultForm.solAmount}
                                    onChange={(e) => setVaultForm(prev => ({
                                        ...prev,
                                        solAmount: e.target.value
                                    }))}
                                    placeholder="Enter SOL amount"
                                    required
                                />
                                <small>Amount of SOL to lock as collateral</small>
                            </div>
                            <div className="form-group">
                                <label>SAI Amount to Mint:</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    value={vaultForm.saiAmount}
                                    onChange={(e) => setVaultForm(prev => ({
                                        ...prev,
                                        saiAmount: e.target.value
                                    }))}
                                    placeholder="Enter SAI amount"
                                    required
                                />
                                <small>Amount of SAI tokens to mint (must maintain 150% collateralization ratio)</small>
                            </div>
                            <button 
                                type="submit" 
                                className="create-button" 
                                disabled={creatingVault || loading}>
                                {creatingVault ? 'Creating Vault...' : 'Create Vault'}
                            </button>
                        </form>
                    </div>

                    {/* Vaults Section */}
                    {vaults.length > 0 && (
                        <div className="vaults-section">
                            <div className="section-header">
                                <h2>Your Vaults</h2>
                                <div className="vault-buttons">
                                    <button 
                                        onClick={() => {
                                            if (window.confirm("Are you sure you want to clear all vault data? This will NOT close your vaults or return your SOL.")) {
                                                // Clear from localStorage
                                                localStorage.removeItem('vaults');
                                                localStorage.setItem('vaults', JSON.stringify([]));
                                                
                                                // Clear from state
                                                setVaults([]);
                                                console.log("Vaults cleared from localStorage");
                                            }
                                        }}
                                        className="clear-vaults-button"
                                    >
                                        Clear Vault List
                                    </button>
                                    <button 
                                        onClick={() => {
                                            try {
                                                console.log("Forcing vault refresh from localStorage");
                                                
                                                // Get raw data for debugging
                                                const rawData = localStorage.getItem('vaults');
                                                console.log("Raw vault data:", rawData);
                                                
                                                // Parse and process
                                                let savedVaults = [];
                                                try {
                                                    savedVaults = JSON.parse(rawData || '[]');
                                                } catch (parseError) {
                                                    console.error("Failed to parse vaults:", parseError);
                                                    savedVaults = [];
                                                    // Reset localStorage
                                                    localStorage.setItem('vaults', JSON.stringify([]));
                                                }
                                                
                                                // Filter for valid vaults
                                                const validVaults = savedVaults.filter(vault => {
                                                    return vault && 
                                                           vault.id && 
                                                           vault.address && 
                                                           vault.tokenMint &&
                                                           typeof vault.collateral !== 'undefined' &&
                                                           typeof vault.minted !== 'undefined';
                                                });
                                                
                                                console.log("Reloaded vaults:", validVaults);
                                                setVaults(validVaults);
                                                alert(`Reloaded ${validVaults.length} vaults from localStorage`);
                                                
                                                // Re-save if we had to filter
                                                if (validVaults.length !== savedVaults.length) {
                                                    saveVaultsToLocalStorage(validVaults);
                                                }
                                            } catch (err) {
                                                console.error("Error reloading vaults:", err);
                                                alert("Error reloading vaults: " + err.message);
                                            }
                                        }}
                                        className="reload-vaults-button"
                                    >
                                        Reload Vaults
                                    </button>
                                </div>
                            </div>
                            <div className="vaults-list">
                                {vaults.map(vault => (
                                    <div key={vault.id} className="vault-item">
                                        <div className="vault-details">
                                            <h3>Vault {vault.id.substring(vault.id.length - 4)}</h3>
                                            <p>Collateral: {vault.collateral} SOL</p>
                                            <p>Minted: {vault.minted} SAI</p>
                                            <p>Created: {vault.created}</p>
                                            <div className="vault-address">
                                                <p>Address: <code>{vault.address}</code></p>
                                                <p>Token Mint: <code>{vault.tokenMint}</code></p>
                                            </div>
                                        </div>
                                        <div className="vault-actions">
                                            <div className="repay-form">
                                                <input
                                                    type="number"
                                                    placeholder="Amount to repay"
                                                    value={vault.repayAmount || ''}
                                                    onChange={(e) => {
                                                        const updatedVaults = vaults.map(v => 
                                                            v.id === vault.id 
                                                                ? {...v, repayAmount: e.target.value}
                                                                : v
                                                        );
                                                        setVaults(updatedVaults);
                                                    }}
                                                    min="0.1"
                                                    step="0.1"
                                                />
                                                <button 
                                                    onClick={() => handleRepayVault(vault)}
                                                    disabled={!vault.repayAmount || vault.repayAmount <= 0}
                                                    className="repay-button"
                                                >
                                                    Repay SAI
                                                </button>
                                            </div>
                                            <button 
                                                onClick={() => handleCloseVault(vault)}
                                                disabled={closingVault || vault.minted > 0}
                                                className="close-vault-button"
                                            >
                                                {closingVault ? 'Closing...' : 'Close Vault'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SaiInterface;
