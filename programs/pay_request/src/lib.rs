use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked,
};

declare_id!("4zwqn6RNDvjecyfYeeCK1D5XMW5uuM96k9pGbnvuPwTk");

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
        pay_request.mint = ctx.accounts.mint.key();
        pay_request.is_initialized = true;

        msg!("PayRequest initialized. Request ID: {}", request_id);
        msg!("Amount requested: {}", amount);
        msg!("Mint: {}", pay_request.mint);

        Ok(())
    }

    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        let pay_request = &ctx.accounts.pay_request;
        let payer = &ctx.accounts.payer;
        let token_program = &ctx.accounts.token_program;
        let mint = &ctx.accounts.mint;

        // Transfer funds from payer ATA to Vault ATA (owned by pay_request PDA)
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.payer_token_account.to_account_info(),
            mint: mint.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: payer.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(token_program.to_account_info(), cpi_accounts);
        token_interface::transfer_checked(cpi_ctx, pay_request.amount, mint.decimals)?;

        msg!("PayRequest settled. Amount: {}", pay_request.amount);

        Ok(())
    }

    pub fn sweep(ctx: Context<Sweep>) -> Result<()> {
        let pay_request = &ctx.accounts.pay_request;
        let receiver = &ctx.accounts.receiver;
        let token_program = &ctx.accounts.token_program;
        let mint = &ctx.accounts.mint;

        // 1. Verify Hash
        let receiver_key_bytes = receiver.key().to_bytes();
        let derived_hash = keccak::hash(&receiver_key_bytes);
        require!(
            derived_hash.to_bytes() == pay_request.receiver_hash,
            PayRequestError::InvalidReceiver
        );

        // 2. Transfer Tokens to Receiver
        let balance = ctx.accounts.vault_token_account.amount;
        if balance > 0 {
            let request_id_bytes = pay_request.request_id.to_le_bytes();
            let seeds = &[
                b"request",
                request_id_bytes.as_ref(),
                &[ctx.bumps.pay_request],
            ];
            let signer = &[&seeds[..]];

            let transfer_accounts = TransferChecked {
                from: ctx.accounts.vault_token_account.to_account_info(),
                mint: mint.to_account_info(),
                to: ctx.accounts.receiver_token_account.to_account_info(),
                authority: pay_request.to_account_info(),
            };
            let transfer_ctx = CpiContext::new_with_signer(
                token_program.to_account_info(),
                transfer_accounts,
                signer,
            );
            token_interface::transfer_checked(transfer_ctx, balance, mint.decimals)?;
        }

        // 3. DO NOT Close Vault Account (Token-2022 Transfer Fees prevent closing without harvesting)
        // msg!("Funds swept to receiver: {}", receiver.key());

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
        space = 8 + 32 + 8 + 8 + 32 + 1
    )]
    pub pay_request: Account<'info, PayRequest>,
    pub mint: InterfaceAccount<'info, Mint>,
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

    #[account(address = pay_request.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub payer_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = pay_request,
        associated_token::token_program = token_program
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct Sweep<'info> {
    #[account(
        mut,
        close = receiver, // This closes the PAY REQUEST PDA, not the vault ATA. This is correct.
        seeds = [b"request", pay_request.request_id.to_le_bytes().as_ref()],
        bump
    )]
    pub pay_request: Account<'info, PayRequest>,

    #[account(address = pay_request.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = pay_request,
        associated_token::token_program = token_program
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = receiver,
        associated_token::mint = mint,
        associated_token::authority = receiver,
        associated_token::token_program = token_program
    )]
    pub receiver_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub receiver: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[account]
pub struct PayRequest {
    pub receiver_hash: [u8; 32],
    pub amount: u64,
    pub request_id: u64,
    pub mint: Pubkey,
    pub is_initialized: bool,
}

#[error_code]
pub enum PayRequestError {
    #[msg("The signer does not match the hashed receiver.")]
    InvalidReceiver,
}
