import { Program, AnchorProvider } from '@project-serum/anchor';
import { PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount, createTransferInstruction } from '@solana/spl-token';
import BN from 'bn.js';
import saiIDL from '../idl/sai.json';

const PROGRAM_ID = new PublicKey('GY7XKMrF4VMLBou37oBieKzRM6YZJHnjnic5sorE4rRU');
const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// For the SAI token
const SAI_MINT = new PublicKey('GCbezKCTeHfYc6Z92sQ9ECW29XWDyo6WWmB1Dx74tisB');

export class SolanaAPI {
    constructor(connection, wallet) {
        this.connection = connection;
        this.wallet = wallet;
        this.provider = new AnchorProvider(connection, wallet, {
            commitment: 'confirmed',
        });
        this.program = new Program(saiIDL, PROGRAM_ID, this.provider);
    }

    async createCDP(collateralAmount, saiAmount) {
        try {
            if (!this.wallet || !this.wallet.publicKey) {
                throw new Error('Wallet not connected');
            }

            const [cdp] = await PublicKey.findProgramAddress(
                [Buffer.from('cdp'), this.wallet.publicKey.toBuffer()],
                PROGRAM_ID
            );

            const [vault] = await PublicKey.findProgramAddress(
                [Buffer.from('vault'), cdp.toBuffer()],
                PROGRAM_ID
            );

            const [vaultAuthority] = await PublicKey.findProgramAddress(
                [Buffer.from('vault_authority'), cdp.toBuffer()],
                PROGRAM_ID
            );

            const [mintAuthority] = await PublicKey.findProgramAddress(
                [Buffer.from('mint_authority')],
                PROGRAM_ID
            );

            const ownerCollateral = await getAssociatedTokenAddress(
                SOL_MINT,
                this.wallet.publicKey
            );

            const ownerSai = await getAssociatedTokenAddress(
                this.program.programId,
                this.wallet.publicKey
            );

            const transaction = new Transaction();

            // Create associated token account for SAI if it doesn't exist
            try {
                await getAccount(this.connection, ownerSai);
            } catch (error) {
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        this.wallet.publicKey,
                        ownerSai,
                        this.wallet.publicKey,
                        this.program.programId
                    )
                );
            }

            // Initialize CDP instruction
            transaction.add(
                await this.program.methods
                    .initializeCdp(
                        new BN(collateralAmount),
                        new BN(saiAmount)
                    )
                    .accounts({
                        owner: this.wallet.publicKey,
                        cdp,
                        ownerCollateral,
                        collateralMint: SOL_MINT,
                        vault,
                        vaultAuthority,
                        saiMint: this.program.programId,
                        ownerSai,
                        mintAuthority,
                        tokenProgram: TOKEN_PROGRAM_ID,
                        systemProgram: SystemProgram.programId,
                        rent: SYSVAR_RENT_PUBKEY,
                    })
                    .instruction()
            );

            const signature = await this.wallet.sendTransaction(transaction);
            await this.connection.confirmTransaction(signature);

