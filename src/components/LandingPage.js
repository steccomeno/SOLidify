import React from 'react';
import { Link } from 'react-router-dom';
import './LandingPage.css';

const LandingPage = () => {
  return (
    <div className="landing-page">
      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">
            <span className="gradient-text">SOLidify</span> Liquidation System
          </h1>
          <p className="hero-subtitle">
            A secure and efficient liquidation mechanism for the Solana-based MakerDAO clone
          </p>
          <div className="hero-buttons">
            <Link to="/liquidations" className="primary-button">
              Explore Liquidations
            </Link>
            <Link to="/vaults" className="secondary-button">
              Manage Vaults
            </Link>
          </div>
        </div>
        <div className="hero-graphic">
          <div className="graphic-circle"></div>
          <div className="graphic-block"></div>
          <div className="graphic-data"></div>
        </div>
      </section>

      <section className="features-section">
        <h2 className="section-title">Key Features</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon dutch-auction"></div>
            <h3>Dutch Auction Mechanism</h3>
            <p>Optimizes collateral liquidation through a time-based descending price model</p>
          </div>
          
          <div className="feature-card">
            <div className="feature-icon oracle"></div>
            <h3>Pyth Oracle Integration</h3>
            <p>Reliable price feeds from Pyth Network ensure accurate liquidation triggers</p>
          </div>
          
          <div className="feature-card">
            <div className="feature-icon incentives"></div>
            <h3>Liquidator Incentives</h3>
            <p>Attractive discounts for liquidators help maintain protocol solvency</p>
          </div>
          
          <div className="feature-card">
            <div className="feature-icon monitoring"></div>
            <h3>Real-time Monitoring</h3>
            <p>Advanced dashboard for tracking at-risk vaults and market conditions</p>
          </div>
        </div>
      </section>

      <section className="how-it-works">
        <h2 className="section-title">How Liquidations Work</h2>
        <div className="steps-container">
          <div className="step">
            <div className="step-number">1</div>
            <div className="step-content">
              <h3>Vault Health Monitoring</h3>
              <p>System continuously monitors the health of all vaults, calculating collateral ratios based on real-time price data</p>
            </div>
          </div>
          
          <div className="step">
            <div className="step-number">2</div>
            <div className="step-content">
              <h3>Liquidation Trigger</h3>
              <p>When a vault's collateral ratio falls below the minimum threshold, the liquidation process is triggered</p>
            </div>
          </div>
          
          <div className="step">
            <div className="step-number">3</div>
            <div className="step-content">
              <h3>Dutch Auction Starts</h3>
              <p>Collateral is offered in a Dutch auction starting at a premium and gradually decreasing to incentivize quick settlements</p>
            </div>
          </div>
          
          <div className="step">
            <div className="step-number">4</div>
            <div className="step-content">
              <h3>Settlement & Distribution</h3>
              <p>Winning bidder receives the collateral, debt is repaid to the protocol, and any surplus is returned to the vault owner</p>
            </div>
          </div>
        </div>
      </section>

      <section className="stats-section">
        <div className="stat-item">
          <div className="stat-value">$24.5M</div>
          <div className="stat-label">Total Value Secured</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">99.8%</div>
          <div className="stat-label">Protocol Solvency</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">12.7%</div>
          <div className="stat-label">Average Liquidation Discount</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">184</div>
          <div className="stat-label">Successful Auctions</div>
        </div>
      </section>

      <section className="cta-section">
        <h2>Start Participating in Liquidations</h2>
        <p>Join the SOLidify ecosystem and earn attractive returns by participating in liquidation auctions</p>
        <Link to="/liquidations" className="primary-button large">
          Launch Dashboard
        </Link>
      </section>

      <section className="resources-section">
        <h2 className="section-title">Resources</h2>
        <div className="resources-grid">
          <a href="#" className="resource-card">
            <h3>Liquidation Documentation</h3>
            <p>In-depth guides on the liquidation process and auction mechanics</p>
          </a>
          <a href="#" className="resource-card">
            <h3>Developer API</h3>
            <p>Integrate with our liquidation engine programmatically</p>
          </a>
          <a href="#" className="resource-card">
            <h3>Risk Parameters</h3>
            <p>Learn about the risk parameters and how they affect liquidations</p>
          </a>
          <a href="#" className="resource-card">
            <h3>Governance Proposals</h3>
            <p>Vote on proposals to improve the liquidation system</p>
          </a>
        </div>
      </section>
    </div>
  );
};

export default LandingPage; 