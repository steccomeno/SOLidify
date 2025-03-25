import React, { useState, useEffect } from 'react';
import './SolanaTransactionLog.css';

/**
 * SolanaTransactionLog Component
 * 
 * Displays a log of simulated Solana transactions for the SOLidify protocol
 */
const SolanaTransactionLog = () => {
  const [transactions, setTransactions] = useState([]);
  
  useEffect(() => {
    // Generate mock transactions on component mount
    const mockTransactions = generateMockTransactions();
    setTransactions(mockTransactions);
    
    // Simulate new transactions coming in periodically
    const interval = setInterval(() => {
      const newTransaction = generateRandomTransaction();
      setTransactions(prev => [newTransaction, ...prev.slice(0, 19)]);
    }, 12000);
    
    return () => clearInterval(interval);
  }, []);
  
  /**
   * Format a Solana address for display
   * @param {string} address - The full Solana address
   * @returns {string} Shortened address with ellipsis
   */
  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
  };
  
  /**
   * Format timestamp for display
   * @param {number} timestamp - Unix timestamp in milliseconds
   * @returns {string} Formatted time string
   */
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };
  
  /**
   * Generate mock transaction history data
   * @returns {Array} Array of mock transaction objects
   */
  const generateMockTransactions = () => {
    const transactionTypes = ['deposit', 'withdraw', 'borrow', 'repay', 'liquidate'];
    const collateralTypes = ['SOL', 'ETH', 'BTC', 'USDC'];
    
    return Array.from({ length: 20 }, (_, i) => {
      const type = transactionTypes[Math.floor(Math.random() * transactionTypes.length)];
      const collateralType = collateralTypes[Math.floor(Math.random() * collateralTypes.length)];
      const amount = (Math.random() * (type === 'liquidate' ? 5 : 2)).toFixed(2);
      
      return generateTransactionObject(type, collateralType, amount);
    });
  };
  
  /**
   * Generate a random transaction object
   * @returns {Object} Transaction object
   */
  const generateRandomTransaction = () => {
    const transactionTypes = ['deposit', 'withdraw', 'borrow', 'repay', 'liquidate'];
    const collateralTypes = ['SOL', 'ETH', 'BTC', 'USDC'];
    
    const type = transactionTypes[Math.floor(Math.random() * transactionTypes.length)];
    const collateralType = collateralTypes[Math.floor(Math.random() * collateralTypes.length)];
    const amount = (Math.random() * (type === 'liquidate' ? 5 : 2)).toFixed(2);
    
    return generateTransactionObject(type, collateralType, amount);
  };
  
  /**
   * Generate a transaction object with the given parameters
   * @param {string} type - Transaction type
   * @param {string} collateralType - Type of collateral
   * @param {string} amount - Transaction amount
   * @returns {Object} Transaction object
   */
  const generateTransactionObject = (type, collateralType, amount) => {
    // Generate a random Solana-like address
    const generateAddress = () => {
      let address = '';
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      for (let i = 0; i < 44; i++) {
        address += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return address;
    };
    
    // Generate a transaction signature
    const generateSignature = () => {
      let sig = '';
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      for (let i = 0; i < 88; i++) {
        sig += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return sig;
    };
    
    return {
      id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type,
      collateralType,
      amount,
      timestamp: Date.now() - Math.floor(Math.random() * 1000000),
      sender: generateAddress(),
      recipient: generateAddress(),
      signature: generateSignature(),
      status: Math.random() > 0.05 ? 'confirmed' : 'pending',
      programId: 'SLDifYuM6bE18jA7fTynPvqjZpNLEVzKUFXqNhyw3EV'
    };
  };
  
  /**
   * Get CSS class and label for transaction status
   * @param {string} status - Transaction status
   * @returns {Object} Object with className and label
   */
  const getStatusDisplay = (status) => {
    switch(status) {
      case 'confirmed':
        return { className: 'status-confirmed', label: 'Confirmed' };
      case 'pending':
        return { className: 'status-pending', label: 'Pending' };
      default:
        return { className: 'status-unknown', label: 'Unknown' };
    }
  };
  
  /**
   * Get a descriptive message for the transaction
   * @param {Object} tx - Transaction object
   * @returns {string} Human-readable transaction description
   */
  const getTransactionMessage = (tx) => {
    switch(tx.type) {
      case 'deposit':
        return `Deposited ${tx.amount} ${tx.collateralType} as collateral`;
      case 'withdraw':
        return `Withdrew ${tx.amount} ${tx.collateralType} from collateral`;
      case 'borrow':
        return `Borrowed ${tx.amount} SAI against ${tx.collateralType} collateral`;
      case 'repay':
        return `Repaid ${tx.amount} SAI debt`;
      case 'liquidate':
        return `Liquidated ${tx.amount} ${tx.collateralType} from undercollateralized vault`;
      default:
        return `Unknown transaction type: ${tx.type}`;
    }
  };
  
  return (
    <div className="solana-transaction-log">
      <div className="transaction-log-header">
        <h2>Solana Transaction Log</h2>
        <div className="program-id">
          <span className="label">Program ID:</span>
          <span className="value">SLDifYuM6bE18jA7fTynPvqjZpNLEVzKUFXqNhyw3EV</span>
        </div>
      </div>
      
      <div className="transaction-list">
        {transactions.map(tx => {
          const statusDisplay = getStatusDisplay(tx.status);
          
          return (
            <div key={tx.id} className={`transaction-item ${tx.type}`}>
              <div className="transaction-icon">
                {tx.type.charAt(0).toUpperCase()}
              </div>
              
              <div className="transaction-content">
                <div className="transaction-title">
                  <span className="transaction-type">{tx.type.toUpperCase()}</span>
                  <span className={`transaction-status ${statusDisplay.className}`}>
                    {statusDisplay.label}
                  </span>
                </div>
                
                <div className="transaction-message">
                  {getTransactionMessage(tx)}
                </div>
                
                <div className="transaction-details">
                  <div className="detail">
                    <span className="label">Time:</span>
                    <span className="value">{formatTime(tx.timestamp)}</span>
                  </div>
                  
                  <div className="detail">
                    <span className="label">From:</span>
                    <span className="value address">{formatAddress(tx.sender)}</span>
                  </div>
                  
                  <div className="detail">
                    <span className="label">Signature:</span>
                    <span className="value signature">{formatAddress(tx.signature)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SolanaTransactionLog; 