const { Connection, PublicKey, Keypair, sendAndConfirmTransaction, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY, clusterApiUrl } = require('@solana/web3.js');
const { Program, AnchorProvider, web3, BN } = require('@project-serum/anchor');
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createMint } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

// Load IDLs
const saiIdl = require('../idl/sai.json');
const sldIdl = require('../idl/sld.json');

// Program IDs
const SAI_PROGRAM_ID = new PublicKey("HftHVr8ftn9mHsY8JuoKxYAoXDyu58Vkfr8hzxbXWXqf");
const SLD_PROGRAM_ID = new PublicKey("VrzGbEB4PBEM5g1RrJn7A82gGbwPYtc9TvZjqY3NUzM");

async function main() {
    console.log("Starting initialization...");

    // Connection setup
    const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
    
    // Load or create admin keypair
    let adminKeypair;
    const keypairPath = path.join(__dirname, '../../admin_keypair.json');
    
    if (fs.existsSync(keypairPath)) {
        try {
            const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
            adminKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
            console.log(`Using existing admin keypair: ${adminKeypair.publicKey.toString()}`);
        } catch (error) {
            console.error("Error loading keypair:", error);
            return;
        }
    } else {
        // Generate a new keypair for the admin
        adminKeypair = Keypair.generate();
        console.log(`Generated new admin keypair: ${adminKeypair.publicKey.toString()}`);
        
        // Save the keypair for future use
        fs.writeFileSync(
            keypairPath,
            JSON.stringify(Array.from(adminKeypair.secretKey))
        );
    }
    
    // Check if admin has SOL
    const balance = await connection.getBalance(adminKeypair.publicKey);
    console.log(`Admin SOL balance: ${balance / web3.LAMPORTS_PER_SOL} SOL`);
    
    if (balance < web3.LAMPORTS_PER_SOL / 100) {
        console.error("Insufficient SOL balance. Please fund this address with at least 0.01 SOL:");
        console.error(adminKeypair.publicKey.toString());
        console.error("Then run this script again.");
        return;
    } else if (balance < web3.LAMPORTS_PER_SOL / 2) {
        console.warn("WARNING: Low SOL balance. Some transactions may fail.");
        console.warn("Recommended to fund this address with at least 0.5 SOL for reliable operation.");
        console.warn(adminKeypair.publicKey.toString());
    }
    
    // Create the provider
    const provider = new AnchorProvider(
        connection,
        { 
            publicKey: adminKeypair.publicKey, 
            signTransaction: async (tx) => {
                tx.sign(adminKeypair);
                return tx;
            },
            signAllTransactions: async (txs) => {
                return txs.map(tx => {
                    tx.sign(adminKeypair);
                    return tx;
                });
            }
        },
        { preflightCommitment: 'confirmed' }
    );
    
    // Initialize programs
    const saiProgram = new Program(saiIdl, SAI_PROGRAM_ID, provider);
    const sldProgram = new Program(sldIdl, SLD_PROGRAM_ID, provider);
    
    // Find PDAs
    const [mintAuthority, mintAuthorityBump] = await PublicKey.findProgramAddressSync(
        [Buffer.from("mint_authority")],
        SAI_PROGRAM_ID
    );
    
    const [governance, governanceBump] = await PublicKey.findProgramAddressSync(
        [Buffer.from("governance")],
        SLD_PROGRAM_ID
    );
    
    console.log(`Mint authority PDA: ${mintAuthority.toString()}`);
    console.log(`Governance PDA: ${governance.toString()}`);
    
    // Initialize SLD token mint and governance
    console.log("Initializing SLD token mint and governance...");
    try {
        // Generate a keypair for the SLD mint
        const sldMintKeypair = Keypair.generate();
        console.log(`SLD mint public key: ${sldMintKeypair.publicKey.toString()}`);
        
        // Create the mint account first
        const createMintTx = new Transaction().add(
            SystemProgram.createAccount({
                fromPubkey: adminKeypair.publicKey,
                newAccountPubkey: sldMintKeypair.publicKey,
                space: 82,
                lamports: await connection.getMinimumBalanceForRentExemption(82),
                programId: TOKEN_PROGRAM_ID,
            })
        );
        
        await sendAndConfirmTransaction(connection, createMintTx, [adminKeypair, sldMintKeypair]);
        console.log("Created mint account");
        
        // Setup governance and SLD mint
        const initGovTx = await sldProgram.methods
            .initializeGovernance(
                new BN(1000 * 1_000_000), // 1000 SLD min vote threshold
                new BN(7 * 24 * 60 * 60)  // 7 days voting period
            )
            .accounts({
                admin: adminKeypair.publicKey,
                governance: governance,
                sldMint: sldMintKeypair.publicKey,
                mintAuthority: mintAuthority,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                rent: SYSVAR_RENT_PUBKEY,
            })
            .signers([adminKeypair])
            .rpc();
        
        console.log(`SLD mint and governance initialized! Transaction signature: ${initGovTx}`);
        
        // Create admin's SLD token account
        const adminSldAta = await getAssociatedTokenAddress(
            sldMintKeypair.publicKey,
            adminKeypair.publicKey
        );
        
        // Create the token account
        const createAtaTx = new Transaction().add(
            createAssociatedTokenAccountInstruction(
                adminKeypair.publicKey,
                adminSldAta,
                adminKeypair.publicKey,
                sldMintKeypair.publicKey
            )
        );
        
        await sendAndConfirmTransaction(connection, createAtaTx, [adminKeypair]);
        console.log(`Admin's SLD token account created: ${adminSldAta.toString()}`);
        
        // Mint initial SLD tokens to admin
        const mintSldTx = await sldProgram.methods
            .mintSld(new BN(1000000 * 1_000_000)) // 1 million SLD with 6 decimals
            .accounts({
                admin: adminKeypair.publicKey,
                governance: governance,
                sldMint: sldMintKeypair.publicKey,
                adminSld: adminSldAta,
                mintAuthority: mintAuthority,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([adminKeypair])
            .rpc();
        
        console.log(`Minted 1,000,000 SLD to admin! Transaction signature: ${mintSldTx}`);
        
        // Save SLD token info for future reference
        const sldTokenInfo = {
            sldMint: sldMintKeypair.publicKey.toString(),
            governance: governance.toString(),
            admin: adminKeypair.publicKey.toString(),
        };
        
        fs.writeFileSync(
            path.join(__dirname, 'sld_token_info.json'),
            JSON.stringify(sldTokenInfo, null, 2)
        );
        
    } catch (error) {
        console.error("Failed to initialize SLD:", error);
        return;
    }
    
    // Initialize SAI token mint
    console.log("Initializing SAI token mint...");
    try {
        // Generate a keypair for the SAI mint
        const saiMintKeypair = Keypair.generate();
        console.log(`SAI mint public key: ${saiMintKeypair.publicKey.toString()}`);
        
        // Initialize SAI mint
        const initSaiTx = await saiProgram.methods
            .initializeSaiMint()
            .accounts({
                admin: adminKeypair.publicKey,
                saiMint: saiMintKeypair.publicKey,
                mintAuthority: mintAuthority,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                rent: SYSVAR_RENT_PUBKEY,
            })
            .signers([adminKeypair, saiMintKeypair])
            .rpc();
        
        console.log(`SAI mint initialized! Transaction signature: ${initSaiTx}`);
        
        // Create admin's SAI token account
        const adminSaiAta = await getAssociatedTokenAddress(
            saiMintKeypair.publicKey,
            adminKeypair.publicKey
        );
        
        // Create the token account
        const createAtaTx = new Transaction().add(
            createAssociatedTokenAccountInstruction(
                adminKeypair.publicKey,
                adminSaiAta,
                adminKeypair.publicKey,
                saiMintKeypair.publicKey
            )
        );
        
        await sendAndConfirmTransaction(connection, createAtaTx, [adminKeypair]);
        console.log(`Admin's SAI token account created: ${adminSaiAta.toString()}`);
        
        // Save SAI token info for future reference
        const saiTokenInfo = {
            saiMint: saiMintKeypair.publicKey.toString(),
            admin: adminKeypair.publicKey.toString(),
        };
        
        fs.writeFileSync(
            path.join(__dirname, 'sai_token_info.json'),
            JSON.stringify(saiTokenInfo, null, 2)
        );
        
    } catch (error) {
        console.error("Failed to initialize SAI:", error);
        return;
    }
    
    console.log("Initialization complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 