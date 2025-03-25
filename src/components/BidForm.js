import React, { useState, useEffect } from 'react';
import { calculateCurrentAuctionPrice, calculateAuctionDiscount } from '../utils/liquidationUtils';
import './BidForm.css';

/**
 * BidForm Component
 * 
 * A form for placing bids on liquidation auctions
 * 
 * @param {Object} props
 * @param {Object} props.auction - The auction data object
 * @param {Object} props.priceData - Current price data for collateral assets
 * @param {Function} props.onBidPlaced - Callback for when a bid is successfully placed
 * @param {Function} props.onError - Callback for when there's an error placing a bid
 */
const BidForm = ({ auction, priceData, onBidPlaced, onError }) => {
  const [bidAmount, setBidAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [currentPrice, setCurrentPrice] = useState(0);
  const [marketValue, setMarketValue] = useState(0);
  const [discount, setDiscount] = useState(0);
  
  // Update calculated values when auction or price data changes
  useEffect(() => {
    if (auction && priceData && priceData[auction.collateralType]) {
      const price = calculateCurrentAuctionPrice(auction.auctionData);
      setCurrentPrice(price);
      
      const mktValue = auction.collateralAmount * priceData[auction.collateralType];
      setMarketValue(mktValue);
      
      const disc = calculateAuctionDiscount(auction.auctionData, priceData[auction.collateralType]);
      setDiscount(disc);
      
      // Reset form state
      setBidAmount('');
      setValidationError('');
    }
  }, [auction, priceData]);
  
  // Validate and handle submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate inputs
    if (!auction) {
      setValidationError('No auction selected');
      return;
    }
    
    if (!bidAmount || isNaN(parseFloat(bidAmount)) || parseFloat(bidAmount) <= 0) {
      setValidationError('Please enter a valid bid amount');
      return;
    }
    
    const minBidAmount = auction.debtAmount * 0.95; // 95% of debt as minimum
    if (parseFloat(bidAmount) < minBidAmount) {
      setValidationError(`Bid must be at least ${minBidAmount.toFixed(2)} SAI (95% of debt)`);
      return;
    }
    
    setIsSubmitting(true);
    setValidationError('');
    
    try {
      // Mock bid placement for demo purposes
      // In a real implementation, this would call a blockchain transaction
      const result = await mockPlaceBid(auction.id, parseFloat(bidAmount));
      
      if (result.success) {
        onBidPlaced(result);
        setBidAmount('');
      } else {
        onError(new Error(result.message));
      }
    } catch (error) {
      console.error('Error placing bid:', error);
      onError(error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Mock bid placement function (simulates blockchain interaction)
  const mockPlaceBid = async (auctionId, amount) => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Simple validation
    if (amount < auction.debtAmount * 0.95) {
      return {
        success: false,
        message: 'Bid too low'
      };
    }
    
    // Success response
    return {
      success: true,
      txId: 'mock-tx-' + Math.random().toString(36).substring(2, 10),
      status: 'confirmed'
    };
  };
  
  // If no auction is selected, show a placeholder
  if (!auction) {
    return (
      <div className="bid-form-container">
        <div className="no-auction-selected">
          <p>Select an auction to place a bid</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bid-form-container">
      <h3>Place a Bid</h3>
      
      <div className="auction-summary">
        <div className="summary-row">
          <span className="summary-label">Auction ID:</span>
          <span className="summary-value">#{auction.id}</span>
        </div>
        <div className="summary-row">
          <span className="summary-label">Collateral:</span>
          <span className="summary-value highlight">{auction.collateralAmount} {auction.collateralType}</span>
        </div>
        <div className="summary-row">
          <span className="summary-label">Market Value:</span>
          <span className="summary-value">${marketValue.toFixed(2)}</span>
        </div>
        <div className="summary-row">
          <span className="summary-label">Current Price:</span>
          <span className="summary-value">${currentPrice.toFixed(2)}</span>
        </div>
        <div className="summary-row">
          <span className="summary-label">Discount:</span>
          <span className="summary-value discount">{discount.toFixed(2)}%</span>
        </div>
        <div className="summary-row">
          <span className="summary-label">Min. Bid Required:</span>
          <span className="summary-value">{(auction.debtAmount * 0.95).toFixed(2)} SAI</span>
        </div>
      </div>
      
      <form onSubmit={handleSubmit} className="bid-form">
        <div className="form-group">
          <label htmlFor="bidAmount">Bid Amount (SAI)</label>
          <input
            type="number"
            id="bidAmount"
            value={bidAmount}
            onChange={(e) => setBidAmount(e.target.value)}
            placeholder="Enter bid amount in SAI"
            disabled={isSubmitting}
            step="0.01"
            min={auction.debtAmount * 0.95}
          />
          {validationError && <div className="validation-error">{validationError}</div>}
        </div>
        
        <button 
          type="submit" 
          className="bid-button"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Placing Bid...' : 'Place Bid'}
        </button>
      </form>
      
      <div className="bid-instructions">
        <h4>Instructions</h4>
        <ul>
          <li>Your bid must be at least 95% of the debt amount</li>
          <li>If your bid is accepted, you'll receive the collateral</li>
          <li>The debt will be repaid to the protocol from your bid</li>
          <li>Ensure you have sufficient SAI balance in your wallet</li>
        </ul>
      </div>
    </div>
  );
};

export default BidForm; 