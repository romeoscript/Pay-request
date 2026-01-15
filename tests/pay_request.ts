import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PayRequest } from "../target/types/pay_request";
import {
  PublicKey,
  SystemProgram,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import keccak256 from "keccak256";
import { expect } from "chai";

describe("pay_request", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PayRequest as Program<PayRequest>;

  const request_id = new anchor.BN(Date.now());
  const amount = new anchor.BN(1 * LAMPORTS_PER_SOL);
  const receiver = Keypair.generate();

  // Calculate PDA
  const [payRequestPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("request"), request_id.toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  it("Is initialized!", async () => {
    // Hash the receiver public key
    const receiverHashBuf = keccak256(receiver.publicKey.toBuffer());
    const receiverHash = Array.from(receiverHashBuf);

    await program.methods
      .initialize(request_id, amount, receiverHash)
      .accounts({
        payRequest: payRequestPda,
        payer: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const account = await program.account.payRequest.fetch(payRequestPda);
    expect(account.requestId.eq(request_id)).to.be.true;
    expect(account.amount.eq(amount)).to.be.true;
    expect(JSON.stringify(account.receiverHash)).to.equal(
      JSON.stringify(receiverHash)
    );
    expect(account.isInitialized).to.be.true;
  });

  it("Settle payment", async () => {
    const initialPdaBalance = await provider.connection.getBalance(
      payRequestPda
    );

    await program.methods
      .settle()
      .accounts({
        payRequest: payRequestPda,
        payer: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const finalPdaBalance = await provider.connection.getBalance(payRequestPda);
    // Balance should increase by amount (account rent + amount)
    // Actually initial was just rent. Final is rent + amount.
    expect(finalPdaBalance - initialPdaBalance).to.equal(amount.toNumber());
  });

  it("Fails to sweep with wrong receiver", async () => {
    const wrongReceiver = Keypair.generate();

    try {
      await program.methods
        .sweep()
        .accounts({
          payRequest: payRequestPda,
          receiver: wrongReceiver.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([wrongReceiver])
        .rpc();

      expect.fail("Should have failed");
    } catch (e) {
      expect(e).to.exist;
      // You can check for specific error code if needed
    }
  });

  it("Sweep funds", async () => {
    // Airdrop some SOL to receiver so they can pay for gas?
    // Or if the test runs on local validator, we can just use the provider wallet to fund them a bit?
    // Actually, for sweep, the receiver pays the transaction fee.
    // Let's fund the receiver a bit.
    const transferIx = anchor.web3.SystemProgram.transfer({
      fromPubkey: provider.wallet.publicKey,
      toPubkey: receiver.publicKey,
      lamports: 0.1 * LAMPORTS_PER_SOL,
    });
    const tx = new anchor.web3.Transaction().add(transferIx);
    await provider.sendAndConfirm(tx);

    const preSweepBalance = await provider.connection.getBalance(
      receiver.publicKey
    );
    const pdaBalance = await provider.connection.getBalance(payRequestPda);

    await program.methods
      .sweep()
      .accounts({
        payRequest: payRequestPda,
        receiver: receiver.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([receiver])
      .rpc();

    // Check PDA is closed
    const pdaAccount = await provider.connection.getAccountInfo(payRequestPda);
    expect(pdaAccount).to.be.null;

    const postSweepBalance = await provider.connection.getBalance(
      receiver.publicKey
    );
    // Receiver should have received pdaBalance minus tx fee.
    // It's hard to predict exact fee, but balance should certainly increase significantly.
    expect(postSweepBalance).to.be.gt(preSweepBalance);

    // Roughly check
    // We know we sent 1 SOL to PDA (plus rent).
    // Receiver had 0.1 SOL.
    // Receiver should have ~1.1 SOL (minus fees).
    // pdaBalance include rent.
    console.log("Pre-sweep:", preSweepBalance);
    console.log("PDA Balance:", pdaBalance);
    console.log("Post-sweep:", postSweepBalance);
  });
});
