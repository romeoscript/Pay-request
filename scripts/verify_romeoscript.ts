import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fetchDigitalAsset } from "@metaplex-foundation/mpl-token-metadata";
import { publicKey } from "@metaplex-foundation/umi";

async function main() {
  const umi = createUmi("https://api.devnet.solana.com");
  // Romeoscript Mint
  const mintAddress = publicKey("75hJRLXF6mwdYxauFaUxZPqdesZKxzV1D25ueG6FKeh9");

  console.log(`Verifying Mint: ${mintAddress}`);
  try {
    const asset = await fetchDigitalAsset(umi, mintAddress);
    console.log("\n--- Metadata Verified ---");
    console.log("Name:", asset.metadata.name);
    console.log("Symbol:", asset.metadata.symbol);
    console.log("Uri:", asset.metadata.uri);
    console.log("Mint Authority:", asset.mint.mintAuthority);
    console.log("Update Authority:", asset.metadata.updateAuthority);
    console.log("Is Mutable:", asset.metadata.isMutable);
  } catch (e) {
    console.error("Failed to fetch metadata:", e);
  }
}

main().catch(console.error);
