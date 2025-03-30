import { Program, AnchorProvider } from '@project-serum/anchor';
import { PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount, createTransferInstruction } from '@solana/spl-token';
import BN from 'bn.js';
import saiIDL from '../idl/sai.json';
import tokenInfo from '../scripts/sai_token_info.json';

// Extract Program ID and SAI_MINT from tokenInfo
const PROGRAM_ID = new PublicKey('GY7XKMrF4VMLBou37oBieKzRM6YZJHnjnic5sorE4rRU');
const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// Get SAI_MINT from token info file
let SAI_MINT;
try {
    SAI_MINT = new PublicKey(tokenInfo.saiMint);
    console.log('SAI_MINT initialized from token info file:', SAI_MINT.toString());
} catch (error) {
    console.error('Error initializing SAI_MINT:', error);
    // Fallback to a known value if token info is invalid
    SAI_MINT = new PublicKey('GCbezKCTeHfYc6Z92sQ9ECW29XWDyo6WWmB1Dx74tisB');
    console.log('Using fallback SAI_MINT:', SAI_MINT.toString());
}

console.log('Token Info Loaded:', {
    programId: PROGRAM_ID.toString(),
    saiMint: SAI_MINT.toString(),
    adminAddress: tokenInfo.admin
});

export class SolanaAPI {
    constructor(connection, wallet) {
        console.log('SolanaAPI Constructor - Debug Info:');
        console.log('Connection object:', {
            endpoint: connection?.rpcEndpoint,
            commitment: connection?.commitment
        });
        
        // Perform enhanced wallet validation
        if (!wallet) {
            console.error('CRITICAL ERROR: Wallet object is null or undefined');
            throw new Error('Wallet object is null or undefined');
        }
        
        if (!wallet.connected) {
            console.error('CRITICAL ERROR: Wallet is not connected');
            // Check window.solana as backup
            if (window.solana && window.solana.isConnected) {
                console.log('Window.solana is connected but wallet adapter reports disconnected');
                // We'll still try to proceed
            } else {
                throw new Error('Wallet is not connected');
            }
        }
        
        if (!wallet.publicKey) {
            console.error('CRITICAL ERROR: Wallet public key is not available');
            throw new Error('Wallet public key is not available');
        }
        
        // Patch the wallet with methods from window.solana if they're missing
        this.patchWalletMethods(wallet);
        
        console.log('Wallet object after patching:', {
            connected: wallet.connected,
            publicKey: wallet.publicKey.toString(),
            hasSignTransaction: typeof wallet.signTransaction === 'function',
            hasSendTransaction: typeof wallet.sendTransaction === 'function'
        });
        
        this.connection = connection;
        this.wallet = wallet;
        
        try {
            console.log('Creating AnchorProvider...');
            this.provider = new AnchorProvider(connection, wallet, {
                commitment: 'confirmed',
                skipPreflight: false, // More reliable but slower
            });
            console.log('AnchorProvider created successfully');
            
            try {
                console.log('Initializing Program with ID:', PROGRAM_ID.toString(), 'and IDL:', saiIDL.name);
                this.program = new Program(saiIDL, PROGRAM_ID, this.provider);
                console.log('Program initialized successfully');
                // Set a flag on window for wallet test script to detect
                window.solana_walletAdapterIdentity = true;
            } catch (error) {
                console.error('Failed to initialize Program:', error);
                throw new Error(`Program initialization failed: ${error.message}`);
            }
        } catch (error) {
            console.error('Failed to create AnchorProvider:', error);
            throw new Error(`Provider creation failed: ${error.message}`);
        }
        
        console.log('SAI_MINT being used:', SAI_MINT.toString());
    }

