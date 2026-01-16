import {
  Connection,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
  PublicKey,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  createTransferCheckedInstruction,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";

// TEST CONFIG
const TEST_PAYER_PUBKEY = new PublicKey(
  "BZiztyhZMYVzUirAVV3N83BgQ8NuE71X2V37LUfXZDMw"
);
const MINT_ADDRESS = new PublicKey(
  "DULmjLxQnfr2a1qKzTjt2xDdWfYJH7dmGpi8azwgG66x"
);
const AMOUNT_TO_SEND = 1000 * 10 ** 9; // 1000 Tokens

async function main() {
  const connection = new Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );
  console.log("Connected to Devnet");

  // Load Deployer (Who holds the tokens)
  const homeDir = os.homedir();
  const deployerKeyPath = `${homeDir}/.config/solana/id.json`;
  const deployer = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(deployerKeyPath, "utf-8")))
  );
  console.log(`Deployer (Sender): ${deployer.publicKey.toBase58()}`);
  console.log(`Test Payer (Recipient): ${TEST_PAYER_PUBKEY.toBase58()}`);

  // 1. Get/Create Deployer ATA
  const senderAta = await getOrCreateAssociatedTokenAccount(
    connection,
    deployer,
    MINT_ADDRESS,
    deployer.publicKey,
    false,
    "confirmed",
    {},
    TOKEN_2022_PROGRAM_ID
  );
  console.log(`Sender ATA: ${senderAta.address.toBase58()}`);

  // 2. Get/Create Recipient ATA
  const recipientAta = await getOrCreateAssociatedTokenAccount(
    connection,
    deployer, // Deployer pays for rent of recipient ATA
    MINT_ADDRESS,
    TEST_PAYER_PUBKEY,
    false,
    "confirmed",
    {},
    TOKEN_2022_PROGRAM_ID
  );
  console.log(`Recipient ATA: ${recipientAta.address.toBase58()}`);

  // 3. Transfer Logic (Token-2022 needs TransferChecked)
  const transferTx = new Transaction().add(
    createTransferCheckedInstruction(
      senderAta.address, // from
      MINT_ADDRESS, // mint
      recipientAta.address, // to
      deployer.publicKey, // owner
      AMOUNT_TO_SEND, // amount
      9, // decimals
      [],
      TOKEN_2022_PROGRAM_ID
    )
  );

  console.log(`Transferring ${AMOUNT_TO_SEND} tokens...`);
  const txSig = await sendAndConfirmTransaction(connection, transferTx, [
    deployer,
  ]);
  console.log(`Transfer Successful!`);
  console.log(`Tx: https://explorer.solana.com/tx/${txSig}?cluster=devnet`);
}

main().catch(console.error);
