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
    // Use existing admin keypair
    adminKeypair = Keypair.fromSecretKey(
      Buffer.from(JSON.parse(require('fs').readFileSync('./admin_keypair.json', 'utf-8')))
    );

    // No need to airdrop since we already have SOL

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
        governance,
        sldMint: sldMintKeypair.publicKey,
        mintAuthority,
        payer: adminKeypair.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
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
    
    await program.methods
      .createProposal(title, description)
      .accounts({
        proposal: proposalKeypair.publicKey,
        governance,
        proposerTokenAccount: adminSldAccount,
        proposer: adminKeypair.publicKey,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([adminKeypair, proposalKeypair])
      .rpc();
      
    // Verify proposal was created with correct data
    const proposalAccount = await program.account.proposal.fetch(proposalKeypair.publicKey);
    assert.equal(proposalAccount.proposer.toString(), adminKeypair.publicKey.toString());
    assert.equal(proposalAccount.title, title);
    assert.equal(proposalAccount.description, description);
    assert.equal(proposalAccount.votingPeriod.toNumber(), 48 * 60 * 60); // Assuming default votingPeriod
    assert.equal(proposalAccount.forVotes.toNumber(), 0);
    assert.equal(proposalAccount.againstVotes.toNumber(), 0);
    assert.equal(proposalAccount.executed, false);
    
    // Find vote record PDA
    const [voterAccount] = await PublicKey.findProgramAddress(
      [
        Buffer.from("voter"),
        proposalKeypair.publicKey.toBuffer(),
        adminKeypair.publicKey.toBuffer()
      ],
      programId
    );
    
    // Vote on the proposal (vote for)
    const voteFor = true;
    
    await program.methods
      .castVote(voteFor)
      .accounts({
        proposal: proposalKeypair.publicKey,
        voterAccount,
        voterTokenAccount: adminSldAccount,
        voterSigner: adminKeypair.publicKey,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([adminKeypair])
      .rpc();
      
    // Verify vote was recorded
    const updatedProposal = await program.account.proposal.fetch(proposalKeypair.publicKey);
    assert.equal(updatedProposal.forVotes.toNumber(), 500 * 1_000_000); // Assuming voteAmount is in lamports
    assert.equal(updatedProposal.againstVotes.toNumber(), 0);
    
    const voterAccountData = await program.account.voter.fetch(voterAccount);
    assert.equal(voterAccountData.hasVoted, true);
    assert.equal(voterAccountData.vote, voteFor);
    assert.equal(voterAccountData.votingPower.toNumber(), 500 * 1_000_000); // Assuming voteAmount is in lamports
    assert.equal(voterAccountData.proposal.toString(), proposalKeypair.publicKey.toString());
  });
}); 