import React, { useState, useEffect } from 'react';
import { mintSAI, burnSAI, transferSAI } from '../api';

const SaiInterface = () => {
    const [amount, setAmount] = useState(0);
    const [recipient, setRecipient] = useState('');
    const [walletConnected, setWalletConnected] = useState(false);

    useEffect(() => {
        // Check if Phantom wallet is connected
        const checkWallet = async () => {
            try {
                const isPhantomInstalled = window.solana && window.solana.isPhantom;
                if (!isPhantomInstalled) {
                    alert('Please install Phantom wallet');
                    return;
                }
                
                const response = await window.solana.connect({ onlyIfTrusted: true });
                setWalletConnected(true);
                console.log('Connected with Public Key:', response.publicKey.toString());
            } catch (error) {
                console.log('Wallet not connected');
                setWalletConnected(false);
            }
        };

        checkWallet();
    }, []);

    const connectWallet = async () => {
        try {
            if (!window.solana) {
                alert('Please install Phantom wallet');
                return;
            }

            const response = await window.solana.connect();
            setWalletConnected(true);
            console.log('Connected with Public Key:', response.publicKey.toString());
        } catch (error) {
            console.error('Error connecting wallet:', error);
            alert('Failed to connect wallet');
        }
    };

    const handleMint = async () => {
        try {
            if (!walletConnected) {
                alert('Please connect your wallet first');
                return;
            }
            await mintSAI(amount);
            alert('Minted SAI successfully!');
        } catch (error) {
            console.error('Error minting SAI:', error);
            alert('Failed to mint SAI: ' + error.message);
        }
    };

    const handleBurn = async () => {
        try {
            if (!walletConnected) {
                alert('Please connect your wallet first');
                return;
            }
            await burnSAI(amount);
            alert('Burned SAI successfully!');
        } catch (error) {
            console.error('Error burning SAI:', error);
            alert('Failed to burn SAI: ' + error.message);
        }
    };

    const handleTransfer = async () => {
        try {
            if (!walletConnected) {
                alert('Please connect your wallet first');
                return;
            }
            if (!recipient) {
                alert('Please enter a recipient address');
                return;
            }
            await transferSAI(recipient, amount);
            alert('Transferred SAI successfully!');
        } catch (error) {
            console.error('Error transferring SAI:', error);
            alert('Failed to transfer SAI: ' + error.message);
        }
    };

    return (
        <div>
            <h1>SAI Stablecoin Interface</h1>
            {!walletConnected ? (
                <button onClick={connectWallet}>Connect Phantom Wallet</button>
            ) : (
                <div>
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Amount"
                    />
                    <input
                        type="text"
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        placeholder="Recipient Address"
                    />
                    <div>
                        <button onClick={handleMint}>Mint SAI</button>
                        <button onClick={handleBurn}>Burn SAI</button>
                        <button onClick={handleTransfer}>Transfer SAI</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SaiInterface;
