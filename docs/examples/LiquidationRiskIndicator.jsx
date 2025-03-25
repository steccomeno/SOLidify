import React, { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';

/**
 * Liquidation Risk Indicator Component
 * 
 * Displays a visual indicator of how close a vault is to liquidation threshold
 * Shows percentage of collateralization with color-coded risk levels
 * 
 * @param {Object} props
 * @param {string} props.vaultId - The vault public key
 * @param {number} props.collateralAmount - Amount of collateral in the vault
 * @param {number} props.debtAmount - Amount of debt in the vault
 * @param {number} props.collateralPrice - Current price of the collateral asset
 * @param {number} props.liquidationThreshold - Threshold at which liquidation occurs (e.g. 110%)
 * @param {number} props.safeThreshold - Threshold considered safe (e.g. 150%)
 */
const LiquidationRiskIndicator = ({
  vaultId,
  collateralAmount,
  debtAmount,
  collateralPrice,
  liquidationThreshold = 110, // 110% is default liquidation threshold
  safeTreshold = 150 // 150% is default safe threshold
}) => {
  const [collateralizationRatio, setCollateralizationRatio] = useState(0);
  const [riskLevel, setRiskLevel] = useState('');
  const [riskColor, setRiskColor] = useState('#000000');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    calculateRatio();
  }, [collateralAmount, debtAmount, collateralPrice]);

  // Calculate the collateralization ratio
  const calculateRatio = () => {
    setIsLoading(true);
    
    try {
      if (!collateralAmount || !debtAmount || !collateralPrice || debtAmount === 0) {
        setCollateralizationRatio(0);
        setRiskLevel('N/A');
        setRiskColor('#cccccc');
        return;
      }
      
      // Calculate collateral value in USD
      const collateralValue = collateralAmount * collateralPrice;
      
      // Calculate ratio as a percentage
      const ratio = (collateralValue / debtAmount) * 100;
      setCollateralizationRatio(ratio);
      
      // Determine risk level
      if (ratio < liquidationThreshold + 5) {
        setRiskLevel('Critical');
        setRiskColor('#FF0000'); // Red
      } else if (ratio < liquidationThreshold + 15) {
        setRiskLevel('High');
        setRiskColor('#FF9900'); // Orange
      } else if (ratio < safeTreshold) {
        setRiskLevel('Medium');
        setRiskColor('#FFCC00'); // Yellow
      } else {
        setRiskLevel('Safe');
        setRiskColor('#00CC00'); // Green
      }
    } catch (error) {
      console.error('Error calculating collateralization ratio:', error);
      setRiskLevel('Error');
      setRiskColor('#999999'); // Gray
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate how far the ratio is from the liquidation threshold as a percentage
  const calculateSafetyPercentage = () => {
    if (collateralizationRatio === 0) return 0;
    if (collateralizationRatio >= safeTreshold) return 100;
    
    // Calculate where we are between liquidation threshold and safe threshold
    const range = safeTreshold - liquidationThreshold;
    const position = collateralizationRatio - liquidationThreshold;
    const safetyPercentage = Math.max(0, Math.min(100, (position / range) * 100));
    
    return safetyPercentage;
  };

  // Format the ratio for display
  const formatRatio = (ratio) => {
    return ratio.toFixed(2) + '%';
  };

  return (
    <div className="liquidation-risk-container">
      <h3>Collateralization Ratio</h3>
      
      {isLoading ? (
        <div className="loading-indicator">Loading...</div>
      ) : (
        <>
          <div className="ratio-display">
            <div className="circular-progress-container">
              <CircularProgressbar
                value={calculateSafetyPercentage()}
                text={formatRatio(collateralizationRatio)}
                strokeWidth={10}
                styles={buildStyles({
                  textColor: '#333333',
                  pathColor: riskColor,
                  trailColor: '#e6e6e6',
                })}
              />
            </div>
            
            <div className="risk-info">
              <div className="risk-level">
                Risk Level: <span style={{ color: riskColor }}>{riskLevel}</span>
              </div>
              
              <div className="threshold-info">
                <div>Liquidation Threshold: {liquidationThreshold}%</div>
                <div>Safe Threshold: {safeTreshold}%</div>
              </div>
            </div>
          </div>
          
          <div className="risk-description">
            {riskLevel === 'Critical' && (
              <p className="risk-warning">
                <strong>Warning:</strong> Your vault is at imminent risk of liquidation. 
                Add more collateral or repay debt immediately to avoid liquidation.
              </p>
            )}
            
            {riskLevel === 'High' && (
              <p className="risk-caution">
                Your vault has a high risk of liquidation if market prices fall. 
                Consider adding more collateral to increase your safety margin.
              </p>
            )}
            
            {riskLevel === 'Medium' && (
              <p className="risk-moderate">
                Your vault has a moderate risk level. While not in immediate danger,
                adding more collateral would increase your safety during market volatility.
              </p>
            )}
            
            {riskLevel === 'Safe' && (
              <p className="risk-safe">
                Your vault is well-collateralized and has a low risk of liquidation
                under normal market conditions.
              </p>
            )}
          </div>
        </>
      )}
      
      <div className="suggested-actions">
        <h4>Suggested Actions</h4>
        <ul>
          {collateralizationRatio < safeTreshold && (
            <li>Add more collateral to increase your safety margin</li>
          )}
          {collateralizationRatio < liquidationThreshold + 15 && (
            <li>Repay some of your debt to reduce liquidation risk</li>
          )}
          {collateralizationRatio < liquidationThreshold + 5 && (
            <li className="urgent-action">
              <strong>Urgent:</strong> Take immediate action to prevent liquidation
            </li>
          )}
        </ul>
      </div>
      
      <style jsx>{`
        .liquidation-risk-container {
          background: rgba(255, 255, 255, 0.9);
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          max-width: 450px;
          margin: 0 auto;
        }
        
        h3 {
          text-align: center;
          margin-top: 0;
          margin-bottom: 20px;
          color: #333;
        }
        
        .ratio-display {
          display: flex;
          align-items: center;
          margin-bottom: 20px;
        }
        
        .circular-progress-container {
          width: 120px;
          flex-shrink: 0;
        }
        
        .risk-info {
          margin-left: 20px;
          flex-grow: 1;
        }
        
        .risk-level {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 12px;
        }
        
        .threshold-info {
          font-size: 14px;
          color: #666;
        }
        
        .risk-description {
          background: #f5f5f5;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 20px;
          font-size: 14px;
          line-height: 1.5;
        }
        
        .risk-warning {
          color: #d32f2f;
        }
        
        .risk-caution {
          color: #ef6c00;
        }
        
        .risk-moderate {
          color: #9e9d24;
        }
        
        .risk-safe {
          color: #388e3c;
        }
        
        .suggested-actions {
          background: #e8f5e9;
          border-radius: 8px;
          padding: 15px;
        }
        
        .suggested-actions h4 {
          margin-top: 0;
          margin-bottom: 10px;
          color: #2e7d32;
        }
        
        .suggested-actions ul {
          margin: 0;
          padding-left: 20px;
        }
        
        .suggested-actions li {
          margin-bottom: 8px;
        }
        
        .urgent-action {
          color: #d32f2f;
        }
        
        .loading-indicator {
          text-align: center;
          padding: 30px 0;
          color: #666;
        }
      `}</style>
    </div>
  );
};

export default LiquidationRiskIndicator;

// Usage example:
// <LiquidationRiskIndicator 
//   vaultId="vault123"
//   collateralAmount={10} 
//   debtAmount={5000} 
//   collateralPrice={750} 
//   liquidationThreshold={110} 
//   safeTreshold={150} 
// /> 