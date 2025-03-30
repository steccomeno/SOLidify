import { Program, AnchorProvider, setProvider } from '@project-serum/anchor';
import { PublicKey, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount, createTransferInstruction, createInitializeMintInstruction, MINT_SIZE, getMinimumBalanceForRentExemptMint } from '@solana/spl-token';
import BN from 'bn.js';
import saiIDL from '../idl/sai.json';
import tokenInfo from '../scripts/sai_token_info.json';
import { Keypair } from '@solana/web3.js';
import { 
    getActiveConnection, 
    refreshConnection,
    connection as baseConnection 
} from '../utils/walletUtils';

// Rate limiting and retry utilities
const RETRY_DELAY = 1000; // 1 second
const MAX_RETRIES = 3;
const BACKOFF_FACTOR = 1.5;

// Simple exponential backoff function
async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry function with exponential backoff
async function retryWithBackoff(fn, retriesLeft = MAX_RETRIES, delay = RETRY_DELAY) {
  try {
    return await fn();
  } catch (error) {
    // If error is rate limit (429), wait and retry
    if (error.message?.includes('429') || 
        error.message?.includes('rate limit') || 
        error.message?.includes('Connection rate limits exceeded')) {
      console.log(`Rate limit hit, retrying in ${delay}ms. Retries left: ${retriesLeft}`);
      
      if (retriesLeft === 0) {
        console.error('Max retries reached, giving up');
        throw error;
      }
      
      await wait(delay);
      return retryWithBackoff(fn, retriesLeft - 1, delay * BACKOFF_FACTOR);
    }
    
    // For other errors, just throw
    throw error;
  }
}

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

// Store the mint keypair in memory
let saiMintKeypair = null;

export async function initializeSAIMint(walletAdapter) {
    try {
        const connection = await getActiveConnection();
        
        // Generate mint keypair if not already created
        if (!saiMintKeypair) {
            saiMintKeypair = Keypair.generate();
            console.log('Generated new SAI mint keypair:', saiMintKeypair.publicKey.toBase58());
        }

        // Check if mint already exists
        const mintInfo = await connection.getAccountInfo(saiMintKeypair.publicKey);
        if (mintInfo) {
            console.log('SAI mint already exists:', saiMintKeypair.publicKey.toBase58());
            return saiMintKeypair.publicKey;
        }

        console.log('Creating new SAI mint account...');
        
        // Get minimum lamports for rent exemption
        const lamports = await getMinimumBalanceForRentExemptMint(connection);
        
        // Create transaction for mint account
        const transaction = new Transaction().add(
            SystemProgram.createAccount({
                fromPubkey: walletAdapter.publicKey,
                newAccountPubkey: saiMintKeypair.publicKey,
                space: MINT_SIZE,
                lamports,
                programId: TOKEN_PROGRAM_ID,
            }),
            createInitializeMintInstruction(
                saiMintKeypair.publicKey,
                9, // 9 decimals
                walletAdapter.publicKey,
                walletAdapter.publicKey,
                TOKEN_PROGRAM_ID
            )
        );

        // Get latest blockhash
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = walletAdapter.publicKey;

        // Sign with both wallet and mint keypair
        transaction.sign(saiMintKeypair);
        const signedTx = await walletAdapter.signTransaction(transaction);

        // Send and confirm transaction
        const signature = await connection.sendRawTransaction(signedTx.serialize());
        await connection.confirmTransaction(signature, 'confirmed');

        console.log('SAI mint initialized successfully:', saiMintKeypair.publicKey.toBase58());
        console.log('Transaction signature:', signature);

        return saiMintKeypair.publicKey;
    } catch (error) {
        console.error('Failed to initialize SAI mint:', error);
        throw error;
    }
}

