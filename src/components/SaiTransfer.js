import React, { useState } from 'react';
import { transferSai } from '../api';
import './SaiTransfer.css';

const SaiTransfer = ({ onSuccess, walletBalance }) => {
    const [recipientAddress, setRecipientAddress] = useState('');
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            // Basic validation
            if (!recipientAddress || recipientAddress.trim() === '') {
                throw new Error('Please enter a recipient address');
            }

            const amountNum = parseFloat(amount);
            if (isNaN(amountNum) || amountNum <= 0) {
                throw new Error('Please enter a valid amount');
            }

            if (amountNum > walletBalance.sai) {
                throw new Error('Insufficient SAI balance');
            }

            // Call API to transfer SAI
            const result = await transferSai(recipientAddress, amountNum);
            
            if (result.success) {
                setSuccess(result.message);
                setAmount('');
                setRecipientAddress('');
                
                // Notify parent component about successful transfer
                if (onSuccess && typeof onSuccess === 'function') {
                    onSuccess();
                }
            } else {
                throw new Error(result.error || 'Transfer failed');
            }
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="sai-transfer-container">
            <h2>Transfer SAI Tokens</h2>
            <div className="balance-display">
                <p>Your SAI Balance: <strong>{walletBalance.sai.toFixed(2)} SAI</strong></p>
            </div>
            
            <form onSubmit={handleSubmit} className="transfer-form">
                <div className="form-group">
                    <label htmlFor="recipient">Recipient Address</label>
                    <input
                        id="recipient"
                        type="text"
                        placeholder="Enter Solana address"
                        value={recipientAddress}
                        onChange={(e) => setRecipientAddress(e.target.value)}
                        disabled={loading}
                    />
                </div>
                
                <div className="form-group">
                    <label htmlFor="amount">Amount (SAI)</label>
                    <input
                        id="amount"
                        type="number"
                        placeholder="0.00"
                        min="0.01"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        disabled={loading}
                    />
                </div>
                
                <button
                    type="submit"
                    className="transfer-button"
                    disabled={loading || !amount || !recipientAddress}
                >
                    {loading ? 'Processing...' : 'Transfer SAI'}
                </button>
            </form>
            
            {error && (
                <div className="error-message">
                    {error}
                </div>
            )}
            
            {success && (
                <div className="success-message">
                    {success}
                </div>
            )}
            
            <div className="transfer-info">
                <h3>About SAI Transfers</h3>
                <p>
                    SAI is a stablecoin backed by collateral. You can transfer SAI tokens to any Solana address.
                    The recipient will automatically receive the tokens in their wallet.
                </p>
                <p>
                    <strong>Note:</strong> Transfers are irreversible. Please double-check the recipient address
                    before confirming the transaction.
                </p>
            </div>
        </div>
    );
};

export default SaiTransfer; 