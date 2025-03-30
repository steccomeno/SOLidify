// Copy and paste this ENTIRE script into your browser console when on your app page

(function() {
    console.log('SAI Token Import Helper - UPDATED VERSION');
    
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
        max-width: 500px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        font-family: Arial, sans-serif;
    `;
    
    dialog.innerHTML = `
        <h2 style="margin-top: 0; color: #3d3d3d;">Add SAI Token to Phantom</h2>
        <p style="color: #666;">To add the SAI token to your Phantom wallet:</p>
        <ol style="text-align: left; padding-left: 20px;">
            <li>Click on your profile icon in the top-right of Phantom wallet</li>
            <li>Select "Manage tokens" (or scroll down to find it)</li>
            <li>Click on "+ Add custom token" or "Add / Import token"</li>
            <li>Make sure you're on <strong>Devnet</strong> network (check at the top of Phantom) </li>
            <li>Enter these details:
                <ul style="margin-top: 10px; padding-left: 20px;">
                    <li><strong>Token Address:</strong> <input id="token-address" readonly value="${saiTokenAddress}" style="width: 90%; padding: 5px; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px;"></li>
                    <li>The token name, symbol and decimals should auto-populate</li>
                    <li>If they don't, use:
                        <ul>
                            <li><strong>Name:</strong> SAI Stablecoin</li>
                            <li><strong>Symbol:</strong> SAI</li>
                            <li><strong>Decimals:</strong> 6</li>
                        </ul>
                    </li>
                </ul>
            </li>
            <li>Click "Add" or "Import" button</li>
        </ol>
        <div style="margin-top: 10px; padding: 10px; background: #f8f8f8; border-left: 4px solid #512da8; color: #333;">
            <p style="margin: 0;"><strong>Note:</strong> If you're not seeing "Devnet" option, click on the network selector at the top of Phantom wallet and switch to Devnet first.</p>
        </div>
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
        
        try {
            // Try the newer method first
            if (window.phantom?.solana?.tokens) {
                console.log('Trying tokens.add API...');
                await window.phantom.solana.tokens.add({
                    address: saiTokenAddress,
                    symbol: "SAI",
                    name: "SAI Stablecoin",
                    decimals: 6,
                    network: "devnet"
                });
                console.log('Token successfully added via tokens.add API!');
                return true;
            }
        } catch (err) {
            console.log('tokens.add API failed:', err);
        }
        
        return false;
    }
    
    // Try automatic methods, but still show the dialog
    tryAutomaticMethods().then(success => {
        if (success) {
            alert('SAI token was automatically added to your wallet! You may now close this dialog.');
        }
    });
})(); 