/**
 * Standalone Solana RPC Endpoint Test Script
 * 
 * This script tests multiple RPC endpoints to find which ones work best and diagnose rate limit issues.
 * It includes the necessary Solana web3.js library.
 * 
 * How to use:
 * 1. Copy the entire content of this file
 * 2. Open your browser console on the app page
 * 3. Paste and press Enter
 */

(function() {
    console.log('===== SOLANA RPC CONNECTION TEST STARTING =====');
    
    // Include the Solana web3.js library directly (CDN version)
    function loadSolanaWeb3() {
        return new Promise((resolve, reject) => {
            if (window.solanaWeb3) {
                console.log('Solana web3.js already loaded');
                return resolve(window.solanaWeb3);
            }
            
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/@solana/web3.js@latest/lib/index.iife.min.js';
            script.onload = () => {
                console.log('Solana web3.js loaded from CDN');
                window.solanaWeb3 = solanaWeb3;
                resolve(window.solanaWeb3);
            };
            script.onerror = (err) => {
                console.error('Failed to load Solana web3.js:', err);
                reject(err);
            };
            document.head.appendChild(script);
        });
    }
    
    // Define RPC endpoints to test
    const RPC_ENDPOINTS = {
        devnet: [
            "https://api.devnet.solana.com",
            "https://devnet.genesysgo.net",
            "https://solana-devnet-rpc.publicnode.com",
            "https://devnet.helius-rpc.com/?api-key=8475c5f5-e94b-4c4c-9997-05a3d531e786" // Example key, use your own or remove
        ],
        mainnet: [
            "https://api.mainnet-beta.solana.com",
            "https://solana-mainnet-rpc.publicnode.com",
            "https://rpc.ankr.com/solana"
        ]
    };
    
    // Simple delay function
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // Test all RPC endpoints
    async function testRpcEndpoints() {
        try {
            console.log('Loading Solana web3.js library...');
            const web3 = await loadSolanaWeb3();
            
            if (!web3 || !web3.Connection) {
                throw new Error('Failed to load Solana web3.js library');
            }
            
            const { Connection, PublicKey } = web3;
            
            console.log('Solana library loaded successfully:', {
                Connection: !!Connection,
                PublicKey: !!PublicKey
            });
            
            const results = {
                devnet: {},
                mainnet: {}
            };
            
            // Test each endpoint
            for (const networkName of Object.keys(RPC_ENDPOINTS)) {
                console.log(`\n----- Testing ${networkName.toUpperCase()} RPC endpoints -----`);
                
                for (const endpoint of RPC_ENDPOINTS[networkName]) {
                    try {
                        console.log(`Testing ${endpoint}...`);
                        const startTime = performance.now();
                        
                        // Create connection
                        const connection = new Connection(endpoint, 'confirmed');
                        
                        // Test getVersion (simplest call)
                        const version = await connection.getVersion();
                        
                        // Wait a bit to avoid rate limits
                        await delay(500);
                        
                        // Test getSlot (another simple call)
                        const slot = await connection.getSlot();
                        
                        const endTime = performance.now();
                        const responseTime = (endTime - startTime - 500).toFixed(2); // Subtract the delay
                        
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
                        if (error.message?.includes('429') || 
                            error.message?.includes('rate limit') || 
                            error.message?.includes('Connection rate limits exceeded')) {
                            console.error('   This is a RATE LIMIT error. The RPC endpoint is throttling requests.');
                            results[networkName][endpoint].isRateLimit = true;
                        }
                    }
                    
                    // Add a delay between endpoint tests
                    await delay(1000);
                }
            }
            
            // Try to get wallet's SOL balance if wallet is connected
            if (window.solana && window.solana.isConnected && window.solana.publicKey) {
                console.log('\n----- Testing SOL balance retrieval -----');
                
                // Find a working devnet endpoint from test results
                const workingEndpoints = Object.entries(results.devnet)
                    .filter(([_, result]) => result.status === 'success')
                    .sort((a, b) => parseFloat(a[1].responseTime) - parseFloat(b[1].responseTime));
                
                if (workingEndpoints.length > 0) {
                    try {
                        const endpoint = workingEndpoints[0][0];
                        console.log(`Using fastest working endpoint: ${endpoint}`);
                        
                        const connection = new Connection(endpoint, 'confirmed');
                        const publicKey = new PublicKey(window.solana.publicKey.toString());
                        const balance = await connection.getBalance(publicKey);
                        
                        console.log(`✅ SOL Balance: ${balance / 1_000_000_000} SOL`);
                    } catch (error) {
                        console.error(`❌ Error getting SOL balance: ${error.message}`);
                    }
                } else {
                    console.error('❌ No working devnet endpoints found to test SOL balance');
                }
            } else {
                console.warn('⚠️ Phantom wallet not connected, skipping SOL balance test');
            }
            
            // Analyze results and provide recommendations
            let hasRateLimitIssues = false;
            for (const network in results) {
                for (const endpoint in results[network]) {
                    if (results[network][endpoint].isRateLimit) {
                        hasRateLimitIssues = true;
                    }
                }
            }
            
            console.log('\n===== TEST RESULTS =====');
            
            if (hasRateLimitIssues) {
                console.log('⚠️ RATE LIMIT ISSUES DETECTED - This is likely causing your 429 errors');
            }
            
            // Find best performing endpoints
            const recommendations = {};
            for (const network in results) {
                const workingEndpoints = Object.entries(results[network])
                    .filter(([_, result]) => result.status === 'success')
                    .sort((a, b) => parseFloat(a[1].responseTime) - parseFloat(b[1].responseTime));
                
                if (workingEndpoints.length > 0) {
                    recommendations[network] = workingEndpoints[0][0];
                }
            }
            
            console.log('\n🔍 RECOMMENDED ENDPOINTS:');
            for (const network in recommendations) {
                const endpoint = recommendations[network];
                const responseTime = results[network][endpoint].responseTime;
                console.log(`${network.toUpperCase()}: ${endpoint} (${responseTime}ms)`);
            }
            
            console.log('\n===== HOW TO FIX 429 ERRORS =====');
            console.log('1. Update your app to use one of the recommended endpoints above');
            console.log('2. Reduce the frequency of requests to the Solana network');
            console.log('3. Add retry logic with exponential backoff (already implemented in the updated code)');
            console.log('4. Consider using a paid/dedicated RPC service for better reliability');
            
            // Add recommended endpoint to window for easy access
            window.recommendedRpcEndpoint = recommendations.devnet || RPC_ENDPOINTS.devnet[0];
            console.log(`\nThe recommended endpoint is available at window.recommendedRpcEndpoint: ${window.recommendedRpcEndpoint}`);
            
            return results;
        } catch (error) {
            console.error('Error in RPC test:', error);
        }
    }
    
    // Start testing
    console.log('Starting RPC endpoint tests...');
    window.testSolanaRpc = testRpcEndpoints;
    testRpcEndpoints();
    
    console.log('\nA global function window.testSolanaRpc() is available to re-run the test anytime');
})(); 