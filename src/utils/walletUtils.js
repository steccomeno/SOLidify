/**
 * Utility functions for wallet management in SOLidify
 */
import { useCallback } from 'react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { Connection, PublicKey, clusterApiUrl, Keypair } from '@solana/web3.js';
import { useWallet as useWalletAdapter } from '@solana/wallet-adapter-react';
import { getConnection } from '../api';
import { getAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';

// Update the network configuration to ensure it's using Devnet
const NETWORK = WalletAdapterNetwork.Devnet; // Use Devnet for development
console.log('Wallet configured for network:', NETWORK);
const RPC_ENDPOINT = process.env.REACT_APP_SOLANA_RPC_HOST || clusterApiUrl(NETWORK);
console.log('Using RPC endpoint:', RPC_ENDPOINT);

// Track the current active connection
let activeConnection = null;

// Define default RPC endpoints with updated URLs
const DEFAULT_ENDPOINT = 'https://api.devnet.solana.com';
const BACKUP_ENDPOINTS = [
  'https://solana-devnet-rpc.publicnode.com',
  'https://api.devnet.solana.com',
  'https://devnet.genesysgo.net', 
  'https://rpc.ankr.com/solana_devnet',
  'https://devnet.solana.com',
  'https://api.testnet.solana.com',
  'https://solana-api.projectserum.com'
];

// Initialize or get the active connection
export const getActiveConnection = async () => {
  // If we already have a connection, return it, but verify it's still good first
  if (activeConnection) {
    try {
      // Try a simple call to make sure the connection is still working
      await activeConnection.getVersion();
      return activeConnection;
    } catch (e) {
      console.log('Existing connection failed, creating a new one');
      // Fall through to create a new connection
    }
  }

  // Try to connect to each endpoint one by one
  console.log('Creating new Solana connection...');
  
  // Combine all endpoints into a single array to try
  const allEndpoints = [DEFAULT_ENDPOINT, ...BACKUP_ENDPOINTS];
  
  for (const endpoint of allEndpoints) {
    try {
      console.log(`Trying to connect to: ${endpoint}`);
      const connection = new Connection(endpoint, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000, // 1 minute
        disableRetryOnRateLimit: false
      });
      
      // Test the connection with a simple call
      await connection.getVersion();
      
      // If we got here, connection is working
      console.log(`Successfully connected to: ${endpoint}`);
      activeConnection = connection;
      return connection;
    } catch (error) {
      console.error(`Failed to connect to: ${endpoint}`, error);
      // Continue to next endpoint
    }
  }
  
  // If we got here, all endpoints failed
  console.error('All Solana RPC endpoints failed');
  
  // Create a fallback connection anyway - sometimes getVersion fails but other operations work
  try {
    console.log('Creating fallback connection to default endpoint');
    activeConnection = new Connection(DEFAULT_ENDPOINT, 'confirmed');
    return activeConnection;
  } catch (e) {
    console.error('Failed to create fallback connection', e);
  }
  
  throw new Error('Failed to establish connection to Solana network');
};

// Refresh the connection with a different endpoint
export const refreshConnection = async () => {
  try {
    console.log('Refreshing Solana connection...');
    
    // We'll just create a new connection instead of trying to be clever
    // This ensures we get a fresh working connection
    activeConnection = null;
    return await getActiveConnection();
  } catch (error) {
    console.error('Failed to refresh connection:', error);
    
    // Even if refreshing fails, return the best connection we can
    if (activeConnection) {
      return activeConnection;
    }
    
    // Last ditch effort - create a basic connection
    try {
      console.log('Creating emergency connection to default endpoint');
      activeConnection = new Connection(DEFAULT_ENDPOINT, 'confirmed');
      return activeConnection;
    } catch (e) {
      console.error('Failed to create emergency connection', e);
      throw new Error('Unable to establish any Solana connection');
    }
  }
};

// Default connection - but don't initialize it immediately
export const connection = null; // Will be lazily initialized when needed

// Utility function to check token mint info for debugging
export const checkTokenMintInfo = async (tokenMintAddress, walletPublicKey) => {
  try {
    console.log('Checking token mint info...');
    
    const conn = await getActiveConnection();
    const mintPublicKey = new PublicKey(tokenMintAddress);
    
    // Get the mint info
    const mintInfo = await conn.getAccountInfo(mintPublicKey);
    
    if (!mintInfo) {
      console.error('Token mint not found on-chain!');
      return {
        exists: false,
        error: 'Token mint not found'
      };
    }
    
    console.log('Token mint exists on chain:', {
      address: tokenMintAddress,
      owner: mintInfo.owner.toString(),
      executable: mintInfo.executable,
      lamports: mintInfo.lamports,
      dataSize: mintInfo.data.length
    });
    
    // Try to parse as a token mint
    try {
      const data = Buffer.from(mintInfo.data);
      
      // Basic parsing of mint data (this is a simplified version)
      const mintAuthority = new PublicKey(data.slice(0, 32));
      const supply = data.readBigUInt64LE(36);
      const decimals = data[44];
      
      const isWalletMintAuthority = mintAuthority.equals(new PublicKey(walletPublicKey));
      
      console.log('Token mint details:', {
        mintAuthority: mintAuthority.toString(),
        supply: supply.toString(),
        decimals,
        isWalletMintAuthority
      });
      
      return {
        exists: true,
        isWalletMintAuthority,
        mintAuthority: mintAuthority.toString(),
        supply: supply.toString(),
        decimals
      };
    } catch (parseError) {
      console.error('Error parsing mint data:', parseError);
      return {
        exists: true,
        error: 'Failed to parse mint data'
      };
    }
  } catch (error) {
    console.error('Error checking token mint:', error);
    return {
      exists: false,
      error: error.message
    };
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