import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccount, createMint, mintTo } from '@solana/spl-token';
import { assert } from 'chai';
import { Sai } from '../target/types/sai';

describe('sai', () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Sai as Program<Sai>;
  const programId = program.programId;

  let adminKeypair: Keypair;
  let saiMint: PublicKey;
  let mockCollateralMint: PublicKey;
  let adminCollateralAccount: PublicKey;
  let adminSaiAccount: PublicKey;
  let vaultAuthority: PublicKey;
  let mintAuthority: PublicKey;
  let mintAuthorityBump: number;

  before(async () => {
    // Use existing admin keypair
    adminKeypair = Keypair.fromSecretKey(
      Buffer.from(JSON.parse(require('fs').readFileSync('./admin_keypair.json', 'utf-8')))
    );

    // No need to airdrop since we already have SOL
    // Find mint authority PDA
    const mintAuthoritySeeds = [Buffer.from("mint_authority")];
    const mintAuthorityPDA = await PublicKey.findProgramAddress(
      mintAuthoritySeeds,
      programId
    );
    mintAuthority = mintAuthorityPDA[0];
    mintAuthorityBump = mintAuthorityPDA[1];

    // Create SAI mint
    saiMint = await createMint(
      provider.connection,
      adminKeypair,
      mintAuthority,
      null,
      6 // 6 decimals for SAI
    );

    // Create mock collateral mint
    mockCollateralMint = await createMint(
      provider.connection,
      adminKeypair,
      adminKeypair.publicKey,
      null,
      9 // 9 decimals like SOL
    );

    // Create token accounts for admin
    adminCollateralAccount = await getAssociatedTokenAddress(
      mockCollateralMint,
      adminKeypair.publicKey
    );

    await createAssociatedTokenAccount(
      provider.connection,
      adminKeypair,
      mockCollateralMint,
      adminKeypair.publicKey
    );

    adminSaiAccount = await getAssociatedTokenAddress(
      saiMint,
      adminKeypair.publicKey
    );

    await createAssociatedTokenAccount(
      provider.connection,
      adminKeypair,
      saiMint,
      adminKeypair.publicKey
    );

    // Mint some collateral to admin
    await mintTo(
      provider.connection,
      adminKeypair,
      mockCollateralMint,
      adminCollateralAccount,
      adminKeypair.publicKey,
      10 * 1_000_000_000 // 10 tokens with 9 decimals
    );
  });

  it('Creates a CDP, draws SAI, and repays', async () => {
    // Find the CDP PDA
    const [cdp] = await PublicKey.findProgramAddress(
      [Buffer.from("cdp"), adminKeypair.publicKey.toBuffer()],
      programId
    );
    
    // Initialize the CDP
    await program.methods
      .initializeCdp()
      .accounts({
        owner: adminKeypair.publicKey,
        cdp,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([adminKeypair])
      .rpc();
    
    // Find the vault PDA
    const [vault] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), cdp.toBuffer()],
      programId
    );

    // Find the vault authority PDA
    const [vaultAuthority] = await PublicKey.findProgramAddress(
      [Buffer.from("vault_authority"), cdp.toBuffer()],
      programId
    );
    
    // Initialize the vault and deposit collateral
    const collateralAmount = new anchor.BN(2 * 1_000_000_000); // 2 tokens
    await program.methods
      .addCollateral(collateralAmount)
      .accounts({
        owner: adminKeypair.publicKey,
        cdp,
        ownerCollateral: adminCollateralAccount,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([adminKeypair])
      .rpc();

    const saiAmount = new anchor.BN(100 * 1_000_000); // 100 SAI (with 6 decimals)
    await program.methods
      .drawSai(saiAmount)
      .accounts({
        owner: adminKeypair.publicKey,
        cdp,
        vault,
        saiMint,
        ownerSai: adminSaiAccount,
        mintAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([adminKeypair])
      .rpc();
      
    // Verify CDP was created with correct data
    const cdpAccount = await program.account.cdp.fetch(cdp);
    assert.equal(cdpAccount.owner.toString(), adminKeypair.publicKey.toString());
    assert.equal(cdpAccount.collateralAmount.toNumber(), collateralAmount.toNumber());
    assert.equal(cdpAccount.saiDebt.toNumber(), saiAmount.toNumber());
    assert.equal(cdpAccount.status.toString(), 'Active');
    
    // Draw more SAI
    const drawAmount = new anchor.BN(50 * 1_000_000); // 50 more SAI
    
    await program.methods
      .drawSai(drawAmount)
      .accounts({
        owner: adminKeypair.publicKey,
        cdp,
        vault,
        saiMint,
        ownerSai: adminSaiAccount,
        mintAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([adminKeypair])
      .rpc();
      
    // Verify CDP was updated
    const updatedCdp = await program.account.cdp.fetch(cdp);
    assert.equal(updatedCdp.saiDebt.toNumber(), saiAmount.add(drawAmount).toNumber());
    
    // Repay SAI
    const repayAmount = new anchor.BN(75 * 1_000_000); // Repay 75 SAI
    
    await program.methods
      .repaySai(repayAmount)
      .accounts({
        owner: adminKeypair.publicKey,
        cdp,
        saiMint,
        ownerSai: adminSaiAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([adminKeypair])
      .rpc();
      
    // Verify CDP was updated again
    const finalCdp = await program.account.cdp.fetch(cdp);
    assert.equal(finalCdp.saiDebt.toNumber(), updatedCdp.saiDebt.sub(repayAmount).toNumber());
  });
}); 