import React, { useState, useEffect } from 'react';
import './App.css';
import LandingPage from './components/LandingPage';
import SaiInterface from './components/SaiInterface';
import GovernanceInterface from './components/GovernanceInterface';
// Import wallet icons
import phantomIcon from './assets/phantom-icon.svg';

function App() {
  const [activeTab, setActiveTab] = useState('home'); // 'home', 'sai', or 'governance'
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    // Check if wallet is already connected
    const checkWalletConnection = async () => {
      try {
        // Mock wallet check for now
        const connected = localStorage.getItem('walletConnected') === 'true';
        if (connected) {
          setWalletConnected(true);
          setWalletAddress(localStorage.getItem('walletAddress') || '');
        }
      } catch (error) {
        console.error("Error checking wallet connection:", error);
      }
    };

    checkWalletConnection();
  }, []);

  // Function to handle navigation from landing page to app sections
  const navigateToApp = (tab) => {
    setActiveTab(tab);
    window.scrollTo(0, 0);
  };

  // Mock wallet connection
  const connectWallet = async () => {
    setIsConnecting(true);
    
    try {
      // Simulate connection delay
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Mock successful connection
      const mockAddress = '9o2xcedhF5QvRdiin6dVkaLi5ahCTf5ghoc5CmzY25CR';
      setWalletConnected(true);
      setWalletAddress(mockAddress);
      
      // Save to localStorage for persistence
      localStorage.setItem('walletConnected', 'true');
      localStorage.setItem('walletAddress', mockAddress);
    } catch (error) {
      console.error("Failed to connect wallet:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setWalletConnected(false);
    setWalletAddress('');
    localStorage.removeItem('walletConnected');
    localStorage.removeItem('walletAddress');
  };

  // Format wallet address for display
  const formatWalletAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo">
          <h1>SOLiDiFi <span className="beta-badge">Beta</span></h1>
        </div>
        
        <nav className="tabs">
          <button 
            className={`tab ${activeTab === 'home' ? 'active' : ''}`} 
            onClick={() => setActiveTab('home')}
          >
            Home
          </button>
          <button 
            className={`tab ${activeTab === 'sai' ? 'active' : ''}`} 
            onClick={() => setActiveTab('sai')}
          >
            SAI
          </button>
          <button 
            className={`tab ${activeTab === 'governance' ? 'active' : ''}`} 
            onClick={() => setActiveTab('governance')}
          >
            Governance
          </button>
        </nav>
        
        <div className="wallet-section">
          {walletConnected ? (
            <div className="wallet-info">
              <span className="wallet-address">{formatWalletAddress(walletAddress)}</span>
              <button className="disconnect-button" onClick={disconnectWallet}>
                Disconnect
              </button>
            </div>
          ) : (
            <button 
              className="connect-wallet-button" 
              onClick={connectWallet}
              disabled={isConnecting}
            >
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </header>

      <main className="content">
        {activeTab === 'home' && (
          <LandingPage navigateToApp={navigateToApp} />
        )}
        
        {activeTab === 'sai' && (
          <SaiInterface walletConnected={walletConnected} connectWallet={connectWallet} />
        )}
        
        {activeTab === 'governance' && (
          <GovernanceInterface walletConnected={walletConnected} connectWallet={connectWallet} />
        )}
      </main>
      
      <footer className="footer">
        <div className="footer-content">
          <p>© {new Date().getFullYear()} SOLiDiFi. All rights reserved.</p>
          <div className="footer-links">
            <a href="#" target="_blank" rel="noopener noreferrer">Twitter</a>
            <a href="#" target="_blank" rel="noopener noreferrer">Discord</a>
            <a href="#" target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href="#" target="_blank" rel="noopener noreferrer">Docs</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