export async function findOrCreateAssociatedTokenAccount(mintPubKey, ownerPubKey) {
    try {
        const connection = await getActiveConnection();

        // If this is the SAI mint and it doesn't exist yet, initialize it
        if (mintPubKey.equals(saiMintKeypair?.publicKey)) {
            await initializeSAIMint(walletAdapter);
        }

        // Get the associated token address
        const associatedTokenAddress = await getAssociatedTokenAddress(
            mintPubKey,
            ownerPubKey,
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );

        // Check if account exists
        const tokenAccount = await connection.getAccountInfo(associatedTokenAddress);
        if (tokenAccount) {
            console.log('Token account exists:', associatedTokenAddress.toBase58());
            return associatedTokenAddress;
        }

        console.log('Creating associated token account...');
        
        // Create the account
        const transaction = new Transaction().add(
            createAssociatedTokenAccountInstruction(
                ownerPubKey,
                associatedTokenAddress,
                ownerPubKey,
                mintPubKey,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            )
        );

        // Get latest blockhash
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = ownerPubKey;

        // Sign and send transaction
        const signedTx = await walletAdapter.signTransaction(transaction);
        const signature = await connection.sendRawTransaction(signedTx.serialize());
        await connection.confirmTransaction(signature, 'confirmed');

        console.log('Associated token account created:', associatedTokenAddress.toBase58());
        console.log('Transaction signature:', signature);

        return associatedTokenAddress;
    } catch (error) {
        console.error('Failed to find or create associated token account:', error);
        throw error;
    }
}

export class SolanaAPI {
    constructor(wallet, programId = PROGRAM_ID) {
        if (!wallet || !wallet.publicKey) {
            throw new Error('Wallet adapter with public key is required');
        }

        this.wallet = wallet;
        this.programId = programId instanceof PublicKey ? programId : new PublicKey(programId);
        this.connection = null;
        this.provider = null;
        this.program = null;
        this.initialized = false;
        
        // Load token addresses from token info
        this.saiMint = tokenInfo.saiMint;
        this.sldMint = tokenInfo.sldMint;
        this.admin = tokenInfo.admin;
        
        console.log('SolanaAPI constructed with:', {
            programId: this.programId.toString(),
            walletPublicKey: this.wallet.publicKey.toString(),
            saiMint: this.saiMint,
            sldMint: this.sldMint,
            admin: this.admin
        });
    }

    // Add a method to initialize or refresh the connection
    async ensureConnection() {
        try {
            // Get the current connection or create a new one
            if (!this.connection) {
                console.log('No connection exists, creating new connection');
                this.connection = await getActiveConnection();
            } else {
                // Test if the existing connection is still working
                try {
                    const start = Date.now();
                    await this.connection.getVersion();
                    const latency = Date.now() - start;
                    
                    // If latency is too high, refresh the connection
                    if (latency > 5000) {
                        console.log('Connection latency too high, refreshing connection');
                        this.connection = await refreshConnection();
                    } else {
                        console.log('Existing connection is working with acceptable latency');
                    }
                } catch (testError) {
                    console.error('Existing connection failed test, refreshing:', testError.message);
                    this.connection = await refreshConnection();
                }
            }
            
            if (!this.connection) {
                throw new Error('Failed to get active connection');
            }
            
            return this.connection;
        } catch (error) {
            console.error('Error ensuring connection:', error);
            throw error;
        }
    }

    // Add method to handle rate limit by refreshing connection and retrying
    async handlePossibleRateLimit(operation, params = [], maxRetries = 2) {
        let retries = 0;
        
        while (retries <= maxRetries) {
            try {
                // Ensure we have a connection before trying the operation
                await this.ensureConnection();
                
                // Try the operation
                return await operation(...params);
            } catch (error) {
                const isRateLimit = error.message?.includes('429') || 
                                  error.message?.includes('rate limit') || 
                                  error.message?.includes('Connection rate limits exceeded');
                
                if (isRateLimit && retries < maxRetries) {
                    console.log(`Rate limit detected (retry ${retries + 1}/${maxRetries}), refreshing connection...`);
                    await refreshConnection();
                    this.connection = await getActiveConnection();
                    retries++;
                    
                    // Add delay before retry
                    await wait(1000 * (retries + 1));
                } else {
                    // Not a rate limit or out of retries
                    throw error;
                }
            }
        }
    }