            return {
                success: true,
                cdpAddress: cdp.toString(),
                signature
            };
        } catch (error) {
            console.error('Error creating CDP:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getCDPInfo(cdpAddress) {
        try {
            const cdp = await this.program.account.cdp.fetch(new PublicKey(cdpAddress));
            return {
                success: true,
                data: cdp
            };
        } catch (error) {
            console.error('Error fetching CDP info:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getUserCDPs() {
        try {
            const cdps = await this.program.account.cdp.all([
                {
                    memcmp: {
                        offset: 0, // owner field offset
                        bytes: this.wallet.publicKey.toBase58()
                    }
                }
            ]);

            return {
                success: true,
                data: cdps
            };
        } catch (error) {
            console.error('Error fetching user CDPs:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async addCollateral(cdpAddress, amount) {
        try {
            const cdp = new PublicKey(cdpAddress);
            const [vault] = await PublicKey.findProgramAddress(
                [Buffer.from('vault'), cdp.toBuffer()],
                PROGRAM_ID
            );

            const ownerCollateral = await getAssociatedTokenAddress(
                SOL_MINT,
                this.wallet.publicKey
            );

            const transaction = new Transaction();

            transaction.add(
                await this.program.methods
                    .addCollateral(new BN(amount))
                    .accounts({
                        owner: this.wallet.publicKey,
                        cdp,
                        ownerCollateral,
                        vault,
                        tokenProgram: TOKEN_PROGRAM_ID,
                    })
                    .instruction()
            );

            const signature = await this.wallet.sendTransaction(transaction);
            await this.connection.confirmTransaction(signature);

            return {
                success: true,
                signature
            };
        } catch (error) {
            console.error('Error adding collateral:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async drawSai(cdpAddress, amount) {
        try {
            const cdp = new PublicKey(cdpAddress);
            const [vault] = await PublicKey.findProgramAddress(
                [Buffer.from('vault'), cdp.toBuffer()],
                PROGRAM_ID
            );

            const [mintAuthority] = await PublicKey.findProgramAddress(
                [Buffer.from('mint_authority')],
                PROGRAM_ID
            );

            const ownerSai = await getAssociatedTokenAddress(
                this.program.programId,
                this.wallet.publicKey
            );

            const transaction = new Transaction();

            transaction.add(
                await this.program.methods
                    .drawSai(new BN(amount))
                    .accounts({
                        owner: this.wallet.publicKey,
                        cdp,
                        vault,
                        saiMint: this.program.programId,
                        ownerSai,
                        mintAuthority,
                        tokenProgram: TOKEN_PROGRAM_ID,
                    })
                    .instruction()
            );

            const signature = await this.wallet.sendTransaction(transaction);
            await this.connection.confirmTransaction(signature);

            return {
                success: true,
                signature
            };
        } catch (error) {
            console.error('Error drawing SAI:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async repaySai(cdpAddress, amount) {
        try {
            const cdp = new PublicKey(cdpAddress);
            const ownerSai = await getAssociatedTokenAddress(
                this.program.programId,
                this.wallet.publicKey
            );

            const transaction = new Transaction();

            transaction.add(
                await this.program.methods
                    .repaySai(new BN(amount))
                    .accounts({
                        owner: this.wallet.publicKey,
                        cdp,
                        saiMint: this.program.programId,
                        ownerSai,
                        tokenProgram: TOKEN_PROGRAM_ID,
                    })
                    .instruction()
            );

            const signature = await this.wallet.sendTransaction(transaction);
            await this.connection.confirmTransaction(signature);

            return {
                success: true,
                signature
            };
        } catch (error) {
            console.error('Error repaying SAI:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async closeCDP(cdpAddress) {
        try {
            const cdp = new PublicKey(cdpAddress);
            const [vault] = await PublicKey.findProgramAddress(
                [Buffer.from('vault'), cdp.toBuffer()],
                PROGRAM_ID
            );

            const [vaultAuthority] = await PublicKey.findProgramAddress(
                [Buffer.from('vault_authority'), cdp.toBuffer()],
                PROGRAM_ID
            );

            const ownerCollateral = await getAssociatedTokenAddress(
                SOL_MINT,
                this.wallet.publicKey
            );

            const transaction = new Transaction();

            transaction.add(
                await this.program.methods
                    .closeCdp()
                    .accounts({
                        owner: this.wallet.publicKey,
                        cdp,
                        ownerCollateral,
                        vault,
                        vaultAuthority,
                        tokenProgram: TOKEN_PROGRAM_ID,
                    })
                    .instruction()
            );

            const signature = await this.wallet.sendTransaction(transaction);
            await this.connection.confirmTransaction(signature);

            return {
                success: true,
                signature
            };
        } catch (error) {
            console.error('Error closing CDP:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getTokenBalances() {
        try {
            // Get SOL balance
            const solBalance = await this.connection.getBalance(this.wallet.publicKey);
            console.log(`Raw SOL balance: ${solBalance} lamports, ${solBalance / 1_000_000_000} SOL`);
            
            // Get SAI balance
            let saiBalance = 0;
            try {
                console.log(`Using SAI_MINT: ${SAI_MINT.toString()}`);
                console.log(`User wallet: ${this.wallet.publicKey.toString()}`);
                
                const saiTokenAccount = await getAssociatedTokenAddress(
                    SAI_MINT,
                    this.wallet.publicKey
                );
                console.log(`SAI token account: ${saiTokenAccount.toString()}`);
                
                try {
                    const tokenAccount = await getAccount(this.connection, saiTokenAccount);
                    console.log(`Token account exists with raw amount: ${tokenAccount.amount}`);
                    saiBalance = Number(tokenAccount.amount) / 1_000_000; // Assuming 6 decimals
                } catch (error) {
                    // Check if the error is because the account doesn't exist
                    if (error.message.includes('could not find account')) {
                        console.log('SAI token account not found, balance is 0');
                        
                        // Check if the user is the admin wallet
                        console.log(`Checking if user is admin wallet...`);
                        const adminCheck = this.wallet.publicKey.toString() === '9J5dNhAcuTs9HqWksBTy3iPvTieH2B8ETtE1td7zr4K1';
                        console.log(`User is admin wallet: ${adminCheck}`);
                    } else {
                        console.error('Error checking SAI balance:', error);
                    }
                }
            } catch (error) {
                console.error('Error deriving SAI token account:', error);
            }
            
            return {
                sol: solBalance / 1_000_000_000, // Convert lamports to SOL
                sai: saiBalance
            };
        } catch (error) {
            console.error('Error getting token balances:', error);
            return {
                sol: 0,
                sai: 0
            };
        }
    }
    
    async transferToken(recipientAddress, amount) {
        try {
            // Validate recipient address
            const recipient = new PublicKey(recipientAddress);
            
            // Convert amount to lamports (SAI has 6 decimals)
            const amountLamports = Math.floor(amount * 1_000_000);
            
            // Get sender's SAI token account
            const senderTokenAccount = await getAssociatedTokenAddress(
                SAI_MINT,
                this.wallet.publicKey
            );
            
            // Get or create recipient's SAI token account
            let recipientTokenAccount;
            try {
                recipientTokenAccount = await getAssociatedTokenAddress(
                    SAI_MINT,
                    recipient
                );
                
                // Check if recipient token account exists
                try {
                    await getAccount(this.connection, recipientTokenAccount);
                } catch (error) {
                    // Account doesn't exist, create it
                    const transaction = new Transaction().add(
                        createAssociatedTokenAccountInstruction(
                            this.wallet.publicKey,
                            recipientTokenAccount,
                            recipient,
                            SAI_MINT
                        )
                    );
                    
                    const createAccountSig = await this.wallet.sendTransaction(transaction);
                    await this.connection.confirmTransaction(createAccountSig);
                }
            } catch (error) {
                console.error('Error setting up recipient token account:', error);
                throw new Error('Failed to set up recipient token account');
            }
            
            // Create transfer transaction
            const transferTx = new Transaction().add(
                createTransferInstruction(
                    senderTokenAccount,
                    recipientTokenAccount,
                    this.wallet.publicKey,
                    amountLamports
                )
            );
            
            // Send transaction
            const signature = await this.wallet.sendTransaction(transferTx);
            await this.connection.confirmTransaction(signature);
            
            return {
                success: true,
                signature,
                message: `Successfully transferred ${amount} SAI to ${recipientAddress}`
            };
        } catch (error) {
            console.error('Error transferring tokens:', error);
            return {
                success: false,
                error: error.message || 'Failed to transfer tokens'
            };
        }
    }

    async mintTestSAI(amount) {
        try {
            if (!this.wallet || !this.wallet.publicKey) {
                throw new Error('Wallet not connected');
            }
            
            // Verify the caller is the admin
            if (this.wallet.publicKey.toString() !== '9J5dNhAcuTs9HqWksBTy3iPvTieH2B8ETtE1td7zr4K1') {
                throw new Error('Only the admin can mint tokens');
            }
            
            console.log(`Minting ${amount} SAI tokens to ${this.wallet.publicKey.toString()}`);
            
            // Find the mint authority PDA
            const [mintAuthority] = await PublicKey.findProgramAddress(
                [Buffer.from('mint_authority')],
                PROGRAM_ID
            );
            
            // Get the user's SAI token account
            const userSaiAccount = await getAssociatedTokenAddress(
                SAI_MINT,
                this.wallet.publicKey
            );
            
            // Check if token account exists, if not create it
            let accountExists = false;
            try {
                await getAccount(this.connection, userSaiAccount);
                accountExists = true;
            } catch (error) {
                console.log('Token account does not exist, will create it');
            }
            
            const transaction = new Transaction();
            
            // Create token account if needed
            if (!accountExists) {
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        this.wallet.publicKey,
                        userSaiAccount,
                        this.wallet.publicKey,
                        SAI_MINT
                    )
                );
            }
            
            // Add the mint instruction
            transaction.add(
                await this.program.methods
                    .mintSai(new BN(amount * 1_000_000)) // Convert to lamports (assuming 6 decimals)
                    .accounts({
                        admin: this.wallet.publicKey,
                        saiMint: SAI_MINT,
                        userSaiAccount: userSaiAccount,
                        mintAuthority: mintAuthority,
                        tokenProgram: TOKEN_PROGRAM_ID,
                    })
                    .instruction()
            );
            
            // Send and confirm the transaction
            const signature = await this.wallet.sendTransaction(transaction);
            await this.connection.confirmTransaction(signature);
            
            console.log(`Minting successful! Signature: ${signature}`);
            
            return {
                success: true,
                signature
            };
        } catch (error) {
            console.error('Error minting SAI:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
} 