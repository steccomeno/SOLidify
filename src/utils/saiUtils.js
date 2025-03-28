/**
 * Utility functions for interacting with the SAI token
 */

import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { Program } from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';
import { connection } from './walletUtils';

// Program IDs
const SAI_PROGRAM_ID = new PublicKey('SLDifYuM6bE18jA7fTynPvqjZpNLEVzKUFXqNhyw3EV');
const SAI_MINT = new PublicKey('SAiMint1111111111111111111111111111111111111111');

// Initialize program
const program = new Program(
  require('../idl/sai.json'),
  SAI_PROGRAM_ID,
  { connection }
);

/**
 * Create a new vault and mint SAI
 * @param {number} collateralAmount - Amount of SOL to lock as collateral
 * @param {number} saiAmount - Amount of SAI to mint
 * @param {object} wallet - Connected wallet
 * @returns {Promise<object>} Transaction result
 */
export async function createVaultAndMintSai(collateralAmount, saiAmount, wallet) {
  if (!wallet.connected) {
    throw new Error('Wallet not connected');
  }

  try {
    const collateralAmountLamports = Math.floor(collateralAmount * 1e9); // Convert to lamports
    const saiAmountDecimals = Math.floor(saiAmount * 1e6); // Convert to SAI decimals

    // Generate PDA for the vault
    const [vaultPda] = await PublicKey.findProgramAddress(
      [
        Buffer.from('vault'),
        wallet.publicKey.toBuffer()
      ],
      SAI_PROGRAM_ID
    );

    // Get associated token account for SAI
    const [tokenAccount] = await PublicKey.findProgramAddress(
      [
        wallet.publicKey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        SAI_MINT.toBuffer()
      ],
      TOKEN_PROGRAM_ID
    );

    // Create the transaction
    const tx = await program.methods
      .createVaultAndMintSai(
        new BN(collateralAmountLamports),
        new BN(saiAmountDecimals)
      )
      .accounts({
        vault: vaultPda,
        owner: wallet.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        saiMint: SAI_MINT,
        ownerTokenAccount: tokenAccount
      })
      .rpc();

    return {
      success: true,
      transactionId: tx,
      vaultAddress: vaultPda.toString()
    };
  } catch (error) {
    console.error('Error creating vault and minting SAI:', error);
    throw error;
  }
}

/**
 * Get SAI balance for a wallet
 * @param {PublicKey} walletPubkey - Wallet public key
 * @returns {Promise<number>} SAI balance
 */
export async function getSaiBalance(walletPubkey) {
  try {
    const [tokenAccount] = await PublicKey.findProgramAddress(
      [
        walletPubkey.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        SAI_MINT.toBuffer()
      ],
      TOKEN_PROGRAM_ID
    );

    const account = await program.provider.connection.getTokenAccountBalance(tokenAccount);
    return account.value.uiAmount;
  } catch (error) {
    console.error('Error getting SAI balance:', error);
    return 0;
  }
}

/**
 * Get vault details
 * @param {string} vaultAddress - Vault public key
 * @returns {Promise<object>} Vault details
 */
export async function getVaultDetails(vaultAddress) {
  try {
    const vaultPubkey = new PublicKey(vaultAddress);
    const vault = await program.account.vault.fetch(vaultPubkey);

    return {
      owner: vault.owner.toString(),
      collateralAmount: vault.collateralAmount.toNumber() / 1e9,
      debtAmount: vault.debtAmount.toNumber() / 1e6,
      healthFactor: vault.healthFactor,
      collateralType: vault.collateralType
    };
  } catch (error) {
    console.error('Error getting vault details:', error);
    throw error;
  }
} 