import * as anchor from "@project-serum/anchor";
import { Program, AnchorProvider, Wallet } from "@project-serum/anchor";
import { Sai } from "../target/types/sai";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo, getAccount, Account } from "@solana/spl-token";
import { expect } from "chai";

describe("sai", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Sai as Program<Sai>;

  // Test accounts
  let collateralMint: PublicKey;
  let saiMint: PublicKey;
  let ownerCollateralAccount: PublicKey;
  let ownerSaiAccount: PublicKey;
  let vault: PublicKey;
  let vaultAuthority: PublicKey;
  let mintAuthority: PublicKey;
  let cdp: PublicKey;

  const COLLATERAL_AMOUNT = new anchor.BN(1000000000); // 1 SOL
  const SAI_AMOUNT = new anchor.BN(50000000); // 50 SAI

  before(async () => {
    // Create collateral mint
    collateralMint = await createMint(
      provider.connection,
      (provider.wallet as any).payer as Keypair,
      provider.wallet.publicKey,
      null,
      9
    );

    // Create SAI mint
    saiMint = await createMint(
      provider.connection,
      (provider.wallet as any).payer as Keypair,
      provider.wallet.publicKey,
      null,
      6
    );

    // Create owner's collateral account
    ownerCollateralAccount = await createAccount(
      provider.connection,
      (provider.wallet as any).payer as Keypair,
      collateralMint,
      provider.wallet.publicKey
    );

    // Create owner's SAI account
    ownerSaiAccount = await createAccount(
      provider.connection,
      (provider.wallet as any).payer as Keypair,
      saiMint,
      provider.wallet.publicKey
    );

    // Mint some collateral to owner
    await mintTo(
      provider.connection,
      (provider.wallet as any).payer as Keypair,
      collateralMint,
      ownerCollateralAccount,
      provider.wallet.publicKey,
      COLLATERAL_AMOUNT.toNumber()
    );

    // Find PDAs
    [vaultAuthority] = await PublicKey.findProgramAddress(
      [Buffer.from("vault_authority")],
      program.programId
    );

    [mintAuthority] = await PublicKey.findProgramAddress(
      [Buffer.from("mint_authority")],
      program.programId
    );

    [cdp] = await PublicKey.findProgramAddress(
      [Buffer.from("cdp")],
      program.programId
    );

    [vault] = await PublicKey.findProgramAddress(
      [Buffer.from("vault"), cdp.toBuffer()],
      program.programId
    );
  });

  it("Initializes the SAI mint", async () => {
    await program.methods
      .initializeSaiMint()
      .accounts({
        saiMint,
        payer: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const mintInfo = await getAccount(provider.connection, saiMint) as Account & { mintAuthority: PublicKey | null };
    expect(mintInfo.mintAuthority).to.eql(mintAuthority);
  });

  it("Initializes a CDP", async () => {
    await program.methods
      .initializeCdp(COLLATERAL_AMOUNT, SAI_AMOUNT)
      .accounts({
        owner: provider.wallet.publicKey,
        cdp,
        ownerCollateralAccount,
        collateralMint,
        vault,
        vaultAuthority,
        saiMint,
        ownerSaiAccount,
        mintAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const cdpAccount = await program.account.cdp.fetch(cdp);
    expect(cdpAccount.owner).to.eql(provider.wallet.publicKey);
    expect(cdpAccount.collateralAmount).to.eql(COLLATERAL_AMOUNT);
    expect(cdpAccount.saiDebt).to.eql(SAI_AMOUNT);
    expect(cdpAccount.status).to.eql({ active: {} });
  });

  it("Adds collateral to CDP", async () => {
    const additionalCollateral = new anchor.BN(500000000); // 0.5 SOL

    await program.methods
      .addCollateral(additionalCollateral)
      .accounts({
        owner: provider.wallet.publicKey,
        cdp,
        ownerCollateralAccount,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const cdpAccount = await program.account.cdp.fetch(cdp);
    expect(cdpAccount.collateralAmount).to.eql(COLLATERAL_AMOUNT.add(additionalCollateral));
  });

  it("Draws additional SAI from CDP", async () => {
    const additionalSai = new anchor.BN(25000000); // 25 SAI

    await program.methods
      .drawSai(additionalSai)
      .accounts({
        owner: provider.wallet.publicKey,
        cdp,
        vault,
        saiMint,
        ownerSaiAccount,
        mintAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const cdpAccount = await program.account.cdp.fetch(cdp);
    expect(cdpAccount.saiDebt).to.eql(SAI_AMOUNT.add(additionalSai));
  });

  it("Repays SAI to CDP", async () => {
    const repayAmount = new anchor.BN(25000000); // 25 SAI

    await program.methods
      .repaySai(repayAmount)
      .accounts({
        owner: provider.wallet.publicKey,
        cdp,
        saiMint,
        ownerSaiAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const cdpAccount = await program.account.cdp.fetch(cdp);
    expect(cdpAccount.saiDebt).to.eql(SAI_AMOUNT);
  });

  it("Closes CDP", async () => {
    await program.methods
      .closeCdp()
      .accounts({
        owner: provider.wallet.publicKey,
        cdp,
        ownerCollateralAccount,
        vault,
        vaultAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    try {
      await program.account.cdp.fetch(cdp);
      throw new Error("CDP should be closed");
    } catch (e) {
      expect(e.message).to.include("Account does not exist");
    }
  });
}); 