    // Add a new method to patch wallet methods
    patchWalletMethods(wallet) {
        // Check and patch signTransaction
        if (!wallet.signTransaction || typeof wallet.signTransaction !== 'function') {
            if (window.solana && typeof window.solana.signTransaction === 'function') {
                console.log('Patching wallet.signTransaction with window.solana.signTransaction');
                wallet.signTransaction = (...args) => window.solana.signTransaction(...args);
            } else {
                console.error('No signTransaction method available in window.solana');
            }
        }
        
        // Check and patch sendTransaction
        if (!wallet.sendTransaction || typeof wallet.sendTransaction !== 'function') {
            if (window.solana && typeof window.solana.signAndSendTransaction === 'function') {
                console.log('Patching wallet.sendTransaction with window.solana.signAndSendTransaction');
                wallet.sendTransaction = async (transaction, connection = this.connection, options = {}) => {
                    console.log('Using patched signAndSendTransaction method');
                    
                    // Ensure transaction has a recent blockhash
                    if (!transaction.recentBlockhash) {
                        console.log('Transaction missing recentBlockhash, adding it now');
                        const { blockhash } = await connection.getLatestBlockhash('confirmed');
                        transaction.recentBlockhash = blockhash;
                    }

                    // Phantom's signAndSendTransaction expects a base64 encoded serialized transaction
                    try {
                        // Log the transaction details before serializing
                        console.log('Transaction before serializing:', {
                            feePayer: transaction.feePayer?.toString(),
                            recentBlockhash: transaction.recentBlockhash,
                            instructions: transaction.instructions.length
                        });
                        
                        // Use direct window.solana method with proper Transaction format
                        const response = await window.solana.signAndSendTransaction(transaction);
                        console.log('Transaction response:', response);
                        await connection.confirmTransaction(response.signature, 'confirmed');
                        return response.signature;
                    } catch (error) {
                        console.error('Error in signAndSendTransaction:', error);
                        
                        // Try fallback approach for Phantom
                        if (error.message.includes('Unexpected') || error.message.includes('rejected')) {
                            console.log('Trying fallback approach with separate sign and send steps');
                            try {
                                // Sign the transaction directly with the wallet
                                const signedTx = await wallet.signTransaction(transaction);
                                console.log('Transaction signed successfully');
                                
                                // Send the signed transaction
                                const serializedTx = signedTx.serialize();
                                const signature = await connection.sendRawTransaction(
                                    serializedTx,
                                    options
                                );
                                console.log('Transaction sent with signature:', signature);
                                await connection.confirmTransaction(signature, 'confirmed');
                                return signature;
                            } catch (fallbackError) {
                                console.error('Fallback approach failed:', fallbackError);
                                throw fallbackError;
                            }
                        }
                        throw error;
                    }
                };
            } else if (window.solana && typeof window.solana.sendTransaction === 'function') {
                console.log('Patching wallet.sendTransaction with window.solana.sendTransaction');
                wallet.sendTransaction = async (transaction, connection = this.connection, options = {}) => {
                    console.log('Using patched sendTransaction method');
                    
                    // Ensure transaction has a recent blockhash
                    if (!transaction.recentBlockhash) {
                        console.log('Transaction missing recentBlockhash, adding it now');
                        const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
                        transaction.recentBlockhash = blockhash;
                    }
                    
                    return window.solana.sendTransaction(transaction, options);
                };
            } else {
                // Create a custom sendTransaction that uses signTransaction and our connection
                console.log('Creating custom sendTransaction method using signTransaction');
                wallet.sendTransaction = async (transaction, connection = this.connection, options = {}) => {
                    console.log('Custom sendTransaction called with transaction:', transaction);
                    try {
                        // Ensure transaction has a recent blockhash
                        if (!transaction.recentBlockhash) {
                            console.log('Transaction missing recentBlockhash, adding it now');
                            const { blockhash } = await connection.getLatestBlockhash('confirmed');
                            transaction.recentBlockhash = blockhash;
                        }
                        
                        // Sign the transaction
                        const signedTx = await wallet.signTransaction(transaction);
                        console.log('Transaction signed successfully');
                        
                        // Send the signed transaction
                        const signature = await connection.sendRawTransaction(
                            signedTx.serialize(),
                            options
                        );
                        console.log('Transaction sent with signature:', signature);
                        
                        // Confirm the transaction if requested
                        if (options.skipPreflight !== true) {
                            const confirmation = await connection.confirmTransaction(
                                signature,
                                options.commitment || 'confirmed'
                            );
                            console.log('Transaction confirmed:', confirmation);
                        }
                        
                        return signature;
                    } catch (error) {
                        console.error('Error in custom sendTransaction:', error);
                        throw error;
                    }
                };
            }
        }
        
        // Check and patch signAllTransactions
        if (!wallet.signAllTransactions || typeof wallet.signAllTransactions !== 'function') {
            if (window.solana && typeof window.solana.signAllTransactions === 'function') {
                console.log('Patching wallet.signAllTransactions with window.solana.signAllTransactions');
                wallet.signAllTransactions = (...args) => window.solana.signAllTransactions(...args);
            } else {
                // Create a fallback that uses signTransaction for each
                console.log('Creating fallback signAllTransactions using signTransaction');
                wallet.signAllTransactions = async (transactions) => {
                    console.log(`Signing ${transactions.length} transactions individually`);
                    return Promise.all(transactions.map(tx => wallet.signTransaction(tx)));
                };
            }
        }
    }

