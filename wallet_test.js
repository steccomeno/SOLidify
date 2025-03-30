/**
 * Wallet Connection Test Script
 * 
 * This script helps diagnose Phantom wallet connection issues.
 * 
 * HOW TO USE:
 * 1. Open your browser console by pressing F12 or right-click > Inspect > Console
 * 2. Copy this ENTIRE script from the first line to the last line
 * 3. Paste it into your browser console when on the SOLidify app page
 * 4. Press Enter to run the script
 */

(function() {
    console.log('======== WALLET TEST STARTING ========');
    console.log('Testing environment:', {
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
    });

    // 1. Check if Phantom wallet is installed
    if (window.solana && window.solana.isPhantom) {
        console.log('✅ Phantom wallet is installed');
        
        // Log wallet details
        try {
            const publicKeyStr = window.solana.publicKey ? window.solana.publicKey.toString() : 'Not available';
            console.log('Wallet details:', {
                isConnected: window.solana.isConnected,
                publicKey: publicKeyStr,
                autoApprove: window.solana.autoApprove,
                isPhantom: window.solana.isPhantom
            });
            
            // Store on window for debugging
            window.phantomDebug = {
                isConnected: window.solana.isConnected,
                publicKey: publicKeyStr,
                hasPublicKey: !!window.solana.publicKey,
                timestamp: Date.now()
            };
        } catch (err) {
            console.error('Error accessing Phantom wallet details:', err);
        }
        
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

        // Attempt direct connect to test Phantom
        console.log('Attempting direct connect to test Phantom...');
        window.solana.connect({ onlyIfTrusted: true })
            .then(response => {
                console.log('✅ Direct connect succeeded:', {
                    publicKey: response.publicKey.toString()
                });
                
                // Update debug info
                window.phantomDebug.directConnectSuccess = true;
                window.phantomDebug.directConnectPublicKey = response.publicKey.toString();
                
                // Try to access methods
                try {
                    console.log('Testing if signTransaction is available:', 
                        typeof window.solana.signTransaction === 'function');
                    console.log('Testing if signAllTransactions is available:', 
                        typeof window.solana.signAllTransactions === 'function');
                    
                    window.phantomDebug.hasSignTransaction = typeof window.solana.signTransaction === 'function';
                } catch (err) {
                    console.error('Error checking transaction signing methods:', err);
                }
                
                // Test a full reconnect
                console.log('Testing full reconnect cycle...');
                window.solana.disconnect()
                    .then(() => {
                        console.log('Successfully disconnected for reconnect test');
                        setTimeout(() => {
                            window.solana.connect()
                                .then(reconnectResponse => {
                                    console.log('✅ Reconnect successful:', {
                                        publicKey: reconnectResponse.publicKey.toString()
                                    });
                                    window.phantomDebug.reconnectSuccess = true;
                                    
                                    // Update adapter reference for the app
                                    console.log('Checking if we can locate the wallet adapter in window...');
                                })
                                .catch(reconnectErr => {
                                    console.error('❌ Reconnect failed:', reconnectErr);
                                    window.phantomDebug.reconnectSuccess = false;
                                });
                        }, 500);
                    })
                    .catch(err => {
                        console.error('Error during disconnect/reconnect test:', err);
                    });
            })
            .catch(error => {
                console.error('❌ Direct connect failed:', error);
                window.phantomDebug.directConnectSuccess = false;
                window.phantomDebug.directConnectError = error.message;
            });
    } else {
        console.error('❌ Phantom wallet is not installed');
    }
    
    console.log('======== WALLET TEST COMPLETED ========');
    console.log('INSTRUCTIONS TO FIX WALLET ISSUES:');
    console.log('1. Make sure Phantom is set to Devnet network in Settings');
    console.log('2. Disconnect your wallet from this site in Phantom settings, then reconnect');
    console.log('3. Try clearing browser cache or using Incognito/Private mode');
    console.log('4. Refresh the page and try connecting again');
    console.log('');
    console.log('If you see "Wallet is not connected" or "public key is not available" errors,');
    console.log('check that Phantom Extension is up to date and properly connected to this site.');
})(); 