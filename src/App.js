import React, { useState, useEffect } from 'react';
import './App.css';
import LandingPage from './components/LandingPage';
import SaiInterface from './components/SaiInterface';
import GovernanceInterface from './components/GovernanceInterface';
import LiquidationAuctionInterface from './components/LiquidationAuctionInterface';
import LiquidationDashboard from './pages/LiquidationDashboard';
import LaunchScreen from './components/LaunchScreen';
// Import wallet icons
import phantomIcon from './assets/phantom-icon.svg';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { connectWallet, disconnectWallet, isWalletConnected, getWalletAddress } from './utils/walletUtils';

function App() {
  const [activeTab, setActiveTab] = useState('home'); // 'home', 'sai', or 'governance'
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [showLaunchScreen, setShowLaunchScreen] = useState(true);

  useEffect(() => {
    // Check if wallet is already connected
    const checkWalletConnection = async () => {
      try {
        const connected = isWalletConnected();
        if (connected) {
          setWalletConnected(true);
          setWalletAddress(getWalletAddress() || '');
        }
      } catch (error) {
        console.error("Error checking wallet connection:", error);
      }
    };

    checkWalletConnection();

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
    if (walletConnected) {
      // Disconnect wallet
      disconnectWallet();
      setWalletConnected(false);
      setWalletAddress('');
      return;
    }
    
    setIsConnecting(true);
    
    try {
      // Connect wallet
      const result = await connectWallet();
      
      if (result.success) {
        setWalletConnected(true);
        setWalletAddress(result.address);
      } else {
        console.error("Failed to connect wallet:", result.message);
      }
    } catch (error) {
      console.error("Failed to connect wallet:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  // Format wallet address for display
  const formatWalletAddress = (address) => {
    if (!address) return '';
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
    <Router>
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
                className={`wallet-button ${walletConnected ? 'connected' : ''} ${isConnecting ? 'connecting' : ''}`}
                onClick={handleConnectWallet}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  'Connecting...'
                ) : walletConnected ? (
                  <>
                    <span className="wallet-address">{formatWalletAddress(walletAddress)}</span>
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
                <Route path="/vaults" element={<SaiInterface walletConnected={walletConnected} walletAddress={walletAddress} />} />
                <Route path="/liquidations" element={<LiquidationDashboard walletConnected={walletConnected} walletAddress={walletAddress} />} />
                <Route path="/governance" element={<GovernanceInterface walletConnected={walletConnected} walletAddress={walletAddress} />} />
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
    </Router>
  );
}

export default App;
