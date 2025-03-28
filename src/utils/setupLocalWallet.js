/**
 * Utility script to help users set up their Phantom wallet for local development
 */

export const setupLocalWallet = async () => {
  try {
    if (!window.solana || !window.solana.isPhantom) {
      throw new Error('Phantom wallet is not installed');
    }

    // Create a custom network configuration
    const customNetwork = {
      name: 'Local Test Validator',
      url: 'http://localhost:8899',
      wsUrl: 'ws://localhost:8900',
      commitment: 'confirmed'
    };

    // Add the custom network to Phantom
    if (window.solana.connection) {
      window.solana.connection = new Connection(customNetwork.url, {
        commitment: customNetwork.commitment,
        wsEndpoint: customNetwork.wsUrl
      });
    }

    // Request airdrop of test SOL
    const response = await fetch('http://localhost:8899', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'requestAirdrop',
        params: [
          window.solana.publicKey.toString(),
          1000000000 // 1 SOL in lamports
        ]
      })
    });

    const result = await response.json();
    
    if (result.error) {
      throw new Error(`Failed to request airdrop: ${result.error.message}`);
    }

    return {
      success: true,
      message: 'Local wallet setup completed successfully',
      balance: 1 // 1 SOL airdropped
    };
  } catch (error) {
    console.error('Failed to setup local wallet:', error);
    return {
      success: false,
      message: 'Failed to setup local wallet: ' + error.message
    };
  }
}; 