import { Program, AnchorProvider } from '@project-serum/anchor';
import { PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount, createTransferInstruction } from '@solana/spl-token';
import BN from 'bn.js';
import saiIDL from '../idl/sai.json';
import tokenInfo from '../scripts/sai_token_info.json';
import { Keypair } from '@solana/web3.js';

// Constants
const PROGRAM_ID = new PublicKey('GY7XKMrF4VMLBou37oBieKzRM6YZJHnjnic5sorE4rRU');
const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const SAI_DECIMALS = 6; // Define SAI_DECIMALS constant
const WSOL_MINT = SOL_MINT; // Define WSOL_MINT for compatibility

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
        this.saiMint = SAI_MINT.toString();
        
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
            
            // Validate input
            if (isNaN(collateralAmount) || collateralAmount <= 0) {
                return {
                    success: false,
                    error: 'Collateral amount must be a positive number'
                };
            }
            
            if (isNaN(saiAmount) || saiAmount <= 0) {
                return {
                    success: false,
                    error: 'SAI amount must be a positive number'
                };
            }
            
            // Convert to raw units
            const collateralLamports = Math.floor(collateralAmount * LAMPORTS_PER_SOL);
            const saiRaw = Math.floor(saiAmount * Math.pow(10, SAI_DECIMALS));
            
            console.log(`Using ${collateralLamports} lamports and ${saiRaw} raw SAI units`);
            
            // Create a new CDP account with the program
            const cdpKeypair = new Keypair();
            const cdp = cdpKeypair.publicKey;
            
            console.log('Generated new CDP keypair:', cdp.toString());
            
            // Derive the vault and vault authority PDAs
            const [vault] = await PublicKey.findProgramAddress(
                [Buffer.from("vault"), cdp.toBuffer()],
                this.program.programId
            );
            
            const [vaultAuthority] = await PublicKey.findProgramAddress(
                [Buffer.from("vault_authority"), cdp.toBuffer()],
                this.program.programId
            );
            
            // Find the mint authority
            const [mintAuthority] = await PublicKey.findProgramAddress(
                [Buffer.from("mint_authority")],
                this.program.programId
            );
            
            console.log('Derived addresses:', {
                cdp: cdp.toString(),
                vault: vault.toString(),
                vaultAuthority: vaultAuthority.toString(),
                mintAuthority: mintAuthority.toString()
            });
            
            // Get token accounts
            const ownerCollateral = await getAssociatedTokenAddress(
                new PublicKey(WSOL_MINT),
                this.wallet.publicKey
            );
            
            const ownerSai = await getAssociatedTokenAddress(
                new PublicKey(this.saiMint),
                this.wallet.publicKey
            );
            
            console.log('Token accounts:', {
                ownerCollateral: ownerCollateral.toString(),
                ownerSai: ownerSai.toString()
            });
            
            // Create SAI token account if it doesn't exist
            try {
                await this.createTokenAccount(ownerSai);
            } catch (e) {
                console.log('Token account creation error (might already exist):', e);
            }
            
            // Create transaction
            const transaction = new Transaction();
            
            // Build instruction based on IDL
            console.log('Building instruction with EXACT IDL parameters...');
            
            try {
                // First, let's prepare the accounts exactly as they appear in the IDL
                const accounts = {
                    owner: this.wallet.publicKey,         // owner in IDL
                    cdp: cdp,                             // cdp in IDL
                    ownerCollateral: ownerCollateral,     // ownerCollateral in IDL
                    collateralMint: new PublicKey(WSOL_MINT), // collateralMint in IDL
                    vault: vault,                         // vault in IDL
                    vaultAuthority: vaultAuthority,       // vaultAuthority in IDL
                    saiMint: new PublicKey(this.saiMint),  // saiMint in IDL
                    ownerSai: ownerSai,                   // ownerSai in IDL
                    mintAuthority: mintAuthority,         // mintAuthority in IDL
                    tokenProgram: TOKEN_PROGRAM_ID,        // tokenProgram in IDL
                    systemProgram: SystemProgram.programId, // systemProgram in IDL
                    rent: SYSVAR_RENT_PUBKEY,             // rent in IDL
                };
                
                // Now build instruction with exactly two parameters as specified in IDL
                const instruction = await this.program.methods
                    .initializeCdp(
                        new BN(collateralLamports),
                        new BN(saiRaw)
                    )
                    .accounts(accounts)
                    .signers([cdpKeypair])  // CDP account is a signer according to IDL
                    .instruction();
                
                transaction.add(instruction);
            } catch (error) {
                console.error('Error building instruction:', error);
                return {
                    success: false,
                    error: `Instruction building failed: ${error.message}`
                };
            }
            
            // Setup transaction
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.wallet.publicKey;
            
            // Add the CDP keypair as a signer
            transaction.partialSign(cdpKeypair);
            
            // Sign with wallet and send
            console.log('Transaction prepared, sending...');
            
            try {
                const signature = await this.wallet.sendTransaction(transaction, this.connection);
                console.log('Transaction sent with signature:', signature);
                
                const confirmation = await this.connection.confirmTransaction({
                    blockhash,
                    lastValidBlockHeight,
                    signature
                });
                
                console.log('CDP created successfully!', confirmation);
                
                return {
                    success: true,
                    signature,
                    cdp: cdp.toString()
                };
            } catch (error) {
                console.error('Transaction error:', error);
                
                // Check for common error messages and provide better explanations
                if (error.message?.includes('Insufficient funds')) {
                    return {
                        success: false,
                        error: 'Insufficient SOL balance to pay transaction fees and provide collateral'
                    };
                } else if (error.message?.includes('rejected')) {
                    return {
                        success: false,
                        error: 'Transaction was rejected by user'
                    };
                } else if (error.message?.includes('blockhash')) {
                    return {
                        success: false,
                        error: 'Transaction timed out, please try again'
                    };
                }
                
                return {
                    success: false,
                    error: error.message || 'Unknown error creating CDP'
                };
            }
        } catch (error) {
            console.error('Error in createCDP:', error);
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

    async addSAIToPhantomWallet() {
        try {
            if (!window.solana || !window.solana.isPhantom) {
                console.log('Phantom wallet not detected');
                return { success: false, error: 'Phantom wallet not detected' };
            }
            
            console.log('Attempting to add SAI token to Phantom wallet...');
            
            // Try different methods for adding the token
            try {
                // Method 1: Using Phantom's recommended method
                await window.solana.request({
                    method: "wallet_watchAsset",
                    params: {
                        type: "SPL", // Solana's token type
                        options: {
                            address: this.saiMint, // The token address
                            decimals: SAI_DECIMALS,
                            symbol: "SAI",
                            name: "SAI Stablecoin"
                        }
                    }
                });
                
                console.log('SAI token added to Phantom wallet successfully (Method 1)');
                return { success: true };
            } catch (method1Error) {
                console.log('Method 1 failed:', method1Error);
                
                // Method 2: Using Phantom's experimental token API
                try {
                    if (window.phantom && window.phantom.solana && window.phantom.solana.tokens) {
                        console.log('Trying Method 2 with phantom.solana.tokens');
                        await window.phantom.solana.tokens.add({
                            address: this.saiMint,
                            symbol: "SAI",
                            name: "SAI Stablecoin", 
                            decimals: SAI_DECIMALS,
                            logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png" // Using SOL logo as placeholder
                        });
                        
                        console.log('SAI token added to Phantom wallet successfully (Method 2)');
                        return { success: true };
                    }
                } catch (method2Error) {
                    console.log('Method 2 failed:', method2Error);
                }
                
                // Method 3: Direct instruction for the user
                const mintAddress = this.saiMint;
                console.log('Providing manual instructions to add token');
                
                // Create a dialog with easy-to-copy information
                const message = `To add SAI token to your Phantom wallet:\n\n` +
                    `1. Open Phantom extension\n` +
                    `2. Click the hamburger menu (3 lines) in the top right\n` +
                    `3. Click "Add token"\n` +
                    `4. Paste this address into 'Token Address':\n\n` +
                    `${mintAddress}\n\n` +
                    `5. Click "Add" and confirm`;
                    
                alert(message);
                
                // If we got here, both automatic methods failed but we gave instructions
                console.log('Provided manual instructions for adding SAI token');
                return { 
                    success: false, 
                    error: 'Automatic token addition failed, manual instructions provided',
                    mintAddress
                };
            }
        } catch (error) {
            console.error('Error adding SAI token to Phantom wallet:', error);
            
            // Fallback to manual instructions
            alert(`Please add the SAI token manually in Phantom wallet:\n\n` +
                  `Token address: ${this.saiMint}\n` +
                  `Decimals: ${SAI_DECIMALS}\n` +
                  `Symbol: SAI\n` +
                  `Network: Devnet`);
                  
            return { success: false, error: error.message };
        }
    }

    async getTokenBalances() {
        try {
            if (!this.wallet || !this.wallet.publicKey) {
                console.warn('getTokenBalances: Wallet not connected');
                return { sol: 0, sai: 0 };
            }

            // Get SOL balance
            let solBalance = 0;
            try {
                solBalance = await this.connection.getBalance(this.wallet.publicKey);
                console.log(`Raw SOL balance: ${solBalance} lamports, ${solBalance / LAMPORTS_PER_SOL} SOL`);
            } catch (err) {
                console.error('Error getting SOL balance:', err);
            }
            
            // Get SAI token account or create it if it doesn't exist
            let saiBalance = 0;
            let tokenAccount;
            
            try {
                // Token details
                console.log(`Using SAI_MINT: ${this.saiMint}`);
                console.log(`User wallet: ${this.wallet.publicKey.toString()}`);
                
                // Get associated token account address
                tokenAccount = await getAssociatedTokenAddress(
                    new PublicKey(this.saiMint),
                    this.wallet.publicKey
                );
                
                console.log(`SAI token account address: ${tokenAccount.toString()}`);
                
                // Check if the token account exists
                try {
                    const accountInfo = await this.connection.getAccountInfo(tokenAccount);
                    
                    if (accountInfo) {
                        console.log('SAI token account exists, getting balance');
                        const account = await getAccount(this.connection, tokenAccount);
                        saiBalance = Number(account.amount) / Math.pow(10, SAI_DECIMALS);
                        console.log(`Found SAI token account with ${saiBalance} SAI`);
                    } else {
                        console.log('SAI token account does not exist, will create it');
                        
                        // Create the token account directly without requiring user to add token to wallet
                        await this.createTokenAccount(tokenAccount);
                    }
                } catch (accountError) {
                    console.log('Error checking token account, will create:', accountError);
                    
                    // Create the token account directly
                    await this.createTokenAccount(tokenAccount);
                }
            } catch (error) {
                console.error('Error in token account creation flow:', error);
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
            
            // Get admin address from token info
            const adminAddress = tokenInfo.admin || '9J5dNhAcuTs9HqWksBTy3iPvTieH2B8ETtE1td7zr4K1';
            console.log('Admin from config:', adminAddress);
            console.log('Wallet address:', this.wallet.publicKey.toString());
            
            // Verify the caller is the admin
            if (this.wallet.publicKey.toString() !== adminAddress) {
                throw new Error(`Only the admin can mint tokens. Current admin: ${adminAddress}`);
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
            
            // Convert amount to raw units with proper decimals
            const mintAmount = new BN(Math.floor(amount * Math.pow(10, SAI_DECIMALS)));
            console.log('Mint amount in raw units:', mintAmount.toString());
            
            // Add the mint instruction
            transaction.add(
                await this.program.methods
                    .mintSai(mintAmount)
                    .accounts({
                        admin: this.wallet.publicKey,
                        saiMint: SAI_MINT,
                        userSaiAccount: userSaiAccount,
                        mintAuthority: mintAuthority,
                        tokenProgram: TOKEN_PROGRAM_ID,
                    })
                    .instruction()
            );
            
            // Get recent blockhash and set transaction properties
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.wallet.publicKey;
            
            console.log('Transaction prepared:', {
                instructions: transaction.instructions.length,
                recentBlockhash: blockhash
            });
            
            // Try to use window.solana directly for better Phantom compatibility
            if (window.solana && window.solana.isPhantom) {
                try {
                    console.log('Using direct Phantom API for minting');
                    const signature = await window.solana.signAndSendTransaction(transaction);
                    console.log('Transaction sent with signature:', signature);
                    
                    await this.connection.confirmTransaction({
                        blockhash,
                        lastValidBlockHeight,
                        signature: signature.signature
                    });
                    
                    console.log('Minting transaction confirmed');
                    return {
                        success: true,
                        signature: signature.signature
                    };
                } catch (phantomError) {
                    console.error('Error with Phantom API:', phantomError);
                    // If this is a user rejection, return immediately
                    if (phantomError.message && phantomError.message.includes('rejected')) {
                        return {
                            success: false,
                            error: 'User rejected the transaction'
                        };
                    }
                    // Otherwise, continue to fallback
                    throw phantomError;
                }
            }
            
            // Fallback to wallet adapter
            console.log('Using wallet adapter for transaction');
            const signature = await this.wallet.sendTransaction(transaction);
            console.log('Transaction sent with signature:', signature);
            await this.connection.confirmTransaction(signature, 'confirmed');
            
            console.log('Minting successful!');
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

    // Add this helper method for token account creation
    async createTokenAccount(tokenAccount) {
        try {
            console.log('Creating SAI token account directly...');
            
            // Create instruction to create associated token account
            const createAccountInstruction = createAssociatedTokenAccountInstruction(
                this.wallet.publicKey,  // payer
                tokenAccount,           // associated token account address
                this.wallet.publicKey,  // owner
                new PublicKey(this.saiMint) // mint
            );
            
            // Create and setup transaction
            const transaction = new Transaction().add(createAccountInstruction);
            
            // Get recent blockhash
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.wallet.publicKey;
            
            // Sign and send transaction
            console.log('Token account transaction ready, sending...');
            
            // Use the wallet's sendTransaction method which should be more reliable
            try {
                const signature = await this.wallet.sendTransaction(transaction, this.connection);
                console.log('Token account creation transaction sent:', signature);
                
                // Confirm transaction
                const confirmationResult = await this.connection.confirmTransaction({
                    blockhash,
                    lastValidBlockHeight,
                    signature
                });
                
                console.log('Token account created successfully:', confirmationResult);
                return true;
            } catch (error) {
                // If wallet adapter fails, try direct Phantom API
                if (window.solana && window.solana.isPhantom) {
                    try {
                        console.log('Falling back to direct Phantom API...');
                        const signature = await window.solana.signAndSendTransaction(transaction);
                        
                        await this.connection.confirmTransaction({
                            blockhash,
                            lastValidBlockHeight,
                            signature: signature.signature
                        });
                        
                        console.log('Token account created successfully with direct API');
                        return true;
                    } catch (phantomError) {
                        console.error('Direct API failed:', phantomError);
                        throw phantomError; // Re-throw for caller to handle
                    }
                } else {
                    throw error; // Re-throw for caller to handle
                }
            }
        } catch (error) {
            console.error('Error creating token account:', error);
            return false;
        }
    }
} 