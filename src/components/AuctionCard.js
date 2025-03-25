import React from 'react';
import { 
  calculateCurrentAuctionPrice, 
  calculateAuctionDiscount, 
  formatCurrency 
} from '../utils/liquidationUtils';
import './AuctionCard.css';

/**
 * AuctionCard Component
 * 
 * Displays information about a liquidation auction in a card format
 * 
 * @param {Object} props
 * @param {Object} props.auction - The auction data object
 * @param {Object} props.priceData - Current price data for collateral assets
 * @param {boolean} props.compact - Whether to display the card in compact mode
 * @param {function} props.onClick - Function to call when card is clicked
 * @param {boolean} props.featured - Whether this is a featured auction
 */
const AuctionCard = ({ 
  auction, 
  priceData, 
  compact = false, 
  onClick,
  featured = false
}) => {
  if (!auction) {
    return null; // Return null if auction is undefined
  }

  // Calculate time remaining in seconds
  const currentTime = Date.now();
  const timeRemaining = Math.max(0, auction.endTime - currentTime);
  const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
  const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));

  // Calculate auction progress as percentage
  const auctionDuration = auction.endTime - auction.startTime;
  const elapsed = currentTime - auction.startTime;
  const progress = Math.min(100, Math.max(0, (elapsed / auctionDuration) * 100));

  // Get current price and discount
  const currentPrice = calculateCurrentAuctionPrice(auction);
  const marketPrice = priceData[auction.collateralType] * auction.collateralAmount;
  const discountPercentage = calculateAuctionDiscount(auction, priceData[auction.collateralType]);
  
  // Calculate time elapsed since auction start
  const elapsedHours = Math.floor(elapsed / (1000 * 60 * 60));
  const elapsedMinutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
  const elapsedText = elapsedHours > 0 
    ? `${elapsedHours}h ${elapsedMinutes}m ago` 
    : `${elapsedMinutes}m ago`;

  // Status display helper
  const getStatusDisplay = (status) => {
    switch(status) {
      case 'active':
        return { 
          label: 'Active', 
          className: 'status-active' 
        };
      case 'completed':
        return { 
          label: 'Ended', 
          className: 'status-ended' 
        };
      case 'pending':
        return { 
          label: 'Pending', 
          className: 'status-pending' 
        };
      default:
        return { 
          label: 'Unknown', 
          className: 'status-unknown' 
        };
    }
  };

  const statusDisplay = getStatusDisplay(auction.status);

  return (
    <div 
      className={`auction-card ${compact ? 'compact' : ''} ${featured ? 'featured' : ''}`} 
      onClick={onClick}
    >
      {featured && <div className="featured-tag">Featured</div>}
      
      <div className="auction-header">
        <div className="auction-id">Auction #{auction.id.replace('auction-', '')}</div>
        <div className={`auction-status ${statusDisplay.className}`}>
          {statusDisplay.label}
        </div>
      </div>

      <div className="auction-body">
        <div className="collateral-info">
          <div className="collateral-icon">
            {auction.collateralType.charAt(0)}
          </div>
          <div className="collateral-details">
            <div className="collateral-amount">
              {auction.collateralAmount} {auction.collateralType}
            </div>
            <div className="collateral-value">
              Market Value: ${formatCurrency(marketPrice)}
            </div>
          </div>
        </div>
        
        <div className="auction-details">
          <div className="detail-row">
            <span className="detail-label">Current Price:</span>
            <span className="detail-value discount">
              ${formatCurrency(currentPrice)}
              <span className="discount-badge">-{discountPercentage.toFixed(1)}%</span>
            </span>
          </div>

          <div className="detail-row">
            <span className="detail-label">Debt Amount:</span>
            <span className="detail-value">
              {formatCurrency(auction.debtAmount)} SAI
            </span>
          </div>
          
          <div className="detail-row">
            <span className="detail-label">Started:</span>
            <span className="detail-value">
              {elapsedText}
            </span>
          </div>
        </div>

        {auction.status === 'active' && (
          <div className="auction-progress">
            <div className="progress-label">
              <span>{progress.toFixed(0)}% Complete</span>
              <span>{hoursRemaining}h {minutesRemaining}m left</span>
            </div>
            <div className="progress-bar-container">
              <div 
                className="progress-bar-fill"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            
            <div className="price-trend">
              <div className="price-start">${formatCurrency(auction.startPrice)}</div>
              <div className="price-current">
                <span className="price-arrow">▼</span>
                ${formatCurrency(currentPrice)}
              </div>
            </div>
          </div>
        )}
      </div>

      {!compact && (
        <div className="auction-footer">
          <button className="bid-button">
            Place Bid Now
          </button>
          <div className="bid-info">
            {auction.highestBid ? (
              <span>
                Current Highest Bid: <strong>${formatCurrency(auction.highestBid)}</strong>
              </span>
            ) : (
              <span>No bids yet - Be the first!</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AuctionCard; 