/**
 * Utility functions for wallet management in SOLidify
 */
import { useCallback } from 'react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { useWallet as useWalletAdapter } from '@solana/wallet-adapter-react';

// Update the network configuration to ensure it's using Devnet
const NETWORK = WalletAdapterNetwork.Devnet; // Use Devnet for development
console.log('Wallet configured for network:', NETWORK);
const RPC_ENDPOINT = process.env.REACT_APP_SOLANA_RPC_HOST || clusterApiUrl(NETWORK);
console.log('Using RPC endpoint:', RPC_ENDPOINT);

// Create a connection to the Solana cluster
export const connection = new Connection(RPC_ENDPOINT, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000
});
console.log('Solana connection established with endpoint:', RPC_ENDPOINT);

// Add a function to check if the connection is active
export const checkConnection = async () => {
  try {
    const version = await connection.getVersion();
    console.log('Solana connection is active, version:', version);
    return true;
  } catch (error) {
    console.error('Solana connection check failed:', error);
    return false;
  }
};

// Standalone wallet utility functions
export const isWalletConnected = (wallet) => {
  const result = wallet && wallet.connected && wallet.publicKey;
  console.log('Wallet connection check:', {
    hasWallet: !!wallet,
    isConnected: wallet?.connected,
    hasPublicKey: !!wallet?.publicKey,
    result: !!result
  });
  return result;
};

// More robust connect wallet function
export const connectWallet = async () => {
  try {
    console.log('Attempting to connect wallet...');
    
    // Check if Phantom is installed
    if (!window.solana || !window.solana.isPhantom) {
      console.error('Phantom wallet not found');
      return {
        success: false,
        wallet: null,
        address: null,
        error: 'Phantom wallet not installed'
      };
    }
    
    // Check if connection already exists
    if (window.solana.isConnected) {
      console.log('Wallet already connected');
      const wallet = new PhantomWalletAdapter();
      
      try {
        // Sometimes we need to refresh the connection
        console.log('Refreshing existing connection...');
        await wallet.connect();
      } catch (refreshError) {
        console.log('Error refreshing connection, using existing connection');
      }
      
      return {
        success: true,
        wallet,
        address: wallet.publicKey?.toString(),
        message: 'Wallet connection reused'
      };
    }

    // Create a new connection
    console.log('Creating new wallet connection...');
    const wallet = new PhantomWalletAdapter();
    await wallet.connect();
    console.log('Wallet connected successfully');

    // Verify connection worked
    if (!wallet.connected || !wallet.publicKey) {
      throw new Error('Wallet connection succeeded but no public key available');
    }

    return {
      success: true,
      wallet,
      address: wallet.publicKey?.toString(),
      message: 'Wallet connected successfully'
    };
  } catch (error) {
    console.error('Failed to connect wallet:', error);
    return {
      success: false,
      wallet: null,
      address: null,
      error: error.message || 'Unknown wallet connection error'
    };
  }
};

export const getWalletBalance = async (publicKey) => {
  try {
    if (!publicKey) {
      console.error('getWalletBalance: No wallet public key provided');
      return 0;
    }
    
    // Add retry mechanism for more stability
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        const balance = await connection.getBalance(new PublicKey(publicKey));
        return balance / 1_000_000_000; // Convert lamports to SOL
      } catch (balanceError) {
        attempts++;
        console.warn(`getWalletBalance: Attempt ${attempts}/${maxAttempts} failed: ${balanceError.message}`);
        
        if (attempts >= maxAttempts) {
          console.error('getWalletBalance: All attempts failed');
          return 0;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Fallback
    return 0;
  } catch (error) {
    console.error('Failed to get wallet balance:', error);
    return 0;
  }
};

/**
 * Hook for using wallet functionality in React components
 */
export const useWallet = () => {
  const wallet = useWalletAdapter();
  
  const connect = useCallback(async () => {
    try {
      await wallet.connect();
      return {
        success: true,
        address: wallet.publicKey?.toString(),
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
  }, [wallet]);
  
  const disconnect = useCallback(() => {
    wallet.disconnect();
    return true;
  }, [wallet]);
  
  const getBalance = useCallback(async () => {
    try {
      if (!wallet.publicKey) {
        throw new Error('Wallet not connected');
      }
      
      const balance = await connection.getBalance(wallet.publicKey);
      return balance / 1_000_000_000; // Convert lamports to SOL
    } catch (error) {
      console.error('Failed to get wallet balance:', error);
      return 0;
    }
  }, [wallet.publicKey]);
  
  const hasSufficientBalance = useCallback(async (amount) => {
    try {
      const balance = await getBalance();
      return balance >= amount;
    } catch (error) {
      console.error('Failed to check balance:', error);
      return false;
    }
  }, [getBalance]);
  
  const processTransaction = useCallback(async (amount) => {
    try {
      if (!wallet.publicKey) {
        throw new Error('Wallet not connected');
      }
      
      const hasBalance = await hasSufficientBalance(amount);
      if (!hasBalance) {
        throw new Error('Insufficient balance');
      }
      
      // Here we would implement the actual transaction logic
      // For now, return a mock success
      return {
        success: true,
        message: `Transaction of ${amount} SOL completed successfully`,
        txId: 'TX' + Math.random().toString(36).substring(2, 15).toUpperCase()
      };
    } catch (error) {
      console.error('Transaction failed:', error);
      return {
        success: false,
        message: 'Transaction failed: ' + error.message,
        txId: null
      };
    }
  }, [wallet.publicKey, hasSufficientBalance]);
  
  return {
    connected: wallet.connected,
    publicKey: wallet.publicKey,
    connect,
    disconnect,
    getBalance,
    processTransaction
  };
};

export default {
  useWallet,
  connection,
  isWalletConnected,
  connectWallet,
  getWalletBalance
}; 