import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Connection } from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import { Sai } from '../target/types/sai';
import { Keypair } from '@solana/web3.js';

async function main() {
    // Configure the client
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    const wallet = new anchor.Wallet(
        Keypair.fromSecretKey(
            Buffer.from(JSON.parse(require("fs").readFileSync("admin_keypair.json", "utf-8")))
        )
    );
    const provider = new anchor.AnchorProvider(connection, wallet, {
        preflightCommitment: "confirmed",
        commitment: "confirmed",
    });
    anchor.setProvider(provider);
    const program = anchor.workspace.Sai as Program<Sai>;

    try {
        // Create SAI mint
        const saiMintKeypair = anchor.web3.Keypair.generate();
        const saiMint = saiMintKeypair.publicKey;
        console.log("SAI mint created:", saiMint.toBase58());

        // Find PDA for mint authority
        const [mintAuthority] = await PublicKey.findProgramAddress(
          [Buffer.from("mint_authority")],
          program.programId
        );
        console.log("Mint authority PDA:", mintAuthority.toBase58(), "with bump:", mintAuthority.toString());

        // Create and initialize mint account
        const createMintTx = new anchor.web3.Transaction().add(
          anchor.web3.SystemProgram.createAccount({
            fromPubkey: wallet.publicKey,
            newAccountPubkey: saiMint,
            space: 82, // Size of a mint account
            lamports: await connection.getMinimumBalanceForRentExemption(82),
            programId: spl.TOKEN_PROGRAM_ID,
          }),
          spl.createInitializeMintInstruction(
            saiMint,
            6,
            mintAuthority,
            null
          )
        );

        // Sign and send the create mint transaction
        createMintTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        createMintTx.feePayer = wallet.publicKey;
        const signedCreateMintTx = await wallet.signTransaction(createMintTx);
        signedCreateMintTx.partialSign(saiMintKeypair);
        const createMintTxId = await connection.sendRawTransaction(signedCreateMintTx.serialize());
        await connection.confirmTransaction({
          signature: createMintTxId,
          blockhash: createMintTx.recentBlockhash,
          lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight,
        });

        // Find PDA for CDP
        const [cdpAddress, cdpBump] = await PublicKey.findProgramAddress(
            [Buffer.from("cdp"), wallet.publicKey.toBuffer()],
            program.programId
        );
        console.log("CDP address:", cdpAddress.toString(), "with bump:", cdpBump);

        // Initialize the program first
        const initTx = await program.methods
            .initialize(new anchor.BN(150)) // 150% collateral ratio
            .accounts({
                cdp: cdpAddress,
                saiMint: saiMint,
                mintAuthority: mintAuthority,
                payer: wallet.publicKey,
                systemProgram: SystemProgram.programId,
                tokenProgram: spl.TOKEN_PROGRAM_ID,
                rent: SYSVAR_RENT_PUBKEY,
            })
            .preInstructions([
                anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
                    units: 1000000
                })
            ])
            .transaction();

        const latestBlockhash = await connection.getLatestBlockhash();
        initTx.recentBlockhash = latestBlockhash.blockhash;
        initTx.feePayer = wallet.publicKey;
        
        // Sign with the wallet only
        const signedTx = await wallet.signTransaction(initTx);
        
        const txid = await connection.sendRawTransaction(signedTx.serialize());
        console.log("Program initialized with transaction:", txid);
        
        await connection.confirmTransaction({
            signature: txid,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        });

        // Create SAI token account for the user
        const userSaiAccount = await spl.createAccount(
            connection,
            wallet.payer,
            saiMint,
            wallet.publicKey
        );
        console.log("User SAI account created:", userSaiAccount.toString());

        // Create collateral mint (for testing)
        const collateralMint = await spl.createMint(
            connection,
            wallet.payer,
            wallet.publicKey,
            wallet.publicKey,
            9
        );
        console.log("Collateral mint created:", collateralMint.toString());

        // Create collateral token account for the user
        const userCollateralAccount = await spl.createAccount(
            connection,
            wallet.payer,
            collateralMint,
            wallet.publicKey
        );
        console.log("User collateral account created:", userCollateralAccount.toString());

        // Mint some collateral tokens to the user
        await spl.mintTo(
            connection,
            wallet.payer,
            collateralMint,
            userCollateralAccount,
            wallet.payer,
            1000000000 // 1 token with 9 decimals
        );
        console.log("Minted collateral tokens to user");

        // Find PDA for vault authority
        const [vaultAuthority, vaultAuthorityBump] = await PublicKey.findProgramAddress(
            [Buffer.from("vault_authority"), cdpAddress.toBuffer()],
            program.programId
        );

        // Create vault account
        const vault = await spl.createAccount(
            connection,
            wallet.payer,
            collateralMint,
            vaultAuthority,
            Keypair.generate() // Generate a new keypair for the vault
        );
        console.log("Vault account created:", vault.toString());

        // Initialize vault with collateral and mint SAI
        const initVaultTx = await program.methods
            .initializeVault(
                new anchor.BN(1000000000), // 1 token collateral
                new anchor.BN(1000000000)  // 1 SAI to mint
            )
            .accounts({
                owner: wallet.publicKey,
                cdp: cdpAddress,
                ownerCollateral: userCollateralAccount,
                collateralMint: collateralMint,
                vault: vault,
                vaultAuthority: vaultAuthority,
                saiMint: saiMint,
                ownerSai: userSaiAccount,
                mintAuthority: mintAuthority,
                tokenProgram: spl.TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                rent: SYSVAR_RENT_PUBKEY,
            })
            .preInstructions([
                anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
                    units: 1000000
                })
            ])
            .transaction();

        const latestBlockhash3 = await connection.getLatestBlockhash();
        initVaultTx.recentBlockhash = latestBlockhash3.blockhash;
        initVaultTx.feePayer = wallet.publicKey;
        
        const signedTx3 = await wallet.signTransaction(initVaultTx);
        const txId3 = await connection.sendRawTransaction(signedTx3.serialize());
        await connection.confirmTransaction({
            signature: txId3,
            blockhash: latestBlockhash3.blockhash,
            lastValidBlockHeight: latestBlockhash3.lastValidBlockHeight,
        });
        console.log("Vault initialized with transaction:", txId3);

    } catch (error) {
        console.error("Error:", error);
    }
}

main().then(
    () => process.exit(0),
).catch(error => {
    console.error(error);
    process.exit(1);
}); 