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

        // Add a test transaction function to the window
        window.testPhantomTransaction = async function() {
            try {
                console.log('Creating simple transaction to test Phantom wallet...');
                
                if (!window.solana.isConnected) {
                    console.log('Connecting to Phantom wallet first...');
                    await window.solana.connect();
                }
                
                if (!window.solana.publicKey) {
                    throw new Error('No public key available after connect');
                }
                
                // Import libraries from window.SolanaAPI
                const web3 = window.solanaWeb3 || window.SolanaAPI?.web3;
                if (!web3) {
                    throw new Error('Could not find web3 library. Try running this in your app context');
                }
                
                // Create a simple transaction
                const { Transaction, SystemProgram, PublicKey } = web3;
                const transaction = new Transaction();
                
                // Add a simple SOL transfer instruction (0.001 SOL)
                transaction.add(
                    SystemProgram.transfer({
                        fromPubkey: window.solana.publicKey,
                        toPubkey: window.solana.publicKey, // Send to self
                        lamports: 1000 // 0.000001 SOL
                    })
                );
                
                // Get a recent blockhash
                console.log('Getting recent blockhash...');
                const connection = new web3.Connection('https://api.devnet.solana.com', 'confirmed');
                const { blockhash } = await connection.getRecentBlockhash();
                transaction.recentBlockhash = blockhash;
                transaction.feePayer = window.solana.publicKey;
                
                console.log('Transaction prepared, sending to Phantom for approval...');
                
                // Try direct transaction method
                const signature = await window.solana.signAndSendTransaction(transaction);
                console.log('✅ Transaction successful! Signature:', signature);
                
                // Confirm transaction
                const confirmation = await connection.confirmTransaction(signature.signature);
                console.log('Transaction confirmed:', confirmation);
                
                return {
                    success: true,
                    signature: signature.signature
                };
            } catch (error) {
                console.error('❌ Transaction test failed:', error);
                return {
                    success: false,
                    error: error.message
                };
            }
        };
        
        // Add a simpler test that just requests signing
        window.testPhantomSigning = async function() {
            try {
                console.log('Testing Phantom signing capability...');
                
                if (!window.solana.isConnected) {
                    console.log('Connecting to Phantom wallet first...');
                    await window.solana.connect();
                }
                
                // Try signing a message
                const message = new TextEncoder().encode('This is a test message from SOLidify to verify your Phantom wallet is working properly.');
                
                console.log('Requesting signature for test message...');
                const signature = await window.solana.signMessage(message);
                
                console.log('✅ Message signing successful!', {
                    signature: signature.signature,
                    publicKey: signature.publicKey
                });
                
                return {
                    success: true,
                    signature: signature.signature
                };
            } catch (error) {
                console.error('❌ Message signing test failed:', error);
                return {
                    success: false,
                    error: error.message
                };
            }
        };
        
        console.log('Tests added to window:');
        console.log('1. Run window.testPhantomSigning() to test if Phantom can sign messages');
        console.log('2. Run window.testPhantomTransaction() to test if Phantom can sign and send transactions');
    } else {
        console.error('❌ Phantom wallet is not installed');
    }
    
    console.log('======== WALLET TEST COMPLETED ========');
    console.log('INSTRUCTIONS TO FIX WALLET ISSUES:');
    console.log('1. Make sure Phantom is set to Devnet network in Settings');
    console.log('2. Disconnect your wallet from this site in Phantom settings, then reconnect');
    console.log('3. Try clearing browser cache or using Incognito/Private mode');
    console.log('4. Try uninstalling and reinstalling the Phantom wallet extension');
    console.log('5. Try a different browser (Firefox if you\'re using Chrome, or vice versa)');
    console.log('');
    console.log('If you see "User rejected" errors, check if the Phantom popup is showing');
    console.log('Some adblockers or popup blockers can interfere with Phantom wallet popups');
})(); 