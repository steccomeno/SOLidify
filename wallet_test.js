/**
 * Wallet Connection Test Script
 * 
 * This script helps diagnose Phantom wallet connection issues.
 * Open your browser console (F12 or Cmd+Option+I) to see the output logs.
 * 
 * Copy and paste this entire script into your browser console when on the app page
 */

(function() {
    console.log('======== WALLET TEST STARTING ========');
    console.log('Testing environment:', {
        url: window.location.href,
        userAgent: navigator.userAgent
    });

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
        } else if (window.solana.connection?.rpcEndpoint) {
            console.error('❌ Wallet is NOT connected to devnet. Current endpoint: ' + window.solana.connection.rpcEndpoint + '. Switch to devnet in Phantom settings.');
        } else {
            console.warn('⚠️ Cannot determine network. Check Phantom settings and make sure it\'s set to devnet');
        }

        // Test wallet adapter integration
        console.log('Checking wallet adapter integration...');
        if (window.hasOwnProperty('solana_walletAdapterIdentity')) {
            console.log('✅ Wallet adapter appears to be integrated in the app');
        } else {
            console.warn('⚠️ Could not detect wallet adapter integration marker');
        }

        // Check for react context
        const hasReactDevTools = typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined';
        console.log('React DevTools available:', hasReactDevTools);
        
        // Attempt to connect wallet
        console.log('Attempting to connect wallet...');
        window.solana.connect().then(result => {
            console.log('✅ Wallet connected successfully:', {
                publicKey: result.publicKey.toString()
            });
            
            // Add a flag to window to let us know test script ran
            window.walletTestRun = true;
            
            checkTokenAccounts(result.publicKey);
        }).catch(error => {
            console.error('❌ Failed to connect wallet:', error);
        });
        
        // Add hooks for common wallet events
        const originalConnect = window.solana.connect;
        window.solana.connect = function() {
            console.log('Phantom connect method called');
            return originalConnect.apply(this, arguments).then(result => {
                console.log('Phantom connect succeeded:', result);
                return result;
            }).catch(err => {
                console.error('Phantom connect failed:', err);
                throw err;
            });
        };
        console.log('Added connect method hook for debugging');
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
            
            // Check wallet state in React component if we can access it
            if (window.SOLidifyApp && window.SOLidifyApp.walletState) {
                console.log('App wallet state:', window.SOLidifyApp.walletState);
            }
            
            // Test direct connection
            console.log('Testing direct Phantom API call...');
            if (window.solana && window.solana._events) {
                console.log('Phantom event listeners:', 
                    Object.keys(window.solana._events).length > 0 
                        ? Object.keys(window.solana._events) 
                        : 'None found'
                );
            }
            
            // Attempt to reconnect in case of issues
            console.log('If you are having persistent issues, try these steps:');
            console.log('1. In Phantom wallet, go to Settings > Connected Apps');
            console.log('2. Find this application and click Disconnect');
            console.log('3. Refresh the page and try connecting again');
            console.log('4. Make sure Phantom is set to Devnet');
        } catch (error) {
            console.error('Error checking token accounts:', error);
        }
    }
    
    console.log('======== WALLET TEST COMPLETED ========');
    console.log('INSTRUCTIONS:');
    console.log('1. If there are any errors above, they need to be fixed');
    console.log('2. Make sure Phantom is set to Devnet network in Settings');
    console.log('3. Ensure the Program ID and SAI_MINT values match what is in your sai_token_info.json file');
    console.log('4. If problems persist, try clearing your browser cache or using a private/incognito window');
})(); 