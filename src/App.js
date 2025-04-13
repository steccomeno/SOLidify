import React, { useState, useEffect } from 'react';
import './App.css';
import LandingPage from './components/LandingPage';
import SaiInterface from './components/SaiInterface';
import GovernanceInterface from './components/GovernanceInterface';
import LiquidationAuctionInterface from './components/LiquidationAuctionInterface';
import LiquidationDashboard from './pages/LiquidationDashboard';
import LaunchScreen from './components/LaunchScreen';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingSpinner from './components/LoadingSpinner';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { initializeAPI } from './api';

// Import wallet adapter CSS
require('@solana/wallet-adapter-react-ui/styles.css');

// Set up network and wallet adapters
const network = WalletAdapterNetwork.Devnet;
const endpoint = clusterApiUrl(network);
const wallets = [
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter(),
  // Add more wallets here if needed
];

function AppContent() {
  const [activeTab, setActiveTab] = useState('home');
  const [showLaunchScreen, setShowLaunchScreen] = useState(true);
  const { connected, publicKey, wallet, select, wallets } = useWallet();
  const location = useLocation();
  const [apiInitialized, setApiInitialized] = useState(false);

  useEffect(() => {
    // Check if we've already launched the app before (using localStorage)
    const hasLaunched = localStorage.getItem('solidify_launched');
    if (hasLaunched === 'true') {
      setShowLaunchScreen(false);
    }
  }, []);

  useEffect(() => {
    const initializeWallet = async () => {
      try {
        if (connected && wallet && publicKey) {
          console.log('Initializing API with wallet:', {
            connected,
            hasPublicKey: !!publicKey,
            publicKey: publicKey.toString(),
            hasWallet: !!wallet,
            hasAdapter: !!wallet.adapter
          });

          // Initialize the API with the wallet and handle the result
          const initialized = await initializeAPI(wallet);
          if (initialized) {
            console.log('API initialized successfully');
            setApiInitialized(true);
          } else {
            console.log('API initialization skipped or failed');
            setApiInitialized(false);
          }
        } else {
          console.log('Wallet not ready:', {
            connected,
            hasWallet: !!wallet,
            hasPublicKey: !!publicKey
          });
          setApiInitialized(false);
        }
      } catch (error) {
        console.error('Failed to initialize API:', error);
        setApiInitialized(false);
      }
    };

    initializeWallet();
  }, [connected, wallet, publicKey]);

  // Function to handle navigation from landing page to app sections
  const navigateToApp = (tab) => {
    setActiveTab(tab);
    window.scrollTo(0, 0);
  };

  // Format wallet address for display
  const formatWalletAddress = (publicKey) => {
    if (!publicKey) return '';
    const address = publicKey.toString();
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  return (
    <ErrorBoundary>
      <div className="app">
        {showLaunchScreen ? (
          <LaunchScreen onLaunch={() => {
            setShowLaunchScreen(false);
            localStorage.setItem('solidify_launched', 'true');
            window.history.pushState({}, '', '/');
          }} />
        ) : (
          <>
            <header className="app-header">
              <div className="logo">
                <Link to="/">SOLidify</Link>
              </div>
              <nav className="main-nav">
                <ul>
                  <li>
                    <Link to="/" className={location.pathname === '/' ? 'active' : ''}>Home</Link>
                  </li>
                  <li>
                    <Link to="/vaults" className={location.pathname === '/vaults' ? 'active' : ''}>Vaults</Link>
                  </li>
                  <li>
                    <Link to="/liquidations" className={location.pathname === '/liquidations' ? 'active' : ''}>Liquidations</Link>
                  </li>
                  <li>
                    <Link to="/governance" className={location.pathname === '/governance' ? 'active' : ''}>Governance</Link>
                  </li>
                </ul>
              </nav>
              <div className="wallet-section">
                <WalletMultiButton />
              </div>
            </header>
            
            <main className="app-main">
              <Routes>
                <Route path="/" element={<LandingPage onNavigate={navigateToApp} />} />
                <Route 
                  path="/vaults" 
                  element={<SaiInterface />} 
                />
                <Route path="/liquidations" element={<LiquidationDashboard />} />
                <Route path="/governance" element={<GovernanceInterface />} />
              </Routes>
            </main>
            
            <footer className="app-footer">
              <div className="footer-content">
                <div className="footer-logo">SOLidify</div>
                <div className="footer-links">
                  <a href="https://github.com/solidify-dao" target="_blank" rel="noopener noreferrer">GitHub</a>
                  <a href="/docs" target="_blank" rel="noopener noreferrer">Docs</a>
                  <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
                  <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
                </div>
              </div>
              <div className="copyright">
                © {new Date().getFullYear()} SOLidify. All rights reserved.
              </div>
            </footer>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <Router>
            <AppContent />
          </Router>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default App;
