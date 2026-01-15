import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PayRequest } from "../target/types/pay_request";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import keccak256 from "keccak256";
import { expect } from "chai";
import bs58 from "bs58";
import * as fs from "fs";
import * as path from "path";

describe("Step 1: Initialize Pay Request", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.pay_request as Program<PayRequest>;

  const PAYER_SECRET =
    "44U82XoBrs3vbhBC26Jd1FkMZLnEf4jGY7ogLoxrnkHfxQ7z8mKyjhZswDcnxM2Vz4UF8PDD6NpdxBAx8MG9hLEH";
  const RECEIVER_SECRET =
    "45XNgJWAzqh6UsAVnJbhKmvaiGtsrmkt6XdYy4zNcnhhisNVCC13zGU8d9C8PCjAUxSqW9gXUX4WsQb5nhtN6Bsu";

  // Alpha Token (5% Tax, Renounced)
  const MINT_ADDRESS = new PublicKey(
    "5bFbWeTaXDhKW33JiMCajWpKT6n1RomzHjAkRCKTY8Kc"
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

    console.log("------------------------------------------------------");
    console.log("Payer Public Key:   ", payerWallet.publicKey.toBase58());
    console.log("Receiver Public Key:", receiverWallet.publicKey.toBase58());
    console.log("Mint Address:       ", mint.toBase58());
    console.log("------------------------------------------------------");

    // Airdrop check for SOL
    try {
      const balance = await provider.connection.getBalance(
        payerWallet.publicKey
      );
      if (balance < 0.05 * LAMPORTS_PER_SOL) {
        console.log("Requesting airdrop for Payer...");
        const tx = await provider.connection.requestAirdrop(
          payerWallet.publicKey,
          1 * LAMPORTS_PER_SOL
        );
        await provider.connection.confirmTransaction(tx);
        console.log("Airdrop confirmed.");
      }
    } catch (e: any) {
      console.log(
        "Airdrop skipped/failed (likely sufficient balance or rate limit):",
        e.message
      );
    }
  });

  it("Create Pay Request", async () => {
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

    console.log("\nInitializing Request...");
    console.log("Request ID: ", request_id.toString());
    console.log("PDA:        ", payRequestPda.toBase58());

    try {
      const tx = await program.methods
        .initialize(request_id, amount, receiverHash)
        .accounts({
          payRequest: payRequestPda,
          mint: mint,
          payer: payerWallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([payerWallet])
        .rpc();
      console.log("Transaction Signature:", tx);
    } catch (e) {
      console.error("Initialize Failed:", e);
      throw e;
    }

    const account = await program.account.payRequest.fetch(payRequestPda);
    expect(account.isInitialized).to.be.true;
    expect(account.mint.toBase58()).to.equal(mint.toBase58());

    // Save State
    const state = {
      requestId: request_id.toString(),
      payRequestPda: payRequestPda.toBase58(),
      mint: mint.toBase58(),
      amount: amount.toString(),
    };

    fs.writeFileSync(
      path.join(__dirname, "test-state.json"),
      JSON.stringify(state, null, 2)
    );
    console.log("\n[SUCCESS] Pay Request Initialized.");
    console.log("State saved to tests/test-state.json");
  });
});
