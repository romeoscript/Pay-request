use anchor_lang::prelude::*;

declare_id!("BRB7E8vrFs4ux1LCwNT75h6KJ2jdhWy8KQcR4uNaJ4ZU");

#[program]
pub mod pay_request {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
