# Scripts Documentation

This folder contains scripts for deploying and managing the project's tokens.

## `deploy_alpha.ts`

**Purpose**: Deploys the "Alpha" Token (Token-2022) with specific parameters.

**Features**:
- **Ticker**: Alpha
- **Total Supply**: 1,000,000 (Fixed/Capped)
- **Tax**: 5% on every transfer.
- **Renounced Ownership**: The Mint Authority and Transfer Fee Config Authority are renounced (set to `null`) after deployment. This means no more tokens can ever be minted, and the 5% tax is immutable.
- **Tax Wallet**: A new wallet is generated to collect the 5% tax. **Check the console output for the Secret Key.**

**Usage**:
```bash
npx ts-node scripts/deploy_alpha.ts
```

### Detailed Script Breakdown

1.  **Mint Creation**: Initializes the Mint Account with **Transfer Fee Config**, setting the 5% tax and designating the tax wallet.
2.  **Metadata**: Uses Metaplex Umi to set the on-chain name ("Alpha") and symbol.
3.  **Minting**: Mints the entire fixed supply (1,000,000) to the deployer's wallet.
4.  **Renouncement**:
    *   Sets **Mint Authority** to `null` (Preventing future minting).
    *   Sets **Transfer Fee Config Authority** to `null` (Locking the tax rate at 5% forever).
