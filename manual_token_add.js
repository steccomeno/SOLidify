// Copy and paste this ENTIRE script into your browser console when on your app page

(function() {
    console.log('SAI Token Import Helper');
    
    // Get the token mint address from the app if possible
    let saiTokenAddress = '';
    
    try {
        // Try to get from solanaAPI
        if (window.solanaAPI && window.solanaAPI.saiMint) {
            saiTokenAddress = window.solanaAPI.saiMint;
        } 
        // Fallback to hardcoded value
        else {
            saiTokenAddress = 'GCbezKCTeHfYc6Z92sQ9ECW29XWDyo6WWmB1Dx74tisB';
        }
        
        console.log('Found SAI token address:', saiTokenAddress);
    } catch (error) {
        console.error('Error finding token address:', error);
        saiTokenAddress = 'GCbezKCTeHfYc6Z92sQ9ECW29XWDyo6WWmB1Dx74tisB';
    }
    
    // Create a floating dialog for better UX
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border-radius: 8px;
        z-index: 10000;
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        font-family: Arial, sans-serif;
    `;
    
    dialog.innerHTML = `
        <h2 style="margin-top: 0; color: #3d3d3d;">Add SAI Token to Phantom</h2>
        <p style="color: #666;">To add the SAI token to your Phantom wallet:</p>
        <ol style="text-align: left; padding-left: 20px;">
            <li>Open Phantom extension</li>
            <li>Click the hamburger menu (≡) in the top right</li>
            <li>Click "Add token"</li>
            <li>Enter these details:
                <ul style="margin-top: 10px; padding-left: 20px;">
                    <li><strong>Network:</strong> Devnet</li>
                    <li><strong>Token Address:</strong> <input id="token-address" readonly value="${saiTokenAddress}" style="width: 90%; padding: 5px; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px;"></li>
                    <li><strong>Token Name:</strong> SAI</li>
                    <li><strong>Token Symbol:</strong> SAI</li>
                    <li><strong>Decimals:</strong> 6</li>
                </ul>
            </li>
            <li>Click "Add" and confirm</li>
        </ol>
        <div style="display: flex; justify-content: space-between; margin-top: 15px;">
            <button id="copy-address" style="padding: 8px 16px; background: #512da8; color: white; border: none; border-radius: 4px; cursor: pointer;">Copy Address</button>
            <button id="close-dialog" style="padding: 8px 16px; background: #e0e0e0; color: #333; border: none; border-radius: 4px; cursor: pointer;">Close</button>
        </div>
    `;
    
    // Add to document
    document.body.appendChild(dialog);
    
    // Add event listeners
    document.getElementById('copy-address').addEventListener('click', function() {
        const input = document.getElementById('token-address');
        input.select();
        document.execCommand('copy');
        this.textContent = 'Copied!';
        setTimeout(() => {
            this.textContent = 'Copy Address';
        }, 2000);
    });
    
    document.getElementById('close-dialog').addEventListener('click', function() {
        document.body.removeChild(dialog);
    });
    
    // Try automatic methods
    async function tryAutomaticMethods() {
        if (!window.solana || !window.solana.isPhantom) {
            console.log('Phantom wallet not detected, skipping automatic methods');
            return false;
        }
        
        // Method 1: Try wallet_watchAsset
        try {
            console.log('Trying Method 1 (wallet_watchAsset)...');
            await window.solana.request({
                method: "wallet_watchAsset",
                params: {
                    type: "SPL",
                    options: {
                        address: saiTokenAddress,
                        decimals: 6,
                        symbol: "SAI",
                        name: "SAI Stablecoin"
                    }
                }
            });
            console.log('Method 1 successful!');
            return true;
        } catch (err) {
            console.log('Method 1 failed:', err);
        }
        
        // Method 2: Try phantom.solana.tokens.add
        try {
            if (window.phantom?.solana?.tokens) {
                console.log('Trying Method 2 (phantom.solana.tokens)...');
                await window.phantom.solana.tokens.add({
                    address: saiTokenAddress,
                    symbol: "SAI",
                    name: "SAI Stablecoin",
                    decimals: 6
                });
                console.log('Method 2 successful!');
                return true;
            }
        } catch (err) {
            console.log('Method 2 failed:', err);
        }
        
        return false;
    }
    
    // Try automatic methods, but still show the dialog
    tryAutomaticMethods().then(success => {
        if (success) {
            alert('SAI token was automatically added to your wallet! You can close this dialog.');
        }
    });
})(); 