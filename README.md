# Pay Request Program (SPL Token-2022)

A privacy-focused payment request system on Solana, designed to support SPL Token-2022 features (like Transfer Fees) while obscuring the receiver's identity until the moment of claim.

## Core Concept: "Receiver Hashing"

The central privacy mechanism is **Receiver Hashing**. Instead of storing the receiver's Public Key on-chain (which is visible to everyone), the program stores a **Hash** (a one-way fingerprint) of their key.

This ensures that observers cannot link a Pay Request to a specific receiver just by looking at the on-chain account data.

### The State (`PayRequest`)

The "invoice" stored on Solana:

```rust
#[account]
pub struct PayRequest {
    pub receiver_hash: [u8; 32], // The "Fingerprint" of the receiver (SHA-256/Keccak)
    pub amount: u64,             // Amount to pay
    pub request_id: u64,         // Unique ID
    pub mint: Pubkey,            // Token Mint (e.g., Romeoscript)
    pub is_initialized: bool,
}
```

## Workflow

The process consists of three distinct instructions:

### 1. `initialize` (The Setup)
Creates the Pay Request PDA.

*   **Action:** Payer initializes the account with the `amount` and the `receiver_hash`.
*   **Privacy:** The `receiver_hash` is calculated off-chain. The blockchain **never sees** the real receiver address in this transaction.

### 2. `settle` (The Payment)
Moves funds from the Payer to a temporary **Vault**.

*   **Action:** Transfers tokens from Payer → Vault (owned by the PDA).
*   **Token-2022:** Uses `token_interface::transfer_checked`. This supports both Standard SPL Tokens and **Token-2022** (like Romeoscript). It automatically handles **Transfer Fees** (e.g., if you send 10 tokens and there is a 5% fee, the vault receives 9.5).
*   **Privacy:** Observers see funds moving to a program PDA, not to a specific user.

### 3. `sweep` (The Claim)
The Receiver reveals themselves to claim the funds.

*   **Validation:** The program verifies the signer's identity against the stored hash:
    ```rust
    // Hashes the signer's key and checks if it matches the stored fingerprint
    require!(keccak::hash(&receiver_key_bytes) == pay_request.receiver_hash, ...);
    ```
*   **Action:** Transfers funds Vault → Receiver.
*   **Vault State:** For Token-2022, the Vault account is emptied but **remains open**. This is because accounts with withheld transfer fees cannot be closed without the Mint Authority harvesting them first.

## Technical Key Features

### `InterfaceAccount`
We use `InterfaceAccount<'info, Mint>` instead of `Account`. This enables the program to interact with the **Token-2022** program (Romeoscript) seamlessly, supporting extensions like Transfer Fees and Interest.

### `AssociatedToken` Constraints
Explicit constraints ensure the Vault's Associated Token Account (ATA) is created using the correct Token Program ID:
```rust
associated_token::token_program = token_program
```
This is critical for ensuring compatibility with Token-2022 assets.

## Running the Demo

Prerequisites:
- Solana CLI configured for Devnet.
- Node.js & Yarn/NPM installed.

**1. Initialize Request:**
```bash
npm run demo:init
```

**2. Process Payment (Settle & Sweep):**
```bash
npm run demo:process
```
