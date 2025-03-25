/**
 * Utility functions for wallet management in SOLidify
 */
import { useCallback } from 'react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';

// Constants
const NETWORK = WalletAdapterNetwork.Devnet; // Use Devnet for development
const RPC_ENDPOINT = clusterApiUrl(NETWORK);

// Create a connection to the Solana cluster
export const connection = new Connection(RPC_ENDPOINT);

// Mock wallet state for development
let mockWalletConnected = false;
let mockWalletAddress = null;
let mockBalance = 20; // 20 SOL

/**
 * Get the user's wallet connection status
 * @returns {boolean} Whether the wallet is connected
 */
export const isWalletConnected = () => {
  // In a real app, check wallet adapter connection status
  return mockWalletConnected;
};

/**
 * Connect to the user's wallet
 * @returns {Promise<{success: boolean, address: string|null, message: string}>} Result of connection attempt
 */
export const connectWallet = async () => {
  try {
    // In production, this would use @solana/wallet-adapter-react hooks
    // For the mock, simply set our connected state to true
    mockWalletConnected = true;
    mockWalletAddress = 'MOCK' + Math.random().toString(36).substring(2, 10).toUpperCase();
    
    return {
      success: true,
      address: mockWalletAddress,
      message: 'Wallet connected successfully'
    };
  } catch (error) {
    console.error('Failed to connect wallet:', error);
    return {
      success: false,
      address: null,
      message: 'Failed to connect wallet: ' + error.message
    };
  }
};

/**
 * Disconnect the user's wallet
 * @returns {boolean} Whether disconnect was successful
 */
export const disconnectWallet = () => {
  // In production, call wallet adapter disconnect
  mockWalletConnected = false;
  mockWalletAddress = null;
  return true;
};

/**
 * Get the connected wallet's public key
 * @returns {string|null} The wallet's public key as string, or null if not connected
 */
export const getWalletAddress = () => {
  return mockWalletConnected ? mockWalletAddress : null;
};

/**
 * Get the connected wallet's SOL balance
 * @returns {Promise<number>} Balance in SOL
 */
export const getWalletBalance = async () => {
  try {
    if (!mockWalletConnected) {
      throw new Error('Wallet not connected');
    }
    
    // In production, we would query the actual balance:
    // const publicKey = new PublicKey(getWalletAddress());
    // const balance = await connection.getBalance(publicKey);
    // return balance / 1_000_000_000; // Convert lamports to SOL
    
    // For the mock, return our predefined balance
    return mockBalance;
  } catch (error) {
    console.error('Failed to get wallet balance:', error);
    return 0;
  }
};

/**
 * Check if the user has sufficient SOL for a transaction
 * @param {number} amount - The amount of SOL needed
 * @returns {Promise<boolean>} Whether the user has sufficient balance
 */
export const hasSufficientBalance = async (amount) => {
  try {
    const balance = await getWalletBalance();
    return balance >= amount;
  } catch (error) {
    console.error('Failed to check balance:', error);
    return false;
  }
};

/**
 * Process a transaction that requires SOL
 * @param {number} amount - SOL amount to use
 * @returns {Promise<{success: boolean, message: string, txId: string|null}>} Transaction result
 */
export const processTransaction = async (amount) => {
  try {
    if (!isWalletConnected()) {
      throw new Error('Wallet not connected');
    }
    
    const hasBalance = await hasSufficientBalance(amount);
    if (!hasBalance) {
      throw new Error('Insufficient balance');
    }
    
    // Mock a successful transaction
    mockBalance -= amount; // Reduce the mock balance
    
    // Generate a fake transaction ID
    const fakeTxId = 'TX' + Math.random().toString(36).substring(2, 15).toUpperCase();
    
    return {
      success: true,
      message: `Transaction of ${amount} SOL completed successfully`,
      txId: fakeTxId
    };
  } catch (error) {
    console.error('Transaction failed:', error);
    return {
      success: false,
      message: 'Transaction failed: ' + error.message,
      txId: null
    };
  }
};

/**
 * Hook for using wallet functionality in React components
 * This would be replaced with real wallet-adapter hooks in production
 */
export const useWallet = () => {
  const connect = useCallback(async () => {
    return await connectWallet();
  }, []);
  
  const disconnect = useCallback(() => {
    return disconnectWallet();
  }, []);
  
  return {
    connected: isWalletConnected(),
    publicKey: mockWalletConnected ? new PublicKey(mockWalletAddress) : null,
    connect,
    disconnect,
    getBalance: getWalletBalance,
    processTransaction
  };
};

export default {
  isWalletConnected,
  connectWallet,
  disconnectWallet,
  getWalletAddress,
  getWalletBalance,
  hasSufficientBalance,
  processTransaction,
  useWallet
}; 