# Making Pay Request Less Traceable with Zero-Knowledge Proofs

## Overview
Currently, the Pay Request system uses a PDA specific to a `request_id`. An observer can track the flow of funds: `Payer -> PayRequest PDA -> Receiver`. This makes the transaction linkable.

To break this link, we can implement a **Shielded Pool** using ZK-SNARKs. The core idea is to decouple the deposit (Settlement) from the withdrawal (Sweep).

## Architecture

We introduce a global **Shielded Pool Account** that holds funds for all requests, governed by a Merkle Tree.

### 3rd Parties: The Relayer
To ensure the Receiver's destination wallet remains anonymous, it cannot hold any SOL to pay for the "Sweep" transaction gas (funding it from a known wallet would reveal its identity).
*   **Role**: Submits the ZK proof and the sweep transaction on-chain.
*   **Incentive**: Takes a small fee from the swept amount.
*   **Trust**: Minimal. The Relayer cannot steal funds (guaranteed by the ZK proof) nor censor indefinitely (Receiver can use another relayer or paying gas themselves if they don't care about gas-linkability).

### Circuits & Logic

We utilize a **Join-Split** style circuit (similar to Tornado Cash or SPL Token-2022 Confidential Transfers).

#### 1. Setup (Off-chain)
*   The Receiver generates two random secrets:
    *   `secret_key`: Private key to control funds.
    *   `nullifier_key`: Private key to prevent double spending.
*   They compute a **Commitment**: `C = Hash(secret_key, nullifier_key)`.
*   The Receiver generates the "Pay Request" containing this `Commitment`.

#### 2. Settle (On-chain Deposit)
*   **Payer** calls `settle(amount, commitment)`.
*   **Program**:
    *   Transfers `amount` from Payer to the **Shielded Pool**.
    *   Inserts `commitment` into the on-chain **Merkle Tree**.
    *   Emits an event with the specific Merkle Leaf Index.
*   **Privacy**: The Payer knows which commitment they funded, but the on-chain link only shows `Payer -> Shielded Pool`.

#### 3. Proving (Off-chain)
*   Receiver waits for the deposit.
*   Receiver constructs a **Zero-Knowledge Proof** (?) satisfying:
    *   "I know `secret_key` and `nullifier_key` such that `Hash(secret_key, nullifier_key)` is a leaf in the Merkle Tree Root `R`."
    *   "The `NullifierHash = Hash(nullifier_key)` is unique."
*   **Public Inputs**: `Merkle Root`, `Nullifier Hash`, `Recipient Address`, `Relayer Address`, `Fee`.
*   **Private Inputs**: `secret_key`, `nullifier_key`, `Merkle Path`.

#### 4. Sweep (On-chain Withdrawal)
*   Receiver sends the Proof and Public Inputs to a **Relayer**.
*   **Relayer** submits `sweep(proof, public_inputs)` to the Program.
*   **Program**:
    *   Verifies the ZK Proof against the current (or recent) Merkle Root.
    *   Checks that `Nullifier Hash` has not been seen before (prevent double-spend).
    *   Records `Nullifier Hash` as seen.
    *   Transfers `amount - fee` to `Recipient Address`.
    *   Transfers `fee` to `Relayer Address`.
    
## Result
*   **Observer sees**: `Payer` deposited into `Shielded Pool`. Later, `Relayer` extracted funds to `Recipient`.
*   **Linkability**: There is no cryptographic link between the `commitment` (Deposit) and the `nullifier` (Withdrawal). The privacy set is equal to the number of unspent notes in the pool.
