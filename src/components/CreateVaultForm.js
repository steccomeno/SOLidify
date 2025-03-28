import React, { useState } from 'react';
import { useWallet } from '../utils/walletUtils';
import { createVaultAndMintSai } from '../utils/saiUtils';
import './CreateVaultForm.css';

const CreateVaultForm = () => {
  const { connected, publicKey } = useWallet();
  const [collateralAmount, setCollateralAmount] = useState('');
  const [saiAmount, setSaiAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await createVaultAndMintSai(
        parseFloat(collateralAmount),
        parseFloat(saiAmount),
        { connected, publicKey }
      );

      setSuccess(`Vault created successfully! Transaction: ${result.transactionId}`);
      setCollateralAmount('');
      setSaiAmount('');
    } catch (err) {
      setError(err.message || 'Failed to create vault');
    } finally {
      setLoading(false);
    }
  };

  if (!connected) {
    return (
      <div className="create-vault-form">
        <h2>Create Vault & Mint SAI</h2>
        <p>Please connect your wallet to create a vault and mint SAI.</p>
      </div>
    );
  }

  return (
    <div className="create-vault-form">
      <h2>Create Vault & Mint SAI</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="collateralAmount">Collateral Amount (SOL)</label>
          <input
            type="number"
            id="collateralAmount"
            value={collateralAmount}
            onChange={(e) => setCollateralAmount(e.target.value)}
            placeholder="Enter amount of SOL to lock"
            required
            min="0"
            step="0.1"
          />
        </div>

        <div className="form-group">
          <label htmlFor="saiAmount">SAI Amount to Mint</label>
          <input
            type="number"
            id="saiAmount"
            value={saiAmount}
            onChange={(e) => setSaiAmount(e.target.value)}
            placeholder="Enter amount of SAI to mint"
            required
            min="0"
            step="0.1"
          />
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <button type="submit" disabled={loading}>
          {loading ? 'Creating Vault...' : 'Create Vault & Mint SAI'}
        </button>
      </form>
    </div>
  );
};

export default CreateVaultForm; 