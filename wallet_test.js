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
            
            // Check available methods in Phantom
            console.log('Available methods in Phantom:', {
                connect: typeof window.solana.connect === 'function',
                disconnect: typeof window.solana.disconnect === 'function',
                signTransaction: typeof window.solana.signTransaction === 'function',
                signAllTransactions: typeof window.solana.signAllTransactions === 'function',
                signMessage: typeof window.solana.signMessage === 'function',
                signAndSendTransaction: typeof window.solana.signAndSendTransaction === 'function',
                sendTransaction: typeof window.solana.sendTransaction === 'function'
            });
            
            window.phantomDebug.methods = {
                connect: typeof window.solana.connect === 'function',
                disconnect: typeof window.solana.disconnect === 'function',
                signTransaction: typeof window.solana.signTransaction === 'function',
                signAllTransactions: typeof window.solana.signAllTransactions === 'function',
                signMessage: typeof window.solana.signMessage === 'function',
                signAndSendTransaction: typeof window.solana.signAndSendTransaction === 'function',
                sendTransaction: typeof window.solana.sendTransaction === 'function'
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

        // Check wallet adapter
        if (window._solanaSupportedWallets || window.solana_walletAdapterIdentity) {
            console.log('✅ Wallet adapter integration detected');
            
            // Try to find wallet adapter instance
            if (window.solana.isSolanaWalletAdapter) {
                console.log('Direct Solana wallet adapter instance found');
            }
        } else {
            console.warn('⚠️ No wallet adapter integration detected - this may cause issues');
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
                    console.log('Testing if sendTransaction or signAndSendTransaction is available:',
                        typeof window.solana.sendTransaction === 'function' || 
                        typeof window.solana.signAndSendTransaction === 'function');
                    
                    window.phantomDebug.hasSignTransaction = typeof window.solana.signTransaction === 'function';
                    window.phantomDebug.hasSendTransaction = typeof window.solana.sendTransaction === 'function' || 
                                                     typeof window.solana.signAndSendTransaction === 'function';
                    
                    // If sendTransaction is missing, this is a critical issue
                    if (!window.phantomDebug.hasSendTransaction) {
                        console.error('❌ CRITICAL: No sendTransaction or signAndSendTransaction method available! This will prevent operations like creating CDPs or minting tokens.');
                        console.log('Possible fix: Try updating your Phantom wallet extension and reconnecting');
                    }
                } catch (err) {
                    console.error('Error checking transaction signing methods:', err);
                }
                
                // Try a simple method patch on the window object to help fix issues
                console.log('Adding helper function to patch wallet objects...');
                window.patchPhantomWallet = function(walletObj) {
                    if (!walletObj) return null;
                    
                    console.log('Patching wallet object with Phantom methods...');
                    
                    // Ensure publicKey is available
                    if (!walletObj.publicKey && window.solana.publicKey) {
                        walletObj.publicKey = window.solana.publicKey;
                    }
                    
                    // Ensure connected flag is set
                    if (!walletObj.connected && window.solana.isConnected) {
                        walletObj.connected = true;
                    }
                    
                    // Add missing methods from Phantom
                    if (!walletObj.signTransaction && window.solana.signTransaction) {
                        walletObj.signTransaction = (...args) => window.solana.signTransaction(...args);
                    }
                    
                    if (!walletObj.signAllTransactions && window.solana.signAllTransactions) {
                        walletObj.signAllTransactions = (...args) => window.solana.signAllTransactions(...args);
                    }
                    
                    if (!walletObj.sendTransaction) {
                        if (window.solana.signAndSendTransaction) {
                            walletObj.sendTransaction = (...args) => window.solana.signAndSendTransaction(...args);
                        } else if (window.solana.sendTransaction) {
                            walletObj.sendTransaction = (...args) => window.solana.sendTransaction(...args);
                        }
                    }
                    
                    console.log('Wallet patched successfully!');
                    return walletObj;
                };
                
                console.log('To patch your wallet manually, run: window.patchPhantomWallet(yourWalletObject)');
                console.log('This might help fix connection issues in the app');
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
    console.log('If you have "sendTransaction is not a function" errors:');
    console.log('This is a known issue with older Phantom versions or wallet adapter issues');
    console.log('Try manually patching your wallet by refreshing and trying again');
})(); 