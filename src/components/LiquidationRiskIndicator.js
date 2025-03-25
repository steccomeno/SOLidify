import React from 'react';
import { calculateHealthFactor } from '../utils/liquidationUtils';
import './LiquidationRiskIndicator.css';

/**
 * LiquidationRiskIndicator Component
 * 
 * Displays a visual indicator of the liquidation risk for a vault
 * 
 * @param {Object} props
 * @param {Object} props.vault - The vault data
 * @param {Object} props.priceData - Current market prices for collateral
 * @param {string} props.size - Size of the indicator ('small', 'medium', 'large')
 * @param {boolean} props.showLabel - Whether to show the risk level label
 * @param {boolean} props.showDetails - Whether to show detailed information
 */
const LiquidationRiskIndicator = ({ 
  vault, 
  priceData, 
  size = 'medium', 
  showLabel = true,
  showDetails = true
}) => {
  if (!vault || !priceData) {
    return <div className="risk-indicator error">Invalid data</div>;
  }
  
  // Calculate health factor
  const healthFactor = calculateHealthFactor(
    vault.collateralAmount, 
    priceData[vault.collateralType], 
    vault.debtAmount
  );
  
  // Determine risk level and styling
  let riskLevel = 'unknown';
  if (healthFactor <= 1.05) riskLevel = 'critical';
  else if (healthFactor <= 1.2) riskLevel = 'high';
  else if (healthFactor <= 1.5) riskLevel = 'medium';
  else riskLevel = 'low';
  
  // Format health factor as percentage
  const healthPercent = (healthFactor * 100).toFixed(1);
  
  // Calculate ring percentage for visual display
  const ringPercent = Math.min(100, Math.max(0, (healthFactor / 2) * 100));
  const dashArray = `${ringPercent}, 100`;
  
  // Get risk label text
  const getRiskText = (risk) => {
    switch(risk) {
      case 'critical': return 'Critical';
      case 'high': return 'High Risk';
      case 'medium': return 'Medium';
      case 'low': return 'Low Risk';
      default: return 'Unknown';
    }
  };
  
  return (
    <div className={`risk-indicator ${size} ${riskLevel}`}>
      <div className="risk-ring-container">
        <svg viewBox="0 0 36 36" className="risk-ring">
          <path
            className="risk-ring-bg"
            d="M18 2.0845
              a 15.9155 15.9155 0 0 1 0 31.831
              a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="#444"
            strokeWidth="3"
          />
          <path
            className="risk-ring-fill"
            d="M18 2.0845
              a 15.9155 15.9155 0 0 1 0 31.831
              a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            strokeDasharray={dashArray}
            strokeDashoffset="0"
            strokeWidth="3"
          />
        </svg>
        <div className="risk-percentage">{healthPercent}%</div>
      </div>
      
      {showLabel && (
        <div className="risk-label">{getRiskText(riskLevel)}</div>
      )}
      
      {showDetails && (
        <div className="risk-details">
          <div className="risk-detail">
            <span className="detail-label">C-Ratio:</span>
            <span className="detail-value">{healthPercent}%</span>
          </div>
          <div className="risk-detail">
            <span className="detail-label">Min Required:</span>
            <span className="detail-value">150%</span>
          </div>
          <div className="risk-detail">
            <span className="detail-label">Liquidation at:</span>
            <span className="detail-value">110%</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiquidationRiskIndicator; 