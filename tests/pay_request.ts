import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PayRequest } from "../target/types/pay_request";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  createMintToInstruction,
  getMintLen,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import keccak256 from "keccak256";
import { expect } from "chai";
import bs58 from "bs58";

describe("pay_request", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.pay_request as Program<PayRequest>;

  const PAYER_SECRET =
    "44U82XoBrs3vbhBC26Jd1FkMZLnEf4jGY7ogLoxrnkHfxQ7z8mKyjhZswDcnxM2Vz4UF8PDD6NpdxBAx8MG9hLEH";
  const RECEIVER_SECRET =
    "45XNgJWAzqh6UsAVnJbhKmvaiGtsrmkt6XdYy4zNcnhhisNVCC13zGU8d9C8PCjAUxSqW9gXUX4WsQb5nhtN6Bsu";

  // Real Token-2022 Mint provided by user
  const MINT_ADDRESS = new PublicKey(
    "75hJRLXF6mwdYxauFaUxZPqdesZKxzV1D25ueG6FKeh9"
  );

  let payerWallet: Keypair;
  let receiverWallet: Keypair;
  let mint: PublicKey;
  let payRequestPda: PublicKey;
  let request_id: anchor.BN;
  const amount = new anchor.BN(10 * 10 ** 9);

  before(async () => {
    // Setup accounts
    payerWallet = Keypair.fromSecretKey(bs58.decode(PAYER_SECRET));
    receiverWallet = Keypair.fromSecretKey(bs58.decode(RECEIVER_SECRET));
    mint = MINT_ADDRESS;

    console.log("Payer:", payerWallet.publicKey.toBase58());
    console.log("Receiver:", receiverWallet.publicKey.toBase58());
    console.log("Using Mint:", mint.toBase58());

    // Airdrop check for SOL
    try {
      const balance = await provider.connection.getBalance(
        payerWallet.publicKey
      );
      if (balance < 0.2 * LAMPORTS_PER_SOL) {
        console.log("Requesting airdrop...");
        const tx = await provider.connection.requestAirdrop(
          payerWallet.publicKey,
          2 * LAMPORTS_PER_SOL
        );
        await provider.connection.confirmTransaction(tx);
      }
    } catch (e: any) {
      console.log("Airdrop skipped/failed:", e.message);
    }
  });

  it("Is initialized!", async () => {
    request_id = new anchor.BN(Date.now());
    const seeds = [
      Buffer.from("request"),
      request_id.toArrayLike(Buffer, "le", 8),
    ];
    [payRequestPda] = PublicKey.findProgramAddressSync(
      seeds,
      program.programId
    );

    const receiverHashBuf = keccak256(receiverWallet.publicKey.toBuffer());
    const receiverHash = Array.from(receiverHashBuf);

    try {
      await program.methods
        .initialize(request_id, amount, receiverHash)
        .accounts({
          payRequest: payRequestPda,
          mint: mint,
          payer: payerWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([payerWallet])
        .rpc();
    } catch (e) {
      console.error("Initialize Failed:", e);
      throw e;
    }

    const account = await program.account.payRequest.fetch(payRequestPda);
    expect(account.isInitialized).to.be.true;
    expect(account.mint.toBase58()).to.equal(mint.toBase58());
  });

  it("Settle payment (SPL)", async () => {
    // 1. Get Payer ATA
    // We assume Payer already has some tokens of this mint!
    const payerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payerWallet,
      mint,
      payerWallet.publicKey,
      false,
      "confirmed",
      {},
      TOKEN_2022_PROGRAM_ID
    );

    const initialPayerInfo = await getAccount(
      provider.connection,
      payerAta.address,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    console.log("Payer Token Balance:", initialPayerInfo.amount.toString());

    // Warn if balance is low, but try anyway (test might fail)
    if (BigInt(initialPayerInfo.amount) < BigInt(amount.toString())) {
      console.warn("WARNING: Payer has insufficient funds for settlement!");
    }
    expect(Number(initialPayerInfo.amount)).to.be.gte(amount.toNumber());

    // 2. Setup Vault ATA
    const vaultAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payerWallet,
      mint,
      payRequestPda,
      true,
      "confirmed",
      {},
      TOKEN_2022_PROGRAM_ID
    );

    await program.methods
      .settle()
      .accounts({
        payRequest: payRequestPda,
        mint: mint,
        payerTokenAccount: payerAta.address,
        vaultTokenAccount: vaultAta.address,
        payer: payerWallet.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      })
      .signers([payerWallet])
      .rpc();

    const vaultInfo = await getAccount(
      provider.connection,
      vaultAta.address,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    console.log("Vault Balance:", vaultInfo.amount.toString());
    expect(Number(vaultInfo.amount)).to.be.gt(0);
  });

  it("Sweep funds (SPL)", async () => {
    const receiverAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      receiverWallet,
      mint,
      receiverWallet.publicKey,
      false,
      "confirmed",
      {},
      TOKEN_2022_PROGRAM_ID
    );

    const vaultAtaAddress = await getAssociatedTokenAddressSync(
      mint,
      payRequestPda,
      true,
      TOKEN_2022_PROGRAM_ID
    );

    await program.methods
      .sweep()
      .accounts({
        payRequest: payRequestPda,
        mint: mint,
        vaultTokenAccount: vaultAtaAddress,
        receiverTokenAccount: receiverAta.address,
        receiver: receiverWallet.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      })
      .signers([receiverWallet])
      .rpc();

    // Verify Vault is Empty (Amount is 0)
    const vaultAccountFinal = await getAccount(
      provider.connection,
      vaultAtaAddress,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(vaultAccountFinal.amount)).to.equal(0);
  });
});
