import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@project-serum/anchor';

const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
const programId = new PublicKey('CXPpx9X241ULsKQhGbXscVQv6e4yRrcjAJWdQc82gGsV');
const provider = new AnchorProvider(connection, window.solana, { preflightCommitment: 'processed' });

// Define the IDL based on your program structure
const idl = {
    "version": "0.1.0",
    "name": "sai_program",
    "instructions": [
        {
            "name": "mint",
            "accounts": [
                {
                    "name": "user",
                    "isMut": true,
                    "isSigner": true
                }
            ],
            "args": [
                {
                    "name": "amount",
                    "type": "u64"
                }
            ]
        },
        {
            "name": "burn",
            "accounts": [
                {
                    "name": "user",
                    "isMut": true,
                    "isSigner": true
                }
            ],
            "args": [
                {
                    "name": "amount",
                    "type": "u64"
                }
            ]
        },
        {
            "name": "transfer",
            "accounts": [
                {
                    "name": "from",
                    "isMut": true,
                    "isSigner": true
                },
                {
                    "name": "to",
                    "isMut": true,
                    "isSigner": false
                }
            ],
            "args": [
                {
                    "name": "amount",
                    "type": "u64"
                }
            ]
        }
    ]
};

const program = new Program(idl, programId, provider);

export const mintSAI = async (amount) => {
    try {
        const tx = await program.methods
            .mint(new BN(amount))
            .accounts({
                user: provider.wallet.publicKey,
            })
            .rpc();
        return tx;
    } catch (error) {
        console.error('Error minting SAI:', error);
        throw error;
    }
};

export const burnSAI = async (amount) => {
    try {
        const tx = await program.methods
            .burn(new BN(amount))
            .accounts({
                user: provider.wallet.publicKey,
            })
            .rpc();
        return tx;
    } catch (error) {
        console.error('Error burning SAI:', error);
        throw error;
    }
};

export const transferSAI = async (to, amount) => {
    try {
        const tx = await program.methods
            .transfer(new BN(amount))
            .accounts({
                from: provider.wallet.publicKey,
                to: new PublicKey(to),
            })
            .rpc();
        return tx;
    } catch (error) {
        console.error('Error transferring SAI:', error);
        throw error;
    }
};
