import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fetchDigitalAsset } from "@metaplex-foundation/mpl-token-metadata";
import { publicKey } from "@metaplex-foundation/umi";

async function main() {
  const umi = createUmi("https://api.devnet.solana.com");
  // Replace with your mint address if needed
  const mintAddress = publicKey("EYMGHnVP9C1o54SjeuUui82nSvy4v8716zcQkrjkdG59");

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
