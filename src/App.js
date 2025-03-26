import React, { useState, useEffect } from 'react';
import './App.css';
import LandingPage from './components/LandingPage';
import SaiInterface from './components/SaiInterface';
import GovernanceInterface from './components/GovernanceInterface';
import LiquidationAuctionInterface from './components/LiquidationAuctionInterface';
import LiquidationDashboard from './pages/LiquidationDashboard';
import LaunchScreen from './components/LaunchScreen';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { clusterApiUrl } from '@solana/web3.js';
import { useWallet } from './utils/walletUtils';

// Initialize wallet adapters
const network = WalletAdapterNetwork.Devnet;
const endpoint = clusterApiUrl(network);
const wallets = [new PhantomWalletAdapter()];

function AppContent() {
  const [activeTab, setActiveTab] = useState('home');
  const [showLaunchScreen, setShowLaunchScreen] = useState(true);
  const { connected, publicKey, connect, disconnect } = useWallet();
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    // Check if we've already launched the app before (using localStorage)
    const hasLaunched = localStorage.getItem('solidify_launched');
    if (hasLaunched === 'true') {
      setShowLaunchScreen(false);
    }
  }, []);

  // Function to handle navigation from landing page to app sections
  const navigateToApp = (tab) => {
    setActiveTab(tab);
    window.scrollTo(0, 0);
  };

  // Handle wallet connection
  const handleConnectWallet = async () => {
    if (connected) {
      // Disconnect wallet
      disconnect();
      return;
    }
    
    setIsConnecting(true);
    
    try {
      // Connect wallet
      const result = await connect();
      
      if (!result.success) {
        console.error("Failed to connect wallet:", result.message);
      }
    } catch (error) {
      console.error("Failed to connect wallet:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  // Format wallet address for display
  const formatWalletAddress = (publicKey) => {
    if (!publicKey) return '';
    const address = publicKey.toString();
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const handleLaunch = () => {
    setShowLaunchScreen(false);
    // Store in localStorage that we've launched the app
    localStorage.setItem('solidify_launched', 'true');
    // Ensure we start at the home route
    window.history.pushState({}, '', '/');
  };

  // If someone wants to directly access a page, override the launch screen
  useEffect(() => {
    if (window.location.pathname !== '/' && showLaunchScreen) {
      setShowLaunchScreen(false);
      localStorage.setItem('solidify_launched', 'true');
    }
  }, [showLaunchScreen]);

  return (
    <div className="app">
      {showLaunchScreen ? (
        <LaunchScreen onLaunch={handleLaunch} />
      ) : (
        <>
          <header className="app-header">
            <div className="logo">
              <Link to="/">SOLidify</Link>
            </div>
            <nav className="main-nav">
              <ul>
                <li>
                  <Link to="/">Home</Link>
                </li>
                <li>
                  <Link to="/vaults">Vaults</Link>
                </li>
                <li>
                  <Link to="/liquidations">Liquidations</Link>
                </li>
                <li>
                  <Link to="/governance">Governance</Link>
                </li>
              </ul>
            </nav>
            <button 
              className={`wallet-button ${connected ? 'connected' : ''} ${isConnecting ? 'connecting' : ''}`}
              onClick={handleConnectWallet}
              disabled={isConnecting}
            >
              {isConnecting ? (
                'Connecting...'
              ) : connected ? (
                <>
                  <span className="wallet-address">{formatWalletAddress(publicKey)}</span>
                  <span className="wallet-status"></span>
                </>
              ) : (
                'Connect Wallet'
              )}
            </button>
          </header>
          
          <main className="app-content">
            <Routes>
              <Route path="/" element={<LandingPage onGetStarted={() => navigateToApp('sai')} />} />
              <Route path="/vaults" element={<SaiInterface walletConnected={connected} walletAddress={publicKey?.toString()} />} />
              <Route path="/liquidations" element={<LiquidationDashboard walletConnected={connected} walletAddress={publicKey?.toString()} />} />
              <Route path="/governance" element={<GovernanceInterface walletConnected={connected} walletAddress={publicKey?.toString()} />} />
            </Routes>
          </main>
          
          <footer className="app-footer">
            <div className="footer-content">
              <div className="footer-logo">SOLidify</div>
              <div className="footer-links">
                <a href="https://github.com/solidify-dao" target="_blank" rel="noopener noreferrer">GitHub</a>
                <a href="#" target="_blank" rel="noopener noreferrer">Docs</a>
                <a href="#" target="_blank" rel="noopener noreferrer">Terms</a>
                <a href="#" target="_blank" rel="noopener noreferrer">Privacy</a>
              </div>
            </div>
            <div className="copyright">
              © {new Date().getFullYear()} SOLidify. All rights reserved.
            </div>
          </footer>
        </>
      )}
    </div>
  );
}

function App() {
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <Router>
          <AppContent />
        </Router>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default App;
