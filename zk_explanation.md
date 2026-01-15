# Pay Request Privacy with Light Protocol & ZK Compression

To make the Pay Request system untraceable, we use **Light Protocol (ZK Compression)**. This is the optimal architecture for privacy and cost on Solana.

## Overview
Instead of standard PDAs (accounts), we use **Compressed Accounts** to store the pending payments. This breaks the on-chain link between the Payer and final Receiver.

## Architecture

### 1. Setup (Off-Chain)
*   **Receiver** generates a **Light Shielded Address**. This address is distinct from their standard SOL public key.
*   **Request Creation**: The Pay Request includes this Shielded Address (encrypted or hashed) instead of a standard public key.

### 2. Settle (The "Compression" Event)
*   **Action**: Payer sends SOL to the Pay Request Program.
*   **Logic**: The program invokes the **Light Protocol CPI** to "compress" this SOL.
*   **On-Chain Result**: 
    *   Funds move to the Light Protocol State/Vault.
    *   A new **Compressed UTXO** (Unspent Transaction Output) is created, owned by the Receiver's Shielded Address.
    *   **Privacy**: Observers see `Payer -> Light Protocol`. The destination is encrypted within the compressed state. The Payer's deposit is mixed with thousands of other Light Protocol transactions, providing a large anonymity set.

### 3. Sweep (The "Decompression" Event)
*   **Action**: Receiver wants to withdraw funds to a standard SOL wallet (or keeping them private).
*   **Logic**: Receiver generates a **Zero-Knowledge Validity Proof** locally (using Light SDK).
    *   *Proof Statement*: "I own a UTXO in the compressed state worth X SOL, and I authorize moving it."
*   **Transaction**: Receiver (or a Relayer) submits this proof on-chain.
*   **On-Chain Result**: 
    *   Light Protocol verifies the proof.
    *   Funds are "decompressed" and sent to the target wallet (e.g., a fresh exchange deposit address).
    *   **Privacy**: The link between the original Payer and this withdrawal is cryptographic and zero-knowledge. There is no public graph connecting them.

## Why this is the Best Solution
1.  **Shared Anonymity Set**: Your users hide within the global traffic of Light Protocol, not just your specific app's volume.
2.  **Zero PDA Rent**: Compressed accounts cost virtually nothing to create and store, unlike standard PDAs which require rent-exemption (~0.002 SOL).
3.  **Low Complexity**: No need to write custom Circom circuits or manage complex Merkle trees. We leverage the battle-tested infrastructure of Light Protocol.
