import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY, SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccount, createMint, mintTo } from '@solana/spl-token';
import { assert } from 'chai';
import { Sld } from '../target/types/sld';

describe('sld', () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Sld as Program<Sld>;
  const programId = program.programId;

  let adminKeypair: Keypair;
  let sldMint: PublicKey;
  let adminSldAccount: PublicKey;
  let mintAuthority: PublicKey;
  let governance: PublicKey;
  let governanceBump: number;

  before(async () => {
    // Create a new keypair for testing
    adminKeypair = Keypair.generate();

    // Airdrop SOL to the admin
    const signature = await provider.connection.requestAirdrop(
      adminKeypair.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature);

    // Find governance PDA
    const [governancePDA, bump] = await PublicKey.findProgramAddress(
      [Buffer.from("governance")],
      programId
    );
    governance = governancePDA;
    governanceBump = bump;

    // Find mint authority PDA
    const [mintAuthorityPDA] = await PublicKey.findProgramAddress(
      [Buffer.from("mint_authority")],
      programId
    );
    mintAuthority = mintAuthorityPDA;

    // Create SLD mint
    const sldMintKeypair = Keypair.generate();
    
    // Initialize governance and SLD mint
    await program.methods
      .initializeGovernance(new anchor.BN(1000 * 1_000_000), new anchor.BN(24 * 60 * 60))
      .accounts({
        admin: adminKeypair.publicKey,
        governance,
        sldMint: sldMintKeypair.publicKey,
        mintAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([adminKeypair, sldMintKeypair])
      .rpc();
      
    sldMint = sldMintKeypair.publicKey;

    // Create token account for admin
    adminSldAccount = await getAssociatedTokenAddress(
      sldMint,
      adminKeypair.publicKey
    );

    await createAssociatedTokenAccount(
      provider.connection,
      adminKeypair,
      sldMint,
      adminKeypair.publicKey
    );

    // Mint initial SLD tokens to admin
    await program.methods
      .mintSld(new anchor.BN(1000 * 1_000_000))
      .accounts({
        admin: adminKeypair.publicKey,
        governance,
        sldMint,
        adminSld: adminSldAccount,
        mintAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([adminKeypair])
      .rpc();
  });

  it('Creates a proposal and votes on it', async () => {
    // Generate a keypair for the proposal
    const proposalKeypair = Keypair.generate();
    
    // Create a proposal
    const title = "Change minimum vote threshold";
    const description = "Lower the minimum vote threshold to 500 SLD";
    const votingPeriod = new anchor.BN(48 * 60 * 60); // 48 hours
    
    await program.methods
      .createProposal(title, description, votingPeriod)
      .accounts({
        proposer: adminKeypair.publicKey,
        proposal: proposalKeypair.publicKey,
        governance,
        systemProgram: SystemProgram.programId,
        clock: SYSVAR_CLOCK_PUBKEY,
      })
      .signers([adminKeypair, proposalKeypair])
      .rpc();
      
    // Verify proposal was created with correct data
    const proposalAccount = await program.account.proposal.fetch(proposalKeypair.publicKey);
    assert.equal(proposalAccount.proposer.toString(), adminKeypair.publicKey.toString());
    assert.equal(proposalAccount.title, title);
    assert.equal(proposalAccount.description, description);
    assert.equal(proposalAccount.votingPeriod.toNumber(), votingPeriod.toNumber());
    assert.equal(proposalAccount.forVotes.toNumber(), 0);
    assert.equal(proposalAccount.againstVotes.toNumber(), 0);
    assert.equal(proposalAccount.executed, false);
    
    // Find vote record PDA
    const [voteRecord] = await PublicKey.findProgramAddress(
      [
        Buffer.from("vote_record"),
        proposalKeypair.publicKey.toBuffer(),
        adminKeypair.publicKey.toBuffer()
      ],
      programId
    );
    
    // Vote on the proposal (vote for)
    const voteAmount = new anchor.BN(500 * 1_000_000); // 500 SLD
    const voteFor = true;
    
    await program.methods
      .castVote(voteAmount, voteFor)
      .accounts({
        voter: adminKeypair.publicKey,
        voterSld: adminSldAccount,
        proposal: proposalKeypair.publicKey,
        voteRecord,
        governance,
        sldMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        clock: SYSVAR_CLOCK_PUBKEY,
      })
      .signers([adminKeypair])
      .rpc();
      
    // Verify vote was recorded
    const updatedProposal = await program.account.proposal.fetch(proposalKeypair.publicKey);
    assert.equal(updatedProposal.forVotes.toNumber(), voteAmount.toNumber());
    assert.equal(updatedProposal.againstVotes.toNumber(), 0);
    
    const voteRecordAccount = await program.account.voteRecord.fetch(voteRecord);
    assert.equal(voteRecordAccount.voter.toString(), adminKeypair.publicKey.toString());
    assert.equal(voteRecordAccount.proposal.toString(), proposalKeypair.publicKey.toString());
    assert.equal(voteRecordAccount.voteAmount.toNumber(), voteAmount.toNumber());
    assert.equal(voteRecordAccount.support, voteFor);
  });
}); 