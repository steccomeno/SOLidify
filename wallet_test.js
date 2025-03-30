/**
 * Wallet Connection Test Script
 * 
 * This script helps diagnose Phantom wallet connection issues and RPC rate limits.
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

    // Define RPC endpoints to test
    const RPC_ENDPOINTS = {
        devnet: [
            "https://api.devnet.solana.com",
            "https://devnet.genesysgo.net",
            "https://solana-devnet-rpc.publicnode.com",
        ],
        mainnet: [
            "https://api.mainnet-beta.solana.com",
            "https://solana-mainnet-rpc.publicnode.com",
            "https://rpc.ankr.com/solana",
        ]
    };

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
    
    // Add RPC endpoint testing function
    window.testRpcEndpoints = async function() {
        console.log('====== TESTING RPC ENDPOINTS ======');
        const results = {
            devnet: {},
            mainnet: {}
        };
        
        try {
            // Import libraries
            const web3 = window.solanaWeb3 || window.SolanaAPI?.web3;
            if (!web3) {
                console.error('Could not find web3 library. Try running this in your app context');
                return;
            }
            
            const { Connection } = web3;
            
            // Test each endpoint
            for (const networkName in RPC_ENDPOINTS) {
                console.log(`\n--- Testing ${networkName.toUpperCase()} RPC endpoints ---`);
                
                for (const endpoint of RPC_ENDPOINTS[networkName]) {
                    try {
                        console.log(`Testing ${endpoint}...`);
                        const startTime = performance.now();
                        
                        // Create connection
                        const connection = new Connection(endpoint, 'confirmed');
                        
                        // Test basic methods
                        const version = await connection.getVersion();
                        const slot = await connection.getSlot();
                        
                        const endTime = performance.now();
                        const responseTime = (endTime - startTime).toFixed(2);
                        
                        console.log(`✅ SUCCESS: ${endpoint}`);
                        console.log(`   Response time: ${responseTime}ms`);
                        console.log(`   Version: ${JSON.stringify(version)}`);
                        console.log(`   Current slot: ${slot}`);
                        
                        results[networkName][endpoint] = {
                            status: 'success',
                            responseTime,
                            version,
                            slot
                        };
                    } catch (error) {
                        console.error(`❌ FAILED: ${endpoint}`);
                        console.error(`   Error: ${error.message}`);
                        
                        results[networkName][endpoint] = {
                            status: 'error',
                            error: error.message
                        };
                        
                        // Check if it's a rate limit error
                        if (error.message.includes('429') || 
                            error.message.includes('rate limit') || 
                            error.message.includes('Connection rate limits exceeded')) {
                            console.error('   This is a RATE LIMIT error. The RPC endpoint is throttling requests.');
                            results[networkName][endpoint].isRateLimit = true;
                        }
                    }
                }
            }
            
            // Test wallet's SOL balance with a working endpoint
            if (window.solana && window.solana.isConnected && window.solana.publicKey) {
                console.log('\n--- Testing SOL balance retrieval ---');
                
                // Find a working devnet endpoint from test results
                const workingDevnetEndpoint = Object.entries(results.devnet)
                    .find(([endpoint, result]) => result.status === 'success');
                
                if (workingDevnetEndpoint) {
                    try {
                        const endpoint = workingDevnetEndpoint[0];
                        console.log(`Using working endpoint: ${endpoint}`);
                        
                        const connection = new Connection(endpoint, 'confirmed');
                        const balance = await connection.getBalance(window.solana.publicKey);
                        
                        console.log(`✅ SOL Balance: ${balance / 1_000_000_000} SOL`);
                    } catch (error) {
                        console.error(`❌ Error getting SOL balance: ${error.message}`);
                    }
                } else {
                    console.error('❌ No working devnet endpoints found to test SOL balance');
                }
            }
            
            console.log('\n====== RPC ENDPOINT TEST RESULTS ======');
            console.log(JSON.stringify(results, null, 2));
            
            // Return for programmatic use
            return results;
        } catch (error) {
            console.error('Error in RPC endpoint test:', error);
            return null;
        }
    };
    
    // Test RPC endpoints
    setTimeout(() => {
        console.log('\n======== TESTING RPC ENDPOINTS ========');
        console.log('This will help diagnose 429 rate limit errors');
        
        if (typeof window.testRpcEndpoints === 'function') {
            window.testRpcEndpoints().then(results => {
                if (results) {
                    // Check if we have any rate limit issues
                    let hasRateLimitIssues = false;
                    for (const network in results) {
                        for (const endpoint in results[network]) {
                            if (results[network][endpoint].isRateLimit) {
                                hasRateLimitIssues = true;
                            }
                        }
                    }
                    
                    if (hasRateLimitIssues) {
                        console.log('\n⚠️ RATE LIMIT ISSUES DETECTED');
                        console.log('This is likely the cause of your 429 errors');
                    }
                    
                    // Find best performing endpoint
                    const workingEndpoints = {};
                    for (const network in results) {
                        workingEndpoints[network] = [];
                        for (const endpoint in results[network]) {
                            if (results[network][endpoint].status === 'success') {
                                workingEndpoints[network].push({
                                    url: endpoint,
                                    responseTime: parseFloat(results[network][endpoint].responseTime)
                                });
                            }
                        }
                        // Sort by response time
                        workingEndpoints[network].sort((a, b) => a.responseTime - b.responseTime);
                    }
                    
                    console.log('\n🔍 RECOMMENDED ENDPOINTS:');
                    for (const network in workingEndpoints) {
                        if (workingEndpoints[network].length > 0) {
                            console.log(`${network.toUpperCase()}: ${workingEndpoints[network][0].url} (${workingEndpoints[network][0].responseTime}ms)`);
                        } else {
                            console.log(`${network.toUpperCase()}: No working endpoints found`);
                        }
                    }
                }
            });
        } else {
            console.error('RPC endpoint test function not available');
        }
    }, 1000);
    
    console.log('======== WALLET TEST COMPLETED ========');
    console.log('INSTRUCTIONS TO FIX WALLET AND RATE LIMIT ISSUES:');
    console.log('1. Make sure Phantom is set to Devnet network in Settings');
    console.log('2. Disconnect your wallet from this site in Phantom settings, then reconnect');
    console.log('3. If you\'re seeing 429 errors (rate limits):');
    console.log('   - Wait a few minutes before trying again');
    console.log('   - Try using a different RPC endpoint (check recommended endpoints above)');
    console.log('   - Consider using a paid/dedicated RPC service for better reliability');
    console.log('4. Try clearing browser cache or using Incognito/Private mode');
    console.log('5. Try uninstalling and reinstalling the Phantom wallet extension');
    console.log('6. Try a different browser (Firefox if you\'re using Chrome, or vice versa)');
    console.log('');
    console.log('If you see "User rejected" errors, check if the Phantom popup is showing');
    console.log('Some adblockers or popup blockers can interfere with Phantom wallet popups');
})(); 