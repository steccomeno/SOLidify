const { Connection, PublicKey, Keypair, sendAndConfirmTransaction, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY, clusterApiUrl } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createMint, mintTo } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("Starting simple SAI minting...");

    // Connection setup
    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
    console.log("Connected to devnet");
    
    // Load user keypair
    const userKeypairData = JSON.parse(fs.readFileSync(path.join(__dirname, '../../wallet_d.json')));
    const userKeypair = Keypair.fromSecretKey(new Uint8Array(userKeypairData));
    console.log(`User public key: ${userKeypair.publicKey.toString()}`);
    
    // Check wallet balance
    const balance = await connection.getBalance(userKeypair.publicKey);
    console.log(`Wallet SOL balance: ${balance / 1_000_000_000} SOL`);
    
    if (balance < 1_000_000_000 / 10) {
        console.error("Insufficient SOL balance. Please fund this address with at least 0.1 SOL");
        return;
    }
    
    // Create new SAI token mint
    console.log("Creating new SAI token mint...");
    const saiMintKeypair = Keypair.generate();
    const saiMint = await createMint(
        connection,
        userKeypair,
        userKeypair.publicKey,  // Mint authority
        userKeypair.publicKey,  // Freeze authority (null for none)
        6 // 6 decimals
    );
    console.log(`New SAI token mint created: ${saiMint.toString()}`);
    
    // Create token account for user
    console.log("Creating SAI token account for user...");
    const userSaiAccount = await getAssociatedTokenAddress(
        saiMint,
        userKeypair.publicKey
    );
    
    const createTokenAccountTx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
            userKeypair.publicKey,
            userSaiAccount,
            userKeypair.publicKey,
            saiMint
        )
    );
    
    await sendAndConfirmTransaction(connection, createTokenAccountTx, [userKeypair]);
    console.log(`SAI token account created: ${userSaiAccount.toString()}`);
    
    // Mint SAI tokens to user
    console.log("Minting SAI tokens to user...");
    const mintAmount = 1000 * 1_000_000; // 1,000 SAI with 6 decimals
    
    await mintTo(
        connection,
        userKeypair,
        saiMint,
        userSaiAccount,
        userKeypair.publicKey,
        mintAmount
    );
    
    console.log(`Successfully minted ${mintAmount / 1_000_000} SAI tokens to ${userKeypair.publicKey.toString()}`);
    
    // Save token info
    const tokenInfo = {
        saiMint: saiMint.toString(),
        userSaiAccount: userSaiAccount.toString(),
        userWallet: userKeypair.publicKey.toString(),
        amount: `${mintAmount / 1_000_000} SAI`
    };
    
    fs.writeFileSync(
        path.join(__dirname, 'user_sai_token_info.json'),
        JSON.stringify(tokenInfo, null, 2)
    );
    
    console.log("Token information saved to user_sai_token_info.json");
    console.log("\nTo view your tokens:");
    console.log(`1. Open https://explorer.solana.com/address/${userSaiAccount.toString()}?cluster=devnet`);
    console.log("2. Or check your wallet after adding the custom SPL token with mint address:");
    console.log(`   ${saiMint.toString()}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Error:", error);
        if (error.logs) {
            console.error("Program logs:", error.logs);
        }
        process.exit(1);
    }); 