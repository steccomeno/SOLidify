import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import { Sai } from '../target/types/sai';

async function main() {
    // Connect to local Solana cluster
    const connection = new anchor.web3.Connection('http://localhost:8899', 'confirmed');
    
    // Load the wallet from local-wallet.json
    const wallet = new anchor.Wallet(
        anchor.web3.Keypair.fromSecretKey(
            Buffer.from(JSON.parse(require('fs').readFileSync('local-wallet.json', 'utf-8')))
        )
    );

    // Create the provider
    const provider = new anchor.AnchorProvider(connection, wallet, {
        preflightCommitment: 'confirmed',
    });
    anchor.setProvider(provider);

    // Load the program
    const program = anchor.workspace.Sai as Program<Sai>;
    
    // Generate a new keypair for the CDP account
    const cdpKeypair = anchor.web3.Keypair.generate();
    
    // Create the PDA for mint authority
    const [mintAuthority, mintAuthorityBump] = await PublicKey.findProgramAddress(
        [Buffer.from("mint_authority")],
        program.programId
    );

    // Create token mint for SAI
    const saiMint = await spl.createMint(
        connection,
        wallet.payer,
        mintAuthority,
        null,
        9
    );

    // Create token account for the user's SAI
    const userSaiAccount = await spl.createAccount(
        connection,
        wallet.payer,
        saiMint,
        wallet.publicKey
    );

    // Create token mint for collateral (simulating SOL wrapped as token)
    const collateralMint = await spl.createMint(
        connection,
        wallet.payer,
        wallet.publicKey,
        null,
        9
    );

    // Create vault token account
    const vaultAccount = await spl.createAccount(
        connection,
        wallet.payer,
        collateralMint,
        program.programId
    );
    
    // Create user's collateral token account
    const userCollateralAccount = await spl.createAccount(
        connection,
        wallet.payer,
        collateralMint,
        wallet.publicKey
    );
    
    // Mint some collateral tokens to the user (1 SOL worth)
    await spl.mintTo(
        connection,
        wallet.payer,
        collateralMint,
        userCollateralAccount,
        wallet.payer,
        1_000_000_000 // 1 SOL in lamports
    );

    try {
        // Initialize CDP
        await program.methods
            .initializeCdp()
            .accounts({
                cdp: cdpKeypair.publicKey,
                owner: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .signers([cdpKeypair])
            .rpc();

        console.log("CDP initialized");

        // Initialize vault and mint SAI
        await program.methods
            .initializeVault(
                new anchor.BN(1_000_000_000), // 1 SOL collateral
                new anchor.BN(1_000_000_000)  // 1 SAI
            )
            .accounts({
                cdp: cdpKeypair.publicKey,
                owner: wallet.publicKey,
                vault: vaultAccount,
                ownerCollateral: userCollateralAccount,
                ownerSai: userSaiAccount,
                saiMint: saiMint,
                mintAuthority: mintAuthority,
                tokenProgram: spl.TOKEN_PROGRAM_ID,
            })
            .rpc();

        console.log("Vault initialized and SAI minted");
        
        // Get CDP data
        const cdpAccount = await program.account.cdp.fetch(cdpKeypair.publicKey);
        console.log("CDP Data:", {
            owner: cdpAccount.owner.toString(),
            collateralAmount: cdpAccount.collateralAmount.toString(),
            saiDebt: cdpAccount.saiDebt.toString(),
        });

    } catch (err) {
        console.error("Error:", err);
    }
}

main().then(
    () => process.exit(0),
    err => {
        console.error(err);
        process.exit(1);
    }
); 