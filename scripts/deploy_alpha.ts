import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  PublicKey,
} from "@solana/web3.js";
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  getMintLen,
  createInitializeTransferFeeConfigInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  AuthorityType,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import {
  createV1,
  CreateV1InstructionAccounts,
  CreateV1InstructionData,
  TokenStandard,
  CollectionDetails,
  PrintSupply,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  createSignerFromKeypair,
  none,
  signerIdentity,
  some,
  percentAmount,
  publicKey,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  fromWeb3JsKeypair,
  fromWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";
const bs58 = require("bs58");
import * as fs from "fs";
import * as os from "os";

// Helper to load keypair
function loadKeypair(path: string): Keypair {
  const keypairData = JSON.parse(fs.readFileSync(path, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(keypairData));
}

// Token Metadata Program ID for Token-2022
const SPL_TOKEN_2022_PROGRAM_ID = publicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);

async function main() {
  // Connect to Devnet
  const connection = new Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );
  console.log("Connected to Devnet");

  // Load Payer (Deployer)
  const homeDir = os.homedir();
  const payer = loadKeypair(`${homeDir}/.config/solana/id.json`);
  console.log(`Payer: ${payer.publicKey.toBase58()}`);

  // Generate Mint Keypair
  const mintKeypair = Keypair.generate();
  console.log(`new Mint Address: ${mintKeypair.publicKey.toBase58()}`);

  // Generate Tax Wallet (Fee Collector)
  // "This can go to any other wallet that you want to define"
  const taxWallet = Keypair.generate();
  console.log(`Tax Wallet (Fee Collector): ${taxWallet.publicKey.toBase58()}`);
  console.log(`Tax Wallet Secret: [${taxWallet.secretKey.toString()}]`);
  console.log("SAVE THIS SECRET if you want to access the collected fees!");

  // Configurations
  const decimals = 9;
  const supply = 1_000_000n * BigInt(10 ** decimals); // 1 Million
  const feeBasisPoints = 500; // 5%
  const maxFee = BigInt(1_000_000) * BigInt(10 ** decimals); // Max fee cap (set high to effectively be 5%)

  // 1. Create Mint with Transfer Fee Config
  const extensions = [ExtensionType.TransferFeeConfig];
  const mintLen = getMintLen(extensions);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const createMintTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeTransferFeeConfigInstruction(
      mintKeypair.publicKey,
      payer.publicKey, // config auth (temporarily payer, to be renounced)
      taxWallet.publicKey, // withdraw auth (tax wallet)
      feeBasisPoints,
      maxFee,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      payer.publicKey, // mint auth (temporarily payer)
      null, // freeze auth
      TOKEN_2022_PROGRAM_ID
    )
  );

  console.log("Creating Mint...");
  await sendAndConfirmTransaction(connection, createMintTx, [
    payer,
    mintKeypair,
  ]);
  console.log("Mint Initiated.");

  // 2. Create Metadata (Alpha Token)
  console.log("Creating Metadata...");
  const umi = createUmi("https://api.devnet.solana.com");
  const signer = createSignerFromKeypair(umi, fromWeb3JsKeypair(payer));
  umi.use(signerIdentity(signer, true));

  const ourMetadata = {
    name: "Alpha",
    symbol: "Alpha",
    uri: "",
  };

  const onChainData = {
    ...ourMetadata,
    sellerFeeBasisPoints: percentAmount(0, 2),
    creators: none<any>(),
    collection: none<any>(),
    uses: none<any>(),
  };

  const mintSigner = createSignerFromKeypair(
    umi,
    fromWeb3JsKeypair(mintKeypair)
  );

  const accounts: CreateV1InstructionAccounts = {
    mint: mintSigner,
    splTokenProgram: SPL_TOKEN_2022_PROGRAM_ID,
  };

  const data: CreateV1InstructionData = {
    ...onChainData,
    isMutable: false,
    discriminator: 0,
    tokenStandard: TokenStandard.Fungible,
    collectionDetails: none<CollectionDetails>(),
    ruleSet: none<any>(),
    createV1Discriminator: 0,
    primarySaleHappened: true,
    decimals: none<number>(),
    printSupply: none<PrintSupply>(),
  };

  await createV1(umi, { ...accounts, ...data }).sendAndConfirm(umi);
  console.log("Metadata Created.");

  // 3. Mint Tokens to Payer
  console.log(`Minting ${supply} tokens to Payer...`);
  const payerATA = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    payer.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const mintTx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      payerATA,
      payer.publicKey,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID
    ),
    createMintToInstruction(
      mintKeypair.publicKey,
      payerATA,
      payer.publicKey,
      supply,
      [],
      TOKEN_2022_PROGRAM_ID
    )
  );
  await sendAndConfirmTransaction(connection, mintTx, [payer]);
  console.log("Tokens Minted.");

  console.log("Renouncing Ownership...");
  const renounceTx = new Transaction().add(
    createSetAuthorityInstruction(
      mintKeypair.publicKey,
      payer.publicKey,
      AuthorityType.MintTokens,
      null, // Set to None
      [],
      TOKEN_2022_PROGRAM_ID
    ),
    createSetAuthorityInstruction(
      mintKeypair.publicKey,
      payer.publicKey,
      AuthorityType.TransferFeeConfig,
      null, // Set to None
      [],
      TOKEN_2022_PROGRAM_ID
    )
  );

  const renounceSig = await sendAndConfirmTransaction(connection, renounceTx, [
    payer,
  ]);
  console.log(
    `Renounced Tx: https://explorer.solana.com/tx/${renounceSig}?cluster=devnet`
  );

  console.log("\n--- DEPLOYMENT COMPLETE ---");
  console.log(`Mint Address:  ${mintKeypair.publicKey.toBase58()}`);
  console.log(`Ticker:        Alpha`);
  console.log(`Tax:           5%`);
  console.log(`Tax Wallet:    ${taxWallet.publicKey.toBase58()}`);
  console.log(`NOTE: Save the Tax Wallet Secret Key printed above!`);
}

main().catch(console.error);
