const { Keypair } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');
const bs58 = require('bs58');

async function main() {
    console.log("Generating a test wallet...");
    
    // Generate a new keypair for testing
    const testKeypair = Keypair.generate();
    console.log(`Public Key (address): ${testKeypair.publicKey.toString()}`);
    
    console.log("\n=== IMPORTANT ===");
    console.log("Fund this address with SOL from a working faucet or from another wallet.");
    console.log("After funding, continue with the initialization script using this wallet.");
    
    // Save the keypair for use with our scripts
    const keyPairFile = path.resolve(__dirname, '../../admin_keypair.json');
    fs.writeFileSync(
        keyPairFile,
        JSON.stringify(Array.from(testKeypair.secretKey))
    );
    console.log("\nSaved keypair to admin_keypair.json for use with our scripts.");
    
    // Convert private key to base58 for Phantom wallet import
    // Use a different approach with bs58
    const privateKeyBase58 = Buffer.from(testKeypair.secretKey).toString('hex');
    
    // Save the private key to a file
    const privateKeyFile = path.resolve(__dirname, '../../phantom_private_key.txt');
    fs.writeFileSync(privateKeyFile, privateKeyBase58);
    
    console.log("\n=== FOR PHANTOM WALLET ===");
    console.log(`Your private key (hex format): ${privateKeyBase58}`);
    console.log("This key has been saved to phantom_private_key.txt");
    console.log("To import into Phantom:");
    console.log("1. Open Phantom wallet");
    console.log("2. Click the hamburger menu and select 'Add/Connect Wallet'");
    console.log("3. Choose 'Import Private Key'");
    console.log("4. Paste the private key above");
}

main().catch(err => {
    console.error(err);
    process.exit(1);
}); 