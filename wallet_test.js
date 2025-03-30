/**
 * Wallet Connection Test Script
 * 
 * This script helps diagnose Phantom wallet connection issues.
 * Open your browser console (F12 or Cmd+Option+I) to see the output logs.
 * 
 * Copy and paste this entire script into your browser console when on localhost:3001
 */

(function() {
    console.log('======== WALLET TEST STARTING ========');

    // 1. Check if Phantom wallet is installed
    if (window.solana && window.solana.isPhantom) {
        console.log('✅ Phantom wallet is installed');
        
        // Log wallet details
        console.log('Wallet details:', {
            isConnected: window.solana.isConnected,
            publicKey: window.solana.publicKey?.toString() || 'Not available',
            autoApprove: window.solana.autoApprove
        });
        
        // Check if wallet is on the right network
        console.log('Network details:', {
            rpcEndpoint: window.solana.connection?.rpcEndpoint || 'Unknown'
        });
        
        if (window.solana.connection?.rpcEndpoint?.includes('devnet')) {
            console.log('✅ Wallet is connected to devnet');
        } else {
            console.error('❌ Wallet is NOT connected to devnet. Switch to devnet in Phantom settings.');
        }

        // Attempt to connect wallet
        console.log('Attempting to connect wallet...');
        window.solana.connect().then(result => {
            console.log('✅ Wallet connected successfully:', {
                publicKey: result.publicKey.toString()
            });
            checkTokenAccounts(result.publicKey);
        }).catch(error => {
            console.error('❌ Failed to connect wallet:', error);
        });
    } else {
        console.error('❌ Phantom wallet is not installed');
    }

    // Function to check token accounts
    async function checkTokenAccounts(publicKey) {
        try {
            console.log('Checking token accounts for address:', publicKey.toString());
            
            // Get program ID and SAI_MINT from the window.SOLidifyConfig if available
            const programId = 'GY7XKMrF4VMLBou37oBieKzRM6YZJHnjnic5sorE4rRU';
            const saiMint = 'GCbezKCTeHfYc6Z92sQ9ECW29XWDyo6WWmB1Dx74tisB';
            
            console.log('Using values:', {
                programId,
                saiMint
            });
            
            // Rest of token account checking would go here
            console.log('To check token accounts, you will need to run additional solana-web3.js code');
            console.log('For now, please check these values match your expected configuration');
        } catch (error) {
            console.error('Error checking token accounts:', error);
        }
    }
    
    console.log('======== WALLET TEST COMPLETED ========');
    console.log('INSTRUCTIONS:');
    console.log('1. If there are any errors above, they need to be fixed');
    console.log('2. Make sure Phantom is set to Devnet network in Settings');
    console.log('3. Ensure the Program ID and SAI_MINT values match what is in your sai_token_info.json file');
})(); 