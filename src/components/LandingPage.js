import React from 'react';
import '../styles/LandingPage.css';
import { motion } from 'framer-motion';

// Icon components
const ShieldIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="feature-icon">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
  </svg>
);

const BoltIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="feature-icon">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
  </svg>
);

const LockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="feature-icon">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
  </svg>
);

const UsersIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="feature-icon">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
    <circle cx="9" cy="7" r="4"></circle>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
  </svg>
);

const BarChartIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="feature-icon">
    <line x1="18" y1="20" x2="18" y2="10"></line>
    <line x1="12" y1="20" x2="12" y2="4"></line>
    <line x1="6" y1="20" x2="6" y2="14"></line>
    <line x1="3" y1="20" x2="21" y2="20"></line>
  </svg>
);

const LandingPage = ({ navigateToApp, walletConnected, connectWallet }) => {
  return (
    <div className="landing-page">
      <section className="hero-section">
        <motion.div 
          className="hero-content"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="hero-title">
            <span className="gradient-text">Decentralized</span> Lending on Solana
          </h1>
          <p className="hero-description">
            SOLiDiFi is an open-source protocol enabling borrowing against collateral with self-governed stability mechanisms.
          </p>
          <div className="hero-buttons">
            {walletConnected ? (
              <button className="button primary" onClick={() => navigateToApp('sai')}>
                Launch App
              </button>
            ) : (
              <button className="button primary" onClick={connectWallet}>
                Connect Wallet
              </button>
            )}
            <button className="button secondary" onClick={() => navigateToApp('governance')}>
              Explore Governance
            </button>
          </div>
        </motion.div>
        
        <motion.div 
          className="hero-graphic"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.2 }}
        >
          <div className="hero-graphic-inner">
            <div className="globe"></div>
            <div className="stats-card card-1">
              <h4>SAI Borrowed</h4>
              <p>$14.2M</p>
            </div>
            <div className="stats-card card-2">
              <h4>Total Collateral</h4>
              <p>$28.6M</p>
            </div>
          </div>
        </motion.div>
      </section>

      <section className="metrics-section">
        <div className="metric">
          <h3>$28.6M</h3>
          <p>Total Value Locked</p>
        </div>
        <div className="metric">
          <h3>$14.2M</h3>
          <p>SAI in Circulation</p>
        </div>
        <div className="metric">
          <h3>200%</h3>
          <p>Average Collateralization</p>
        </div>
        <div className="metric">
          <h3>5,400+</h3>
          <p>Active CDPs</p>
        </div>
      </section>

      <section className="features-section">
        <h2 className="section-title">Why SOLiDiFi?</h2>
        
        <div className="features-grid">
          <motion.div 
            className="feature-card"
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
          >
            <ShieldIcon />
            <h3>Collateralized Debt</h3>
            <p>Secure loans by locking collateral, maintaining full custody of your assets at all times.</p>
          </motion.div>
          
          <motion.div 
            className="feature-card"
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
          >
            <BoltIcon />
            <h3>Lightning Fast</h3>
            <p>Experience sub-second transaction speeds and minuscule fees on Solana's high-performance network.</p>
          </motion.div>
          
          <motion.div 
            className="feature-card"
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
          >
            <LockIcon />
            <h3>Self-Custodial</h3>
            <p>Maintain control of your assets with non-custodial smart contracts that ensure security and ownership.</p>
          </motion.div>
          
          <motion.div 
            className="feature-card"
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
          >
            <UsersIcon />
            <h3>Community Governed</h3>
            <p>The protocol is managed by SDL token holders who vote on proposals and risk parameters.</p>
          </motion.div>
          
          <motion.div 
            className="feature-card"
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
          >
            <BarChartIcon />
            <h3>Stability Mechanism</h3>
            <p>Our advanced stability mechanisms ensure SAI maintains its peg to the US Dollar.</p>
          </motion.div>
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-content">
          <h2>Ready to Get Started?</h2>
          <p>Create a Collateralized Debt Position (CDP) to generate SAI stablecoins.</p>
          <button className="button primary" onClick={() => navigateToApp('sai')}>
            Launch App
          </button>
        </div>
      </section>
    </div>
  );
};

export default LandingPage; 