import {
  updateV1,
  UpdateV1InstructionAccounts,
  UpdateV1InstructionData,
  Data,
  fetchDigitalAsset,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  createSignerFromKeypair,
  none,
  signerIdentity,
  some,
  publicKey,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  fromWeb3JsKeypair,
  fromWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";
import * as fs from "fs";
import * as os from "os";
import { Keypair, Connection } from "@solana/web3.js";

function loadKeypair(path: string): Keypair {
  const keypairData = JSON.parse(fs.readFileSync(path, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(keypairData));
}

async function main() {
  console.log("Renouncing Metadata Update Authority...");

  const homeDir = os.homedir();
  const payer = loadKeypair(`${homeDir}/.config/solana/id.json`);
  const mintAddress = publicKey("75hJRLXF6mwdYxauFaUxZPqdesZKxzV1D25ueG6FKeh9");

  const umi = createUmi("https://api.devnet.solana.com");
  const signer = createSignerFromKeypair(umi, fromWeb3JsKeypair(payer));
  umi.use(signerIdentity(signer, true));

  // 1. Fetch Existing Metadata
  const asset = await fetchDigitalAsset(umi, mintAddress);
  const md = asset.metadata;

  const onChainData: Data = {
    name: md.name,
    symbol: md.symbol,
    uri: md.uri,
    sellerFeeBasisPoints: md.sellerFeeBasisPoints,
    creators: md.creators,
  };

  console.log("Existing Data Fetched:", onChainData);

  const accounts: UpdateV1InstructionAccounts = {
    mint: mintAddress,
    authority: signer, // Current Authority
  };

  const args = {
    discriminator: 0,
    updateV1Discriminator: 0,
    newUpdateAuthority: none<any>(), // RENOUNCE
    data: none<Data>(),
    primarySaleHappened: none<boolean>(),
    isMutable: some(false), // Immutable
  };

  console.log(`Renouncing authority for Mint: ${mintAddress}`);
  const tx = await updateV1(umi, { ...accounts, ...args }).sendAndConfirm(umi);

  console.log("Metadata Update Authority Renounced.");
}

main().catch(console.error);