    // Update the initialize method with better error diagnostics
    async initialize() {
        try {
            if (!this.wallet || !this.wallet.publicKey) {
                throw new Error('Wallet not connected or missing public key');
            }

            console.log('Initializing SolanaAPI with wallet:', {
                publicKey: this.wallet.publicKey.toString(),
                hasSignTransaction: typeof this.wallet.signTransaction === 'function',
                hasSignAllTransactions: typeof this.wallet.signAllTransactions === 'function',
                hasSendTransaction: typeof this.wallet.sendTransaction === 'function'
            });

            console.log('Ensuring connection is available...');
            await this.ensureConnection();
            
            console.log('Creating AnchorProvider with wallet:', this.wallet.publicKey.toString());
            this.provider = new AnchorProvider(
                this.connection,
                this.wallet,
                { 
                    commitment: 'confirmed',
                    preflightCommitment: 'confirmed',
                    skipPreflight: false
                }
            );
            console.log('AnchorProvider created successfully');

            // Set the provider globally
            setProvider(this.provider);
            console.log('Provider set globally');

            // Create the program instance
            console.log('Creating program instance with IDL...');
            this.program = new Program(saiIDL, this.programId, this.provider);
            
            if (!this.program) {
                throw new Error('Failed to create program instance');
            }
            
            console.log('Program instance created successfully:', {
                programId: this.program.programId.toString(),
                provider: this.program.provider.wallet.publicKey.toString()
            });

            this.initialized = true;
            console.log('SolanaAPI initialization complete');
            
            return true;
        } catch (error) {
            console.error('Error in SolanaAPI initialize:', error);
            this.initialized = false;
            throw error;
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
            
            // Setup transaction with retry for blockhash
            const { blockhash, lastValidBlockHeight } = await retryWithBackoff(async () => {
                return await this.connection.getLatestBlockhash();
            });
            
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.wallet.publicKey;
            
            // Add the CDP keypair as a signer
            transaction.partialSign(cdpKeypair);
            
            // Sign with wallet and send
            console.log('Transaction prepared, sending...');
            
            try {
                // Add delay to avoid rate limits
                await wait(500);
                
                const signature = await this.wallet.sendTransaction(transaction, this.connection);
                console.log('Transaction sent with signature:', signature);
                
                // Confirm transaction with retry
                const confirmation = await retryWithBackoff(async () => {
                    return await this.connection.confirmTransaction({
                        blockhash,
                        lastValidBlockHeight,
                        signature
                    });
                });
                
                console.log('CDP created successfully!', confirmation);
                
                return {
                    success: true,
                    signature,
                    cdp: cdp.toString()
                };
            } catch (error) {
                console.error('Transaction error:', error);
                
                // Check for rate limiting
                if (error.message?.includes('429') || 
                    error.message?.includes('rate limit') || 
                    error.message?.includes('Connection rate limits exceeded')) {
                    return {
                        success: false,
                        error: 'Solana RPC rate limit exceeded. Please try again in a moment.'
                    };
                }
                
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
            // Check if program was properly initialized
            if (!this.program) {
                console.log('Program not initialized, cannot fetch CDP info');
                return {
                    success: false,
                    error: 'Program not initialized, try reconnecting your wallet'
                };
            }

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
            if (!this.initialized || !this.program) {
                throw new Error('Program not initialized. Please initialize first.');
            }

            console.log('Fetching CDPs for user:', this.wallet.publicKey.toString());

            // Fetch all CDPs owned by the user
            const cdps = await this.program.account.cdp.all([
                {
                    memcmp: {
                        offset: 8, // Skip discriminator
                        bytes: this.wallet.publicKey.toBase58()
                    }
                }
            ]);

            console.log('Found CDPs:', cdps);

            return {
                success: true,
                data: cdps.map(cdp => ({
                    address: cdp.publicKey.toString(),
                    owner: cdp.account.owner.toString(),
                    collateralAmount: cdp.account.collateralAmount.toString(),
                    saiAmount: cdp.account.saiAmount.toString()
                }))
            };
        } catch (error) {
            console.error('Error fetching user CDPs:', error);
            return {
                success: false,
                error: error.message || 'Failed to fetch CDPs'
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
            await this.ensureConnection();
            
            const solBalance = await this.connection.getBalance(this.wallet.publicKey);
            
            // Get SAI token balance
            let saiBalance = 0;
            try {
                const saiTokenAccount = await this.findOrCreateAssociatedTokenAccount(this.saiMint);
                if (saiTokenAccount) {
                    const accountInfo = await this.connection.getTokenAccountBalance(saiTokenAccount);
                    saiBalance = accountInfo.value.uiAmount || 0;
                }
            } catch (error) {
                console.error('Error getting SAI balance:', error);
            }
            
            return {
                success: true,
                data: {
                    sol: solBalance / LAMPORTS_PER_SOL,
                    sai: saiBalance,
                    sld: 0 // Default to 0 for now
                }
            };
        } catch (error) {
            console.error('Error fetching token balances:', error);
            return {
                success: false,
                error: error.message,
                data: {
                    sol: 0,
                    sai: 0,
                    sld: 0
                }
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
            
            // Get recent blockhash with retry
            const { blockhash, lastValidBlockHeight } = await retryWithBackoff(async () => {
                return await this.connection.getLatestBlockhash();
            });
            
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = this.wallet.publicKey;
            
            // Sign and send transaction
            console.log('Token account transaction ready, sending...');
            
            // Use the wallet's sendTransaction method which should be more reliable
            try {
                const signature = await this.wallet.sendTransaction(transaction, this.connection);
                console.log('Token account creation transaction sent:', signature);
                
                // Confirm transaction with retry
                const confirmationResult = await retryWithBackoff(async () => {
                    return await this.connection.confirmTransaction({
                        blockhash,
                        lastValidBlockHeight,
                        signature
                    });
                });
                
                console.log('Token account created successfully:', confirmationResult);
                return true;
            } catch (error) {
                // If wallet adapter fails, try direct Phantom API
                if (window.solana && window.solana.isPhantom) {
                    try {
                        console.log('Falling back to direct Phantom API...');
                        const signature = await window.solana.signAndSendTransaction(transaction);
                        
                        // Confirm with retry
                        await retryWithBackoff(async () => {
                            return await this.connection.confirmTransaction({
                                blockhash,
                                lastValidBlockHeight,
                                signature: signature.signature
                            });
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

    // Add findOrCreateAssociatedTokenAccount method
    async findOrCreateAssociatedTokenAccount(mint) {
        try {
            await this.ensureConnection();

            // Ensure mint is a PublicKey instance
            const mintPubKey = mint instanceof PublicKey ? mint : new PublicKey(mint);
            
            // If this is the SAI mint and it doesn't exist, initialize it
            if (mintPubKey.equals(SAI_MINT)) {
                try {
                    const newMintPubKey = await this.initializeSAIMint();
                    // Update the SAI_MINT reference
                    SAI_MINT = newMintPubKey;
                    this.saiMint = newMintPubKey.toString();
                } catch (error) {
                    console.error('Failed to initialize SAI mint:', error);
                    throw error;
                }
            }

            // Ensure owner is a PublicKey instance
            const ownerPubKey = this.wallet.publicKey instanceof PublicKey ? 
                this.wallet.publicKey : 
                new PublicKey(this.wallet.publicKey);

            // Get associated token address
            const associatedTokenAddress = await getAssociatedTokenAddress(
                SAI_MINT,
                ownerPubKey,
                false,
                TOKEN_PROGRAM_ID
            );
            
            console.log(`Token account address for ${SAI_MINT.toString()}: ${associatedTokenAddress.toString()}`);
            
            // Check if the account exists
            try {
                const accountInfo = await this.connection.getAccountInfo(associatedTokenAddress);
                
                if (accountInfo) {
                    console.log('Token account exists');
                    return associatedTokenAddress;
                }
            } catch (error) {
                console.log('Error checking account info:', error);
            }
            
            console.log('Token account does not exist, creating it');
            
            // Create the associated token account
            try {
                const transaction = new Transaction().add(
                    createAssociatedTokenAccountInstruction(
                        ownerPubKey, // payer
                        associatedTokenAddress, // associated token account
                        ownerPubKey, // owner
                        SAI_MINT // mint
                    )
                );
                
                // Get recent blockhash
                const { blockhash } = await this.connection.getLatestBlockhash('finalized');
                transaction.recentBlockhash = blockhash;
                transaction.feePayer = ownerPubKey;
                
                // Sign and send transaction
                const signature = await this.wallet.sendTransaction(transaction, this.connection);
                
                // Wait for confirmation
                const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
                if (confirmation.value.err) {
                    throw new Error(`Failed to create token account: ${confirmation.value.err}`);
                }
                
                console.log(`Created token account: ${associatedTokenAddress.toString()}`);
                return associatedTokenAddress;
            } catch (error) {
                console.error('Error creating token account:', error);
                throw error;
            }
        } catch (error) {
            console.error('Error in findOrCreateAssociatedTokenAccount:', error);
            throw error;
        }
    }
} 