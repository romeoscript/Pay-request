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

const SPL_TOKEN_2022_PROGRAM_ID = publicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);

function loadKeypair(path: string): Keypair {
  const keypairData = JSON.parse(fs.readFileSync(path, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(keypairData));
}

async function main() {
  const connection = new Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );
  console.log("Connected to Devnet");

  const homeDir = os.homedir();
  const payer = loadKeypair(`${homeDir}/.config/solana/id.json`);
  console.log(`Payer: ${payer.publicKey.toBase58()}`);

  const mintKeypair = Keypair.generate();
  console.log(`Mint: ${mintKeypair.publicKey.toBase58()}`);

  const taxWallet = Keypair.generate();
  console.log(`Tax Wallet: ${taxWallet.publicKey.toBase58()}`);
  console.log(`Secret: [${taxWallet.secretKey.toString()}]`);

  const decimals = 9;
  const supply = 1_000_000n * BigInt(10 ** decimals);
  const feeBasisPoints = 500; // 5%
  const maxFee = BigInt(1_000_000) * BigInt(10 ** decimals);

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
      payer.publicKey, // config auth
      taxWallet.publicKey, // withdraw auth
      feeBasisPoints,
      maxFee,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      payer.publicKey, // mint auth
      null, // freeze auth
      TOKEN_2022_PROGRAM_ID
    )
  );

  console.log("Creating Mint...");
  await sendAndConfirmTransaction(connection, createMintTx, [
    payer,
    mintKeypair,
  ]);
  console.log("Mint Created.");

  // 2. Create Metadata (Using createV1)
  console.log("Creating Metadata...");
  const umi = createUmi("https://api.devnet.solana.com");
  const signer = createSignerFromKeypair(umi, fromWeb3JsKeypair(payer));
  umi.use(signerIdentity(signer, true));

  const ourMetadata = {
    name: "Roman11",
    symbol: "Roman11",
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
    isMutable: true,
    discriminator: 0,
    tokenStandard: TokenStandard.Fungible,
    collectionDetails: none<CollectionDetails>(),
    ruleSet: none<any>(), // Fix Type Error
    createV1Discriminator: 0,
    primarySaleHappened: true,
    decimals: none<number>(),
    printSupply: none<PrintSupply>(),
  };

  const tx = await createV1(umi, { ...accounts, ...data }).sendAndConfirm(umi);
  console.log("Metadata Created.");

  // 3. Mint Tokens
  console.log("Minting tokens...");
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

  // 4. Renounce
  console.log("Renouncing Ownership...");
  const renounceTx = new Transaction().add(
    createSetAuthorityInstruction(
      mintKeypair.publicKey,
      payer.publicKey,
      AuthorityType.MintTokens,
      null,
      [],
      TOKEN_2022_PROGRAM_ID
    ),
    createSetAuthorityInstruction(
      mintKeypair.publicKey,
      payer.publicKey,
      AuthorityType.TransferFeeConfig,
      null,
      [],
      TOKEN_2022_PROGRAM_ID
    )
  );
  const renounceSig = await sendAndConfirmTransaction(connection, renounceTx, [
    payer,
  ]);
  console.log(
    `Renounced: https://explorer.solana.com/tx/${renounceSig}?cluster=devnet`
  );

  console.log("\n--- DEPLOYMENT SUCCESS ---");
  console.log(`Mint: ${mintKeypair.publicKey.toBase58()}`);
  console.log(`Tax Wallet: ${taxWallet.publicKey.toBase58()}`);
}

main().catch(console.error);