    async createCDP(collateralAmount, saiAmount) {
        try {
            console.log(`Creating CDP with ${collateralAmount} SOL collateral for ${saiAmount} SAI`);
            
            // Convert to raw units
            const collateralLamports = collateralAmount * LAMPORTS_PER_SOL;
            const saiRaw = saiAmount * Math.pow(10, SAI_DECIMALS);
            
            console.log(`Using ${collateralLamports} lamports and ${saiRaw} raw SAI units`);
            
            // Derive addresses
            const [cdp, cdpBump] = await PublicKey.findProgramAddress(
                [Buffer.from("cdp"), this.wallet.publicKey.toBuffer()],
                this.program.programId
            );
            
            const [vault, vaultBump] = await PublicKey.findProgramAddress(
                [Buffer.from("vault"), cdp.toBuffer()],
                this.program.programId
            );
            
            const [mintAuthority, mintAuthorityBump] = await PublicKey.findProgramAddress(
                [Buffer.from("mint-authority")],
                this.program.programId
            );
            
            console.log(`Derived addresses:`, {
                cdp: cdp.toString(),
                vault: vault.toString(),
                mintAuthority: mintAuthority.toString()
            });
            
            // Token accounts
            const ownerCollateral = await getAssociatedTokenAddress(
                new PublicKey(WSOL_MINT), 
                this.wallet.publicKey
            );
            
            const ownerSai = await getAssociatedTokenAddress(
                new PublicKey(this.saiMint),
                this.wallet.publicKey
            );
            
            console.log(`Token accounts:`, {
                ownerCollateral: ownerCollateral.toString(),
                ownerSai: ownerSai.toString()
            });
            
            console.log('Using simplified direct approach...');
            
            // Check if the SAI token account exists
            let saiTokenAccountExists = false;
            try {
                const tokenAccountInfo = await this.connection.getAccountInfo(ownerSai);
                saiTokenAccountExists = !!tokenAccountInfo;
            } catch (error) {
                console.log('Error checking SAI token account:', error);
            }
            
            console.log(saiTokenAccountExists ? 'SAI token account exists' : 'SAI token account does not exist, will create it');
            
            // Create a new transaction
            const transaction = new Transaction();
            
            // Add create token account instruction if needed
            if (!saiTokenAccountExists) {
                console.log('Adding instruction to create token account');
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        this.wallet.publicKey,
                        ownerSai,
                        this.wallet.publicKey,
                        new PublicKey(this.saiMint)
                    )
                );
            }
            
            console.log('Building initializeCdp instruction');
            
            // Add init CDP instruction
            transaction.add(
                await this.program.methods
                    .initializeCdp(
                        new BN(cdpBump),
                        new BN(vaultBump),
                        new BN(mintAuthorityBump),
                        new BN(collateralLamports),
                        new BN(saiRaw)
                    )
                    .accounts({
                        user: this.wallet.publicKey,
                        cdp,
                        vault,
                        mintAuthority,
                        userCollateral: ownerCollateral,
                        userSai: ownerSai,
                        saiMint: new PublicKey(this.saiMint),
                        wsolMint: new PublicKey(WSOL_MINT),
                        tokenProgram: TOKEN_PROGRAM_ID,
                        systemProgram: SystemProgram.programId,
                        rent: SYSVAR_RENT_PUBKEY,
                    })
                    .instruction()
            );
            
            // Get recent blockhash
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.wallet.publicKey;
            
            console.log('Transaction prepared:', {
                instructions: transaction.instructions.length,
                recentBlockhash: blockhash,
                signers: [this.wallet.publicKey.toString()],
            });
            
