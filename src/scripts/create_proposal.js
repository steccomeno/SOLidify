const { Connection, PublicKey, Keypair, sendAndConfirmTransaction, Transaction, SystemProgram, clusterApiUrl } = require('@solana/web3.js');
const { Program, AnchorProvider, web3, BN } = require('@project-serum/anchor');
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

// Load IDLs
const sldIdl = require('../idl/sld.json');

// Program IDs
const SLD_PROGRAM_ID = new PublicKey("SLDGkQDvmaXaDYpXTAXxxSQkgRdotTwNNWuZ9AHgK9w");

async function main() {
    console.log("Starting governance proposal creation...");

    // Connection setup
    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
    
    // Load admin keypair
    const adminKeypairData = JSON.parse(fs.readFileSync(path.join(__dirname, 'admin_keypair.json')));
    const adminKeypair = Keypair.fromSecretKey(new Uint8Array(adminKeypairData));
    console.log(`Admin public key: ${adminKeypair.publicKey.toString()}`);
    
    // Load token info
    const sldTokenInfo = JSON.parse(fs.readFileSync(path.join(__dirname, 'sld_token_info.json')));
    const sldMint = new PublicKey(sldTokenInfo.sldMint);
    console.log(`SLD mint: ${sldMint.toString()}`);
    
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
    
    // Initialize SLD program
    const sldProgram = new Program(sldIdl, SLD_PROGRAM_ID, provider);
    
    // Find PDAs
    const [governance, governanceBump] = await PublicKey.findProgramAddressSync(
        [Buffer.from("governance")],
        SLD_PROGRAM_ID
    );
    
    console.log(`Governance PDA: ${governance.toString()}`);
    
    // Get admin's SLD token account
    const adminSldAccount = await getAssociatedTokenAddress(
        sldMint,
        adminKeypair.publicKey
    );
    
    console.log(`Admin's SLD token account: ${adminSldAccount.toString()}`);
    
    // Create a proposal
    console.log("Creating a governance proposal...");
    try {
        // Generate a keypair for the proposal
        const proposalKeypair = Keypair.generate();
        console.log(`Proposal keypair: ${proposalKeypair.publicKey.toString()}`);
        
        // Create proposal
        const proposalTitle = "Adjust SAI stability fee";
        const proposalDescription = "This proposal aims to adjust the stability fee for SAI from 2% to 1.5% annually to encourage more usage of the platform.";
        
        const createProposalTx = await sldProgram.methods
            .createProposal(
                proposalTitle,
                proposalDescription,
                new BN(60 * 60 * 24 * 3) // 3 days voting period in seconds
            )
            .accounts({
                proposer: adminKeypair.publicKey,
                proposal: proposalKeypair.publicKey,
                governance: governance,
                proposerSld: adminSldAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .signers([adminKeypair, proposalKeypair])
            .rpc();
        
        console.log(`Proposal created! Transaction signature: ${createProposalTx}`);
        
        // Cast a vote
        console.log("Casting a vote on the proposal...");
        
        const castVoteTx = await sldProgram.methods
            .castVote(
                new BN(100 * 1_000_000), // Vote with 100 SLD tokens
                true // Vote in favor
            )
            .accounts({
                voter: adminKeypair.publicKey,
                proposal: proposalKeypair.publicKey,
                governance: governance,
                voterSld: adminSldAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([adminKeypair])
            .rpc();
        
        console.log(`Vote cast! Transaction signature: ${castVoteTx}`);
        console.log(`Voted in favor with 100 SLD tokens`);
        
        // Save proposal info for future reference
        const proposalInfo = {
            proposal: proposalKeypair.publicKey.toString(),
            title: proposalTitle,
            description: proposalDescription,
            creator: adminKeypair.publicKey.toString(),
            votingEndsAt: `${new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()}`
        };
        
        fs.writeFileSync(
            path.join(__dirname, 'proposal_info.json'),
            JSON.stringify(proposalInfo, null, 2)
        );
        
        // Store the proposal keypair for testing purposes (not secure for production)
        fs.writeFileSync(
            path.join(__dirname, 'proposal_keypair.json'),
            JSON.stringify(Array.from(proposalKeypair.secretKey))
        );
        
        console.log("Proposal information saved to proposal_info.json");
        
    } catch (error) {
        console.error("Failed to create proposal:", error);
        return;
    }
    
    console.log("Governance proposal creation completed successfully!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 