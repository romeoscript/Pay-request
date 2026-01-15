import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PayRequest } from "../target/types/pay_request";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_2022_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { expect } from "chai";
import bs58 from "bs58";
import * as fs from "fs";
import * as path from "path";

describe("Step 2: Process Pay Request (Settle & Sweep)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.pay_request as Program<PayRequest>;

  const PAYER_SECRET =
    "44U82XoBrs3vbhBC26Jd1FkMZLnEf4jGY7ogLoxrnkHfxQ7z8mKyjhZswDcnxM2Vz4UF8PDD6NpdxBAx8MG9hLEH";
  const RECEIVER_SECRET =
    "45XNgJWAzqh6UsAVnJbhKmvaiGtsrmkt6XdYy4zNcnhhisNVCC13zGU8d9C8PCjAUxSqW9gXUX4WsQb5nhtN6Bsu";

  let payerWallet: Keypair;
  let receiverWallet: Keypair;
  let mint: PublicKey;
  let payRequestPda: PublicKey;
  let amount: anchor.BN;

  before(() => {
    // Load State
    const statePath = path.join(__dirname, "test-state.json");
    if (!fs.existsSync(statePath)) {
      throw new Error("test-state.json not found! Run step1_init.ts first.");
    }
    const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));

    payerWallet = Keypair.fromSecretKey(bs58.decode(PAYER_SECRET));
    receiverWallet = Keypair.fromSecretKey(bs58.decode(RECEIVER_SECRET));
    mint = new PublicKey(state.mint);
    payRequestPda = new PublicKey(state.payRequestPda);
    amount = new anchor.BN(state.amount);

    console.log("------------------------------------------------------");
    console.log("Loaded State from Step 1:");
    console.log("Request ID: ", state.requestId);
    console.log("PDA:        ", payRequestPda.toBase58());
    console.log("Mint:       ", mint.toBase58());
    console.log("Amount:     ", amount.toString());
    console.log("------------------------------------------------------");
  });

  it("Settle payment (SPL)", async () => {
    // 1. Get Payer ATA
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

    console.log("\nSettling Payment...");
    const tx = await program.methods
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
    console.log("Settle Tx:", tx);

    const vaultInfo = await getAccount(
      provider.connection,
      vaultAta.address,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    console.log("Vault Balance (After Settle):", vaultInfo.amount.toString());
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

    console.log("\nSweeping Funds...");
    const tx = await program.methods
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

    console.log("Sweep Tx:", tx);

    // Verify Vault is Empty (Amount is 0)
    const vaultAccountFinal = await getAccount(
      provider.connection,
      vaultAtaAddress,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    console.log(
      "Vault Balance (After Sweep):",
      vaultAccountFinal.amount.toString()
    );
    expect(Number(vaultAccountFinal.amount)).to.equal(0);
  });
});
