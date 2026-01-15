use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;

declare_id!("BRB7E8vrFs4ux1LCwNT75h6KJ2jdhWy8KQcR4uNaJ4ZU");

#[program]
pub mod pay_request {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        request_id: u64,
        amount: u64,
        receiver_hash: [u8; 32],
    ) -> Result<()> {
        let pay_request = &mut ctx.accounts.pay_request;
        pay_request.receiver_hash = receiver_hash;
        pay_request.amount = amount;
        pay_request.request_id = request_id;
        pay_request.is_initialized = true;

        msg!("PayRequest initialized. Request ID: {}", request_id);
        msg!("Amount requested: {}", amount);

        Ok(())
    }

    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        let pay_request = &ctx.accounts.pay_request;
        let payer = &ctx.accounts.payer;
        let system_program = &ctx.accounts.system_program;

        // Verify the payer has enough funds
        // Transfer funds from payer to pay_request PDA
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &payer.key(),
            &pay_request.key(),
            pay_request.amount,
        );

        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                payer.to_account_info(),
                pay_request.to_account_info(),
                system_program.to_account_info(),
            ],
        )?;

        msg!("PayRequest settled. Amount: {}", pay_request.amount);

        Ok(())
    }

    pub fn sweep(ctx: Context<Sweep>) -> Result<()> {
        let pay_request = &mut ctx.accounts.pay_request;
        let receiver = &ctx.accounts.receiver;

        // Hash the receiver's public key
        let receiver_key_bytes = receiver.key().to_bytes();
        let derived_hash = keccak::hash(&receiver_key_bytes);

        // Verify the hash matches the stored receiver_hash
        // Note: Anchor's keccak::hash returns a Hash struct, we need the bytes
        require!(
            derived_hash.to_bytes() == pay_request.receiver_hash,
            PayRequestError::InvalidReceiver
        );

        // Transfer all funds from pay_request PDA to receiver
        // We use close mechanism to transfer all lamports (rent + balance)
        // verify closure happens automatically by Anchor with `close = receiver` constraint?
        // Actually, explicit logic is often clearer or if we want to keep the account open (we don't).
        // The `close = receiver` constraint on the account macro handles the transfer of all lamports.

        msg!("Funds swept to receiver: {}", receiver.key());

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(request_id: u64)]
pub struct Initialize<'info> {
    #[account(
        init,
        seeds = [b"request", request_id.to_le_bytes().as_ref()],
        bump,
        payer = payer,
        space = 8 + 32 + 8 + 8 + 1 // discriminator + hash + amount + id + bool
    )]
    pub pay_request: Account<'info, PayRequest>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(
        mut,
        seeds = [b"request", pay_request.request_id.to_le_bytes().as_ref()],
        bump
    )]
    pub pay_request: Account<'info, PayRequest>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Sweep<'info> {
    #[account(
        mut,
        close = receiver,
        seeds = [b"request", pay_request.request_id.to_le_bytes().as_ref()],
        bump
    )]
    pub pay_request: Account<'info, PayRequest>,

    // The receiver signer must match the hash stored in pay_request
    #[account(mut)]
    pub receiver: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct PayRequest {
    pub receiver_hash: [u8; 32],
    pub amount: u64,
    pub request_id: u64,
    pub is_initialized: bool,
}

#[error_code]
pub enum PayRequestError {
    #[msg("The signer does not match the hashed receiver.")]
    InvalidReceiver,
}
