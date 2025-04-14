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
import { getPythPrice } from '../utils/solanaUtils';
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
            
            // Get latest price data from Pyth
            try {
                console.log("Fetching initial SOL/USD price from Pyth...");
                const solPrice = await getPythPrice('SOL/USD');
                console.log("Initial SOL/USD price from Pyth:", solPrice);
                
                // Update existing vaults with the latest price
                if (solPrice && vaults.length > 0) {
                    const updatedVaults = vaults.map(vault => {
                        // Only update SOL vaults for now
                        if (vault.collateralType === 'SOL' || !vault.collateralType) {
                            return {
                                ...vault,
                                collateralValueUSD: vault.collateral * solPrice,
                                collateralPrice: solPrice
                            };
                        }
                        return vault;
                    });
                    
                    console.log("Updating vaults with initial price data:", updatedVaults);
                    setVaults(updatedVaults);
                    localStorage.setItem('vaults', JSON.stringify(updatedVaults));
                }
                
                // Also store the price for new vaults
                setCollateralPrice(solPrice);
            } catch (priceError) {
                console.warn("Failed to get initial Pyth price data:", priceError);
                // Continue even if price fetch fails
            }
            
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
    const refreshBalances = async (forceRetry = false) => {
        if (!connected || !publicKey) return;
        
        try {
            setRefreshing(true);
            console.log("Refreshing balances and price data...");
            
            // Force a retry loop if needed
            let retries = forceRetry ? 3 : 1;
            let newBalances = null;
            let error = null;
            
            // Try multiple times if forceRetry is true
            for (let i = 0; i < retries; i++) {
                try {
                    console.log(`Balance refresh attempt ${i+1}/${retries}`);
                    
                    // Optionally try to refresh wallet connection
                    if (i > 0 && wallet) {
                        try {
                            console.log("Attempting to refresh wallet connection...");
                            await refreshConnection(wallet);
                        } catch (connErr) {
                            console.error("Error refreshing wallet connection:", connErr);
                            // Continue anyway
                        }
                    }
                    
                    // Get token balances
                    newBalances = await getTokenBalances(publicKey);
                    console.log(`Balance refresh attempt ${i+1} result:`, newBalances);
                    
                    // Success, exit loop
                    error = null;
                    break;
                } catch (err) {
                    console.error(`Balance refresh attempt ${i+1} failed:`, err);
                    error = err;
                    
                    // Wait before retry
                    if (i < retries - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            }
            
            if (error) {
                throw error;
            }
            
            if (newBalances) {
                console.log("New balances:", newBalances);
                setBalances(newBalances);
            }
            
            // Get latest price data from Pyth for SOL/USD
            try {
                const solPrice = await getPythPrice('SOL/USD');
                console.log("Latest SOL/USD price from Pyth:", solPrice);
                
                // Update collateral prices in any vaults
                if (solPrice && vaults.length > 0) {
                    const updatedVaults = vaults.map(vault => {
                        // Only update SOL vaults for now
                        if (vault.collateralType === 'SOL' || !vault.collateralType) {
                            return {
                                ...vault,
                                collateralValueUSD: vault.collateral * solPrice,
                                collateralPrice: solPrice
                            };
                        }
                        return vault;
                    });
                    
                    console.log("Updating vaults with fresh price data:", updatedVaults);
                    setVaults(updatedVaults);
                    localStorage.setItem('vaults', JSON.stringify(updatedVaults));
                }
            } catch (priceError) {
                console.warn("Failed to get Pyth price data:", priceError);
                // Continue even if price data fails - we still have balances
            }
        } catch (err) {
            console.error("Error refreshing balances:", err);
            setError("Failed to refresh balances: " + err.message);
        } finally {
            setRefreshing(false);
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
            // Try to connect to wallet if available
            if (window.solflare) {
                try {
                    console.log("Attempting to connect to Solflare wallet first");
                    await window.solflare.connect();
                    console.log("Connected to Solflare wallet");
                } catch (err) {
                    console.error("Failed to connect to Solflare wallet:", err);
                    setError("Please connect your wallet manually and try again");
                    return;
                }
            } else if (window.solana) {
                try {
                    console.log("Attempting to connect to Phantom wallet first");
                    await window.solana.connect();
                    console.log("Connected to Phantom wallet");
                } catch (err) {
                    console.error("Failed to connect to Phantom wallet:", err);
                    setError("Please connect your wallet manually and try again");
                    return;
                }
            } else {
                setError("Please connect your wallet first");
                return;
            }
        }
        
        try {
            setCreatingVault(true);
            setError(null);
            setTransactionSuccess(false);
            setTokenInfo(null); // Reset token info
            
            // Ensure API is initialized
            if (!isAPIInitialized()) {
                console.log("API not initialized, initializing now");
                await initializeAPI(wallet);
            }
            
            const solAmount = parseFloat(vaultForm.solAmount);
            const saiAmount = parseFloat(vaultForm.saiAmount);

            if (isNaN(solAmount) || solAmount <= 0) {
                throw new Error("Please enter a valid SOL amount");
            }

            if (isNaN(saiAmount) || saiAmount <= 0) {
                throw new Error("Please enter a valid SAI amount");
            }

            console.log(`Creating vault with ${solAmount} SOL for ${saiAmount} SAI`);
            
            // Simple retry mechanism
            let attempts = 0;
            const maxAttempts = 3;
            let result = null;
            
            while (attempts < maxAttempts) {
                try {
                    console.log(`Attempt ${attempts + 1} to create CDP`);
                    result = await createCDP(solAmount, saiAmount);
                    break; // If successful, break the loop
                } catch (err) {
                    console.error(`Attempt ${attempts + 1} failed:`, err);
                    attempts++;
                    
                    if (attempts >= maxAttempts) {
                        throw err;
                    }
                    
                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
                }
            }
            
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
                    address: result.vault || result.vaultAddress,
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
            
            // Try to automatically reconnect wallet on failure
            if (err.message && (err.message.includes("wallet") || err.message.includes("signing"))) {
                console.log("Wallet-related error detected, attempting to reconnect");
                if (window.solflare) {
                    try {
                        await window.solflare.disconnect();
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        await window.solflare.connect();
                        setError("Wallet reconnected. Please try again.");
                    } catch (reconnectErr) {
                        console.error("Failed to reconnect wallet:", reconnectErr);
                    }
                }
            }
        } finally {
            setCreatingVault(false);
        }
    };

    // Handle repay function
    const handleRepay = async (vault, repayAmount) => {
        if (!connected || !publicKey) {
            setError("Please connect your wallet first");
            return;
        }
        
        try {
            setLoading(true);
            setError(null);
            
            if (!repayAmount || isNaN(parseFloat(repayAmount)) || parseFloat(repayAmount) <= 0) {
                throw new Error("Please enter a valid amount");
            }
            
            repayAmount = parseFloat(repayAmount);
            
            if (repayAmount > vault.minted) {
                repayAmount = vault.minted; // Cap at max outstanding
                console.log(`Adjusting repay amount to maximum outstanding: ${repayAmount}`);
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
                    const newMinted = Math.max(0, parseFloat(v.minted) - repayAmount);
                    console.log(`Updating vault ${v.id}: old minted=${v.minted}, repaid=${repayAmount}, new minted=${newMinted}`);
                    return {
                        ...v,
                        minted: newMinted,
                        repayAmount: ''
                    };
                }
                return v;
            });
            
            // Log the updated vault for debugging
            const updatedVault = updatedVaults.find(v => v.id === vault.id);
            console.log("Updated vault state:", updatedVault);
            
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

    // Add function to close a vault and retrieve SOL collateral
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
                `This will return ${vault.collateral} SOL to your wallet.\n\n` +
                `This action cannot be undone.`
            );
            
            if (!confirmClose) {
                setClosingVault(false);
                return;
            }
            
            console.log(`Closing vault ${vault.address} and returning ${vault.collateral} SOL`);
            console.log(`Vault details:`, vault);
            
            // Ensure API is initialized
            if (!isAPIInitialized()) {
                console.log("API not initialized, initializing now");
                await initializeAPI(wallet);
            }
            
            // Call closeVault with explicit parameters
            const result = await closeVault(
                vault.address,  // vault address
                vault.tokenMint, // token mint
                0  // amount to burn (0 since we've already repaid)
            );
            
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
                message: result.message || "Successfully closed vault and returned SOL to your wallet"
            });
            
            // Force refresh balances immediately and again after a short delay
            refreshBalances();
            setTimeout(() => {
                refreshBalances();
            }, 2000);
            
        } catch (err) {
            console.error("Error closing vault:", err);
            setError("Failed to close vault: " + err.message);
            
            // Try to show more debugging info
            if (err.message?.includes("signature")) {
                console.log("This appears to be a transaction signature error. Please check your wallet is connected.");
                setError("Transaction signature failed. Please ensure your wallet is connected and try again.");
            }
        } finally {
            setClosingVault(false);
        }
    };

    // Add function for emergency SOL recovery
    const handleEmergencySolRecovery = async (vault) => {
        if (!connected || !publicKey) {
            setError("Please connect your wallet first");
            return;
        }
        
        try {
            setClosingVault(true);
            setError(null);
            
            // Show emergency warning to user
            const confirmRecovery = window.confirm(
                `EMERGENCY SOL RECOVERY MODE\n\n` +
                `This will attempt to recover your SOL from vault: ${vault.address}\n\n` +
                `Current vault balance: ${vault.collateral} SOL\n\n` +
                `USE THIS ONLY IF NORMAL VAULT CLOSURE FAILS.\n\n` +
                `Do you want to continue?`
            );
            
            if (!confirmRecovery) {
                setClosingVault(false);
                return;
            }
            
            console.log(`EMERGENCY: Recovering SOL from vault ${vault.address}`);
            
            // Ensure API is initialized
            if (!isAPIInitialized()) {
                console.log("API not initialized, initializing now");
                await initializeAPI(wallet);
            }
            
            // Get the API instance
            const api = new SolanaAPI();
            api.wallet = wallet;
            await api.initialize();
            
            // Call emergency recovery function
            const result = await api.emergencyRecoverSol(vault.address);
            
            if (!result || !result.success) {
                throw new Error(result?.error || "Failed to recover SOL");
            }
            
            console.log("Emergency SOL recovery successful:", result);
            
            // Remove vault from state to prevent further issues
            const updatedVaults = vaults.filter(v => v.id !== vault.id);
            setVaults(updatedVaults);
            
            // Save updated list to localStorage
            saveVaultsToLocalStorage(updatedVaults);
            
            // Show success message
            setTransactionSuccess(true);
            setTokenInfo({
                message: result.message || "Successfully recovered SOL from your vault"
            });
            
            // Force refresh balances immediately and again after a short delay
            // Use the improved refresh function with retry
            await refreshBalances(true);
            setTimeout(() => {
                refreshBalances(true);
            }, 3000);
            
        } catch (err) {
            console.error("Error in emergency SOL recovery:", err);
            setError("Emergency recovery failed: " + err.message);
        } finally {
            setClosingVault(false);
        }
    };

    // Add a function to force reconnect wallet and recover SOL
    const handleForceReconnectAndRecover = async (vault) => {
        if (!wallet) {
            setError("No wallet to reconnect");
            return;
        }
        
        try {
            setClosingVault(true);
            setError(null);
            
            const confirmAction = window.confirm(
                `This will disconnect your wallet, reconnect it, and then try to recover your SOL from vault ${vault.address}.\n\n` +
                `You may need to approve the reconnection in your wallet.\n\n` +
                `Do you want to continue?`
            );
            
            if (!confirmAction) {
                setClosingVault(false);
                return;
            }
            
            // Attempt to disconnect and reconnect wallet
            console.log("Attempting to disconnect wallet...");
            setError("Disconnecting wallet... Please wait.");
            
            try {
                // Try different methods of disconnecting
                if (typeof wallet.disconnect === 'function') {
                    await wallet.disconnect();
                    console.log("Wallet disconnected via disconnect()");
                } else if (window.solflare) {
                    await window.solflare.disconnect();
                    console.log("Solflare wallet disconnected");
                } else if (window.solana) {
                    await window.solana.disconnect();
                    console.log("Phantom wallet disconnected");
                }
                
                await new Promise(resolve => setTimeout(resolve, 2000));
                console.log("Waiting after disconnect...");
                
                setError("Reconnecting wallet... Please approve the connection in your wallet.");
                
                // Try to reconnect
                if (typeof wallet.connect === 'function') {
                    await wallet.connect();
                    console.log("Wallet reconnected via connect()");
                } else if (window.solflare) {
                    await window.solflare.connect();
                    console.log("Reconnected to Solflare");
                } else if (window.solana) {
                    await window.solana.connect();
                    console.log("Reconnected to Phantom");
                }
                
                console.log("Wallet reconnected successfully");
                setError("Wallet reconnected. Attempting SOL recovery...");
                
                // Wait a bit for connection to stabilize
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (reconnectErr) {
                console.error("Error during wallet reconnection:", reconnectErr);
                setError("Wallet reconnection failed. Please try connecting manually and then try again.");
                setClosingVault(false);
                return;
            }
            
            // Now try to recover SOL
            console.log("Attempting emergency SOL recovery after reconnection...");
            
            // Initialize API with the reconnected wallet
            await initializeAPI(wallet);
            
            // Create API instance
            const api = new SolanaAPI();
            api.wallet = wallet;
            await api.initialize();
            
            // Call emergency recovery
            const result = await api.emergencyRecoverSol(vault.address);
            
            if (!result || !result.success) {
                throw new Error(result?.error || "Failed to recover SOL after reconnection");
            }
            
            console.log("SOL recovery after reconnection successful:", result);
            
            // Remove vault from state
            const updatedVaults = vaults.filter(v => v.id !== vault.id);
            setVaults(updatedVaults);
            saveVaultsToLocalStorage(updatedVaults);
            
            // Show success
            setTransactionSuccess(true);
            setTokenInfo({
                message: `Successfully recovered SOL after wallet reconnection: ${result.message}`
            });
            
            // Force balance refresh
            await refreshBalances(true);
            setTimeout(() => refreshBalances(true), 3000);
            
        } catch (err) {
            console.error("Error in force reconnect and recover:", err);
            setError("Force reconnect and recovery failed: " + err.message);
        } finally {
            setClosingVault(false);
        }
    };

    // Add TokenInstructions component to show how to add tokens to wallet
    const TokenInstructions = ({ tokenMint }) => {
        return (
            <div className="token-instructions alert alert-success">
                <h4>Transaction successful! Your vault has been created.</h4>
                
                <p>To see your tokens in your wallet:</p>
                <ol>
                    <li>Open your wallet (Solflare or Phantom)</li>
                    <li>Go to "Tokens" tab</li>
                    <li>Click "Add Custom Token" or similar</li>
                    <li>Paste this address: <code>{tokenMint}</code></li>
                    <li>Set token details if needed:</li>
                    <ul>
                        <li>Name: SAI</li>
                        <li>Symbol: SAI</li>
                        <li>Decimals: 9</li>
                    </ul>
                </ol>
                
                <div className="alert alert-info">
                    <p><strong>Note:</strong> Devnet tokens may not show up in wallets automatically. 
                    If you can't add the token, you can still use it through this application.</p>
                    <p>Your token has been minted successfully, even if it doesn't appear in your wallet interface.</p>
                </div>
                
                <button className="btn btn-sm btn-secondary" onClick={() => {
                    if (navigator && navigator.clipboard) {
                        navigator.clipboard.writeText(tokenMint);
                        alert('Token address copied to clipboard!');
                    }
                }}>Copy Token Address</button>
            </div>
        );
    };

    // Add a function to retrieve token info from localStorage
    const getTokenInfo = () => {
        try {
            // First try to get from tokenInfo state if it exists
            if (tokenInfo && tokenInfo.mint) {
                return {
                    address: tokenInfo.mint,
                    name: "SAI",
                    symbol: "SAI",
                    decimals: 9
                };
            }
            
            // Fallback to localStorage
            const storedMint = localStorage.getItem('sai_token_mint');
            const storedInfo = localStorage.getItem('sai_token_info');
            
            // First try using the detailed token info
            if (storedInfo) {
                try {
                    return JSON.parse(storedInfo);
                } catch (e) {
                    console.error("Error parsing stored token info:", e);
                }
            }
            
            // Fallback to just the mint address
            if (storedMint) {
                return {
                    address: storedMint,
                    name: "SAI",
                    symbol: "SAI",
                    decimals: 9
                };
            }
            
            return null;
        } catch (e) {
            console.error("Error getting token info:", e);
            return null;
        }
    };
    
    // Retrieve token info for display
    const currentTokenInfo = getTokenInfo();

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
                            <TokenInstructions tokenMint={tokenInfo.mint} />
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
                        <div>SOL: {balances.sol.toFixed(8)}</div>
                        <div>SAI: {balances.sai}</div>
                        {currentTokenInfo && (
                            <div className="token-info-display mt-2">
                                <small className="text-muted">Token address: {currentTokenInfo.address}</small>
                            </div>
                        )}
                        <button 
                            onClick={refreshBalances}
                            disabled={refreshing}
                        >
                            {refreshing ? 'Refreshing...' : 'Refresh Balances'}
                        </button>
                        
                        {/* Debug button */}
                        <button 
                            onClick={() => {
                                console.log("Current vaults:", vaults);
                                vaults.forEach(v => {
                                    console.log(`Vault ${v.id} - address: ${v.address}, minted: ${v.minted} (type: ${typeof v.minted})`);
                                });
                                alert('Vault debug info printed to console');
                            }}
                            style={{
                                backgroundColor: '#999',
                                color: 'white',
                                padding: '5px 10px',
                                border: 'none',
                                borderRadius: '4px',
                                marginLeft: '10px',
                                fontSize: '12px'
                            }}
                        >
                            Debug Vaults
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
                                                    onClick={() => handleRepay(vault, vault.repayAmount)}
                                                    disabled={!vault.repayAmount || vault.repayAmount <= 0}
                                                    className="repay-button"
                                                >
                                                    Repay SAI
                                                </button>
                                            </div>
                                            {parseFloat(vault.minted) < 0.001 && (
                                                <button 
                                                    onClick={() => handleCloseVault(vault)}
                                                    disabled={closingVault}
                                                    className="close-vault-button"
                                                    style={{
                                                        backgroundColor: '#4CAF50',
                                                        color: 'white',
                                                        padding: '10px 15px',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        fontWeight: 'bold',
                                                        marginTop: '10px',
                                                        width: '100%'
                                                    }}
                                                >
                                                    {closingVault ? 'Closing...' : 'Close Vault & Get SOL Back'}
                                                </button>
                                            )}
                                            {/* Always show an emergency recovery button */}
                                            <button 
                                                onClick={() => handleEmergencySolRecovery(vault)}
                                                disabled={closingVault}
                                                className="force-recovery-button"
                                                style={{
                                                    backgroundColor: '#d9534f',
                                                    color: 'white',
                                                    padding: '10px 15px',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    fontWeight: 'bold',
                                                    marginTop: '10px',
                                                    width: '100%'
                                                }}
                                            >
                                                {closingVault ? 'Recovering...' : 'Force SOL Recovery'}
                                            </button>
                                            
                                            {/* Nuclear option - reconnect wallet and recover */}
                                            <button 
                                                onClick={() => handleForceReconnectAndRecover(vault)}
                                                disabled={closingVault}
                                                className="nuclear-option-button"
                                                style={{
                                                    backgroundColor: '#9400D3',
                                                    color: 'white',
                                                    padding: '10px 15px',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    fontWeight: 'bold',
                                                    marginTop: '10px',
                                                    width: '100%'
                                                }}
                                            >
                                                {closingVault ? 'Working...' : '🔄 Nuclear Option: Reconnect & Recover'}
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