            // Try different approaches for transaction signing/sending
            try {
                console.log('Directly using signAndSendTransaction from Phantom...');
                
                // Get direct access to Phantom for better compatibility
                const phantomWallet = window.solana;
                
                if (!phantomWallet || !phantomWallet.isPhantom) {
                    throw new Error('Phantom wallet not available');
                }
                
                const serializedTransaction = transaction.serialize({
                    requireAllSignatures: false,
                    verifySignatures: false
                });
                
                // Use the direct Phantom API for maximum compatibility
                const signedTransaction = await phantomWallet.signAndSendTransaction(transaction);
                console.log('Transaction signed and sent:', signedTransaction);
                
                // Confirm the transaction
                const confirmation = await this.connection.confirmTransaction({
                    blockhash,
                    lastValidBlockHeight,
                    signature: signedTransaction.signature
                });
                
                console.log('Transaction confirmed:', confirmation);
                
                return {
                    success: true,
                    signature: signedTransaction.signature,
                    cdp: cdp.toString()
                };
            } catch (error) {
                console.error('Error with Phantom signAndSendTransaction:', error);
                
                // Check if this was a user rejection
                if (error.message && (
                    error.message.includes('User rejected') || 
                    error.message.includes('cancelled') ||
                    error.message.includes('rejected') ||
                    error.message.includes('denied')
                )) {
                    console.log('Transaction was cancelled by the user');
                    return {
                        success: false,
                        error: 'Transaction was cancelled by the user'
                    };
                }
                
                // Since the user didn't reject, it might be a technical issue
                console.error('Technical error during transaction. Will try fallback method.');
                
                // Throw up to trigger fallback
                throw error;
            }
        } catch (error) {
            console.error('Error creating CDP:', error);
            return {
                success: false,
                error: error.message || 'Unknown error creating CDP'
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
            const solBalance = await this.connection.getBalance(this.wallet.publicKey);
            console.log(`Raw SOL balance: ${solBalance} lamports, ${solBalance / LAMPORTS_PER_SOL} SOL`);
            
            let saiBalance = 0;
            
            // Log details about what we're using
            console.log(`Using SAI_MINT: ${this.saiMint}`);
            console.log(`User wallet: ${this.wallet.publicKey.toString()}`);
            
            try {
                // Get the token account address
                const tokenAccount = await getAssociatedTokenAddress(
                    new PublicKey(this.saiMint),
                    this.wallet.publicKey
                );
                
                console.log(`SAI token account: ${tokenAccount.toString()}`);
                
                try {
                    // Try to get the token account
                    const account = await getAccount(this.connection, tokenAccount);
                    saiBalance = Number(account.amount) / Math.pow(10, SAI_DECIMALS);
                    console.log(`Found SAI token account with ${saiBalance} SAI`);
                } catch (error) {
                    if (error.name === 'TokenAccountNotFoundError') {
                        console.log('SAI token account does not exist yet - this is normal for new users');
                        // Create the token account automatically
                        try {
                            console.log('Creating SAI token account automatically...');
                            const transaction = new Transaction().add(
                                createAssociatedTokenAccountInstruction(
                                    this.wallet.publicKey,
                                    tokenAccount,
                                    this.wallet.publicKey,
                                    new PublicKey(this.saiMint)
                                )
                            );
                            
                            // Get recent blockhash
                            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
                            transaction.recentBlockhash = blockhash;
                            transaction.feePayer = this.wallet.publicKey;
                            
                            console.log('Transaction prepared for creating token account');
                            
                            // Try to get window.solana directly
                            if (window.solana && window.solana.isPhantom) {
                                try {
                                    console.log('Using direct Phantom API to create token account');
                                    const signature = await window.solana.signAndSendTransaction(transaction);
                                    
                                    await this.connection.confirmTransaction({
                                        blockhash,
                                        lastValidBlockHeight,
                                        signature: signature.signature
                                    });
                                    
                                    console.log('SAI token account created successfully:', tokenAccount.toString());
                                } catch (phantomError) {
                                    console.log('User declined to create SAI token account:', phantomError.message);
                                }
                            }
                        } catch (createError) {
                            console.error('Failed to create SAI token account automatically:', createError);
                        }
                    } else {
                        throw error;
                    }
                }
            } catch (error) {
                console.error('Error checking SAI balance:', error);
            }
            
            return {
                sol: solBalance / LAMPORTS_PER_SOL,
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