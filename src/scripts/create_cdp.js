const { Connection, PublicKey, Keypair, sendAndConfirmTransaction, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY, clusterApiUrl } = require('@solana/web3.js');
const { Program, AnchorProvider, web3, BN } = require('@project-serum/anchor');
const { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createMint, mintTo } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

// Load IDLs
const saiIdl = require('../idl/sai.json');

// Program IDs
const SAI_PROGRAM_ID = new PublicKey("GCbezKCTeHfYc6Z92sQ9ECW29XWDyo6WWmB1Dx74tisB");

async function main() {
    console.log("Starting CDP creation test...");

    // Connection setup
    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
    
    // Load admin keypair
    const adminKeypairData = JSON.parse(fs.readFileSync(path.join(__dirname, 'admin_keypair.json')));
    const adminKeypair = Keypair.fromSecretKey(new Uint8Array(adminKeypairData));
    console.log(`Admin public key: ${adminKeypair.publicKey.toString()}`);
    
    // Load token info
    const saiTokenInfo = JSON.parse(fs.readFileSync(path.join(__dirname, 'sai_token_info.json')));
    const saiMint = new PublicKey(saiTokenInfo.saiMint);
    console.log(`SAI mint: ${saiMint.toString()}`);
    
    // Create the provider
    const provider = new AnchorProvider(
        connection,
        { 
            publicKey: adminKeypair.publicKey, 
            signTransaction: async (tx) => {
                tx.partialSign(adminKeypair);
                return tx;
            },
            signAllTransactions: async (txs) => {
                return txs.map(tx => {
                    tx.partialSign(adminKeypair);
                    return tx;
                });
            }
        },
        { preflightCommitment: 'confirmed' }
    );
    
    // Initialize SAI program
    const saiProgram = new Program(saiIdl, SAI_PROGRAM_ID, provider);
    
    // Find PDAs
    const [vaultAuthority, vaultAuthorityBump] = await PublicKey.findProgramAddressSync(
        [Buffer.from("vault_authority")],
        SAI_PROGRAM_ID
    );
    
    const [mintAuthority, mintAuthorityBump] = await PublicKey.findProgramAddressSync(
        [Buffer.from("mint_authority")],
        SAI_PROGRAM_ID
    );
    
    console.log(`Vault authority PDA: ${vaultAuthority.toString()}`);
    console.log(`Mint authority PDA: ${mintAuthority.toString()}`);
    
    // Create a mock SOL token for testing (in production, we'd use wrapped SOL)
    console.log("Creating a mock SOL token for collateral...");
    const mockSolMint = await createMint(
        connection,
        adminKeypair,
        adminKeypair.publicKey,
        null,
        9 // 9 decimals like SOL
    );
    
    console.log(`Mock SOL token created: ${mockSolMint.toString()}`);
    
    // Create admin's token accounts
    console.log("Creating token accounts...");
    const adminCollateralAccount = await getAssociatedTokenAddress(
        mockSolMint,
        adminKeypair.publicKey
    );
    
    // Create the token account
    const createCollateralAtaTx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
            adminKeypair.publicKey,
            adminCollateralAccount,
            adminKeypair.publicKey,
            mockSolMint
        )
    );
    
    await sendAndConfirmTransaction(connection, createCollateralAtaTx, [adminKeypair]);
    console.log(`Admin's collateral token account created: ${adminCollateralAccount.toString()}`);
    
    // Mint some mock SOL to admin
    await mintTo(
        connection, 
        adminKeypair, 
        mockSolMint, 
        adminCollateralAccount, 
        adminKeypair.publicKey,
        10 * 1_000_000_000 // 10 SOL with 9 decimals
    );
    console.log(`Minted 10 mock SOL to admin!`);
    
    // Get or create admin's SAI token account
    const adminSaiAccount = await getAssociatedTokenAddress(
        saiMint,
        adminKeypair.publicKey
    );
    
    try {
        // Check if the account exists
        const accountInfo = await connection.getAccountInfo(adminSaiAccount);
        if (!accountInfo) {
            // Create the token account
            const createSaiAtaTx = new Transaction().add(
                createAssociatedTokenAccountInstruction(
                    adminKeypair.publicKey,
                    adminSaiAccount,
                    adminKeypair.publicKey,
                    saiMint
                )
            );
            
            await sendAndConfirmTransaction(connection, createSaiAtaTx, [adminKeypair]);
            console.log(`Admin's SAI token account created: ${adminSaiAccount.toString()}`);
        } else {
            console.log(`Admin's SAI token account already exists: ${adminSaiAccount.toString()}`);
        }
    } catch (error) {
        console.error("Error checking SAI token account:", error);
        return;
    }
    
    // Create a CDP
    console.log("Creating a new CDP...");
    try {
        // Generate a keypair for the CDP
        const cdpKeypair = Keypair.generate();
        console.log(`CDP keypair: ${cdpKeypair.publicKey.toString()}`);
        
        // Find the vault PDA
        const [vault] = await PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), cdpKeypair.publicKey.toBuffer()],
            SAI_PROGRAM_ID
        );
        
        console.log(`Vault PDA: ${vault.toString()}`);
        
        // Create a new CDP
        const collateralAmount = new BN(2 * 1_000_000_000); // 2 SOL
        const saiAmount = new BN(100 * 1_000_000); // 100 SAI
        
        const createCdpTx = await saiProgram.methods
            .initializeCdp(collateralAmount, saiAmount)
            .accounts({
                owner: adminKeypair.publicKey,
                cdp: cdpKeypair.publicKey,
                ownerCollateral: adminCollateralAccount,
                collateralMint: mockSolMint,
                vault: vault,
                vaultAuthority: vaultAuthority,
                saiMint: saiMint,
                ownerSai: adminSaiAccount,
                mintAuthority: mintAuthority,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                rent: SYSVAR_RENT_PUBKEY,
            })
            .signers([adminKeypair, cdpKeypair])
            .rpc();
        
        console.log(`CDP created! Transaction signature: ${createCdpTx}`);
        console.log(`Collateral deposited: 2 SOL`);
        console.log(`SAI minted: 100 SAI`);
        
        // Draw more SAI
        console.log("Drawing more SAI...");
        const drawSaiAmount = new BN(50 * 1_000_000); // 50 more SAI
        
        const drawSaiTx = await saiProgram.methods
            .drawSai(drawSaiAmount)
            .accounts({
                owner: adminKeypair.publicKey,
                cdp: cdpKeypair.publicKey,
                vault: vault,
                saiMint: saiMint,
                ownerSai: adminSaiAccount,
                mintAuthority: mintAuthority,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([adminKeypair])
            .rpc();
        
        console.log(`Drew more SAI! Transaction signature: ${drawSaiTx}`);
        console.log(`Additional SAI minted: 50 SAI`);
        console.log(`Total SAI debt: 150 SAI`);
        
        // Save CDP info for future reference
        const cdpInfo = {
            cdp: cdpKeypair.publicKey.toString(),
            vault: vault.toString(),
            collateralMint: mockSolMint.toString(),
            collateralAmount: "2 SOL",
            saiDebt: "150 SAI",
        };
        
        fs.writeFileSync(
            path.join(__dirname, 'cdp_info.json'),
            JSON.stringify(cdpInfo, null, 2)
        );
        
        // Store the CDP keypair for testing purposes (not secure for production)
        fs.writeFileSync(
            path.join(__dirname, 'cdp_keypair.json'),
            JSON.stringify(Array.from(cdpKeypair.secretKey))
        );
        
    } catch (error) {
        console.error("Failed to create CDP:", error);
        return;
    }
    
    console.log("CDP creation test completed successfully!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 