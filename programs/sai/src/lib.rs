use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, MintTo, Transfer, Burn as TokenBurn};
use std::ops::Deref;

declare_id!("SAi111111111111111111111111111111111111111");

#[program]
pub mod sai {
    use super::*;
    
    // Initialize a new CDP (Collateralized Debt Position)
    pub fn initialize_cdp(
        ctx: Context<InitializeCdp>,
        collateral_amount: u64,
        sai_amount: u64,
    ) -> Result<()> {
        let cdp = &mut ctx.accounts.cdp;
        let clock = Clock::get()?;
        
        // Set up the initial CDP data
        cdp.owner = ctx.accounts.owner.key();
        cdp.collateral_amount = collateral_amount;
        cdp.sai_debt = sai_amount;
        cdp.collateral_type = ctx.accounts.collateral_mint.key();
        cdp.created_at = clock.unix_timestamp;
        cdp.last_updated = clock.unix_timestamp;
        cdp.liquidated = false;
        
        // Transfer collateral from owner to the vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.owner_collateral.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        token::transfer(cpi_ctx, collateral_amount)?;
        
        // Mint SAI to the owner
        if sai_amount > 0 {
            let cpi_accounts = MintTo {
                mint: ctx.accounts.sai_mint.to_account_info(),
                to: ctx.accounts.owner_sai.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            };
            
            let seeds = &[
                b"mint_authority",
                &[ctx.bumps.mint_authority],
            ];
            let signer = &[&seeds[..]];
            
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new_with_signer(
                cpi_program,
                cpi_accounts,
                signer,
            );
            
            token::mint_to(cpi_ctx, sai_amount)?;
        }
        
        emit!(CDPCreatedEvent {
            cdp: cdp.key(),
            owner: cdp.owner,
            collateral_amount,
            sai_amount,
        });
        
        Ok(())
    }
    
    // Add collateral to an existing CDP
    pub fn add_collateral(
        ctx: Context<AddCollateral>,
        amount: u64,
    ) -> Result<()> {
        let cdp = &mut ctx.accounts.cdp;
        let clock = Clock::get()?;
        
        require!(
            cdp.owner == ctx.accounts.owner.key(),
            SaiError::Unauthorized
        );
        
        require!(!cdp.liquidated, SaiError::CdpLiquidated);
        
        // Transfer additional collateral
        let cpi_accounts = Transfer {
            from: ctx.accounts.owner_collateral.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        token::transfer(cpi_ctx, amount)?;
        
        // Update CDP data
        cdp.collateral_amount = cdp.collateral_amount.checked_add(amount)
            .ok_or(SaiError::MathOverflow)?;
        cdp.last_updated = clock.unix_timestamp;
        
        emit!(CollateralAddedEvent {
            cdp: cdp.key(),
            amount,
            new_total: cdp.collateral_amount,
        });
        
        Ok(())
    }
    
    // Draw additional SAI from a CDP (increase debt)
    pub fn draw_sai(
        ctx: Context<DrawSai>,
        amount: u64,
    ) -> Result<()> {
        let cdp = &mut ctx.accounts.cdp;
        let clock = Clock::get()?;
        
        require!(
            cdp.owner == ctx.accounts.owner.key(),
            SaiError::Unauthorized
        );
        
        require!(!cdp.liquidated, SaiError::CdpLiquidated);
        
        // Check collateralization ratio using oracle price data
        // For simplicity, we'll use a fixed ratio of 150%
        // In a real implementation, you'd use an oracle for price data
        let oracle_price = 100; // Simplified: 1 SOL = 100 SAI
        let current_collateral_value = cdp.collateral_amount.checked_mul(oracle_price)
            .ok_or(SaiError::MathOverflow)?;
        
        let new_debt = cdp.sai_debt.checked_add(amount)
            .ok_or(SaiError::MathOverflow)?;
            
        // Required collateral value is 150% of debt
        let required_collateral_value = new_debt.checked_mul(150)
            .ok_or(SaiError::MathOverflow)?
            .checked_div(100)
            .ok_or(SaiError::MathOverflow)?;
            
        require!(
            current_collateral_value >= required_collateral_value,
            SaiError::InsufficientCollateral
        );
        
        // Mint additional SAI
        let cpi_accounts = MintTo {
            mint: ctx.accounts.sai_mint.to_account_info(),
            to: ctx.accounts.owner_sai.to_account_info(),
            authority: ctx.accounts.mint_authority.to_account_info(),
        };
        
        let seeds = &[
            b"mint_authority",
            &[ctx.bumps.mint_authority],
        ];
        let signer = &[&seeds[..]];
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(
            cpi_program,
            cpi_accounts,
            signer,
        );
        
        token::mint_to(cpi_ctx, amount)?;
        
        // Update CDP data
        cdp.sai_debt = new_debt;
        cdp.last_updated = clock.unix_timestamp;
        
        emit!(SaiDrawnEvent {
            cdp: cdp.key(),
            amount,
            new_debt: cdp.sai_debt,
        });
        
        Ok(())
    }
    
    // Repay SAI to a CDP (decrease debt)
    pub fn repay_sai(
        ctx: Context<RepaySai>,
        amount: u64,
    ) -> Result<()> {
        let cdp = &mut ctx.accounts.cdp;
        let clock = Clock::get()?;
        
        require!(
            cdp.owner == ctx.accounts.owner.key(),
            SaiError::Unauthorized
        );
        
        require!(!cdp.liquidated, SaiError::CdpLiquidated);
        require!(amount <= cdp.sai_debt, SaiError::RepayTooMuch);
        
        // Burn SAI tokens
        let cpi_accounts = TokenBurn {
            mint: ctx.accounts.sai_mint.to_account_info(),
            from: ctx.accounts.owner_sai.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(
            cpi_program,
            cpi_accounts,
        );
        
        token::burn(cpi_ctx, amount)?;
        
        // Update CDP data
        cdp.sai_debt = cdp.sai_debt.checked_sub(amount)
            .ok_or(SaiError::MathOverflow)?;
        cdp.last_updated = clock.unix_timestamp;
        
        emit!(SaiRepaidEvent {
            cdp: cdp.key(),
            amount,
            new_debt: cdp.sai_debt,
        });
        
        Ok(())
    }
    
    // Close a CDP (must have zero debt)
    pub fn close_cdp(
        ctx: Context<CloseCDP>,
    ) -> Result<()> {
        let cdp = &ctx.accounts.cdp;
        
        require!(
            cdp.owner == ctx.accounts.owner.key(),
            SaiError::Unauthorized
        );
        
        require!(!cdp.liquidated, SaiError::CdpLiquidated);
        require!(cdp.sai_debt == 0, SaiError::OutstandingDebt);
        
        // Transfer collateral back to owner
        let seeds = &[
            b"vault_authority",
            &[ctx.bumps.vault_authority],
        ];
        let signer = &[&seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.owner_collateral.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(
            cpi_program,
            cpi_accounts,
            signer,
        );
        
        token::transfer(cpi_ctx, ctx.accounts.vault.amount)?;
        
        emit!(CDPClosedEvent {
            cdp: cdp.key(),
            owner: cdp.owner,
            collateral_returned: ctx.accounts.vault.amount,
        });
        
        Ok(())
    }
    
    // Liquidate an undercollateralized CDP
    pub fn liquidate_cdp(
        ctx: Context<LiquidateCDP>,
    ) -> Result<()> {
        let cdp = &mut ctx.accounts.cdp;
        let clock = Clock::get()?;
        
        require!(!cdp.liquidated, SaiError::CdpLiquidated);
        
        // Check if CDP is undercollateralized
        // In a real implementation, get price from an oracle
        let oracle_price = 100; // Simplified: 1 SOL = 100 SAI
        let current_collateral_value = cdp.collateral_amount.checked_mul(oracle_price)
            .ok_or(SaiError::MathOverflow)?;
        
        // Required collateral value is 150% of debt
        let required_collateral_value = cdp.sai_debt.checked_mul(150)
            .ok_or(SaiError::MathOverflow)?
            .checked_div(100)
            .ok_or(SaiError::MathOverflow)?;
            
        require!(
            current_collateral_value < required_collateral_value,
            SaiError::SufficientCollateral
        );
        
        // Mark as liquidated
        cdp.liquidated = true;
        cdp.last_updated = clock.unix_timestamp;
        
        // Burn liquidator's SAI in exchange for collateral
        // For simplicity, the liquidator pays off all debt
        let cpi_accounts = TokenBurn {
            mint: ctx.accounts.sai_mint.to_account_info(),
            from: ctx.accounts.liquidator_sai.to_account_info(),
            authority: ctx.accounts.liquidator.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(
            cpi_program,
            cpi_accounts,
        );
        
        token::burn(cpi_ctx, cdp.sai_debt)?;
        
        // Transfer liquidated collateral to liquidator
        // In a real implementation, you'd only transfer collateral based on a liquidation price
        let vault_auth_seeds = &[
            b"vault_authority",
            &[ctx.bumps.vault_authority],
        ];
        let vault_auth_signer = &[&vault_auth_seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.liquidator_collateral.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(
            cpi_program,
            cpi_accounts,
            vault_auth_signer,
        );
        
        token::transfer(cpi_ctx, ctx.accounts.vault.amount)?;
        
        emit!(CDPLiquidatedEvent {
            cdp: cdp.key(),
            liquidator: ctx.accounts.liquidator.key(),
            collateral_amount: cdp.collateral_amount,
            debt_amount: cdp.sai_debt,
        });
        
        Ok(())
    }
    
    // Initialize the SAI mint with a PDA as the mint authority
    pub fn initialize_sai_mint(
        ctx: Context<InitializeSaiMint>,
    ) -> Result<()> {
        // Initialize mint with mint authority as PDA
        Ok(())
    }
}

// Account Structures

#[account]
pub struct CDP {
    pub owner: Pubkey,
    pub collateral_type: Pubkey,
    pub collateral_amount: u64,
    pub sai_debt: u64,
    pub created_at: i64,
    pub last_updated: i64,
    pub liquidated: bool,
}

// Contexts

#[derive(Accounts)]
pub struct InitializeCdp<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        init,
        payer = owner,
        space = 8 + std::mem::size_of::<CDP>()
    )]
    pub cdp: Account<'info, CDP>,
    
    #[account(mut)]
    pub owner_collateral: Account<'info, TokenAccount>,
    
    pub collateral_mint: Account<'info, Mint>,
    
    #[account(
        init,
        payer = owner,
        seeds = [b"vault", cdp.key().as_ref()],
        bump,
        token::mint = collateral_mint,
        token::authority = vault_authority,
    )]
    pub vault: Account<'info, TokenAccount>,
    
    /// CHECK: PDA used as token account authority
    #[account(
        seeds = [b"vault_authority"],
        bump,
    )]
    pub vault_authority: AccountInfo<'info>,
    
    #[account(mut)]
    pub sai_mint: Account<'info, Mint>,
    
    #[account(
        mut,
        constraint = owner_sai.mint == sai_mint.key(),
        constraint = owner_sai.owner == owner.key(),
    )]
    pub owner_sai: Account<'info, TokenAccount>,
    
    /// CHECK: PDA used as mint authority
    #[account(
        seeds = [b"mint_authority"],
        bump,
    )]
    pub mint_authority: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct DrawSai<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        mut,
        has_one = owner
    )]
    pub cdp: Account<'info, CDP>,
    
    /// CHECK: Vault account (not needed for this operation but included for context)
    pub vault: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub sai_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub owner_sai: Account<'info, TokenAccount>,
    
    /// CHECK: This is the PDA that is the mint authority
    #[account(
        seeds = [b"mint_authority"],
        bump
    )]
    pub mint_authority: UncheckedAccount<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RepaySai<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        mut,
        has_one = owner
    )]
    pub cdp: Account<'info, CDP>,
    
    #[account(mut)]
    pub sai_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub owner_sai: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CloseCDP<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        mut,
        close = owner,
        constraint = cdp.owner == owner.key(),
    )]
    pub cdp: Account<'info, CDP>,
    
    #[account(mut)]
    pub owner_collateral: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [b"vault", cdp.key().as_ref()],
        bump,
        close = owner,
    )]
    pub vault: Account<'info, TokenAccount>,
    
    /// CHECK: PDA used as token account authority
    #[account(
        seeds = [b"vault_authority"],
        bump,
    )]
    pub vault_authority: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct LiquidateCDP<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,
    
    #[account(mut)]
    pub cdp: Account<'info, CDP>,
    
    #[account(mut)]
    pub liquidator_collateral: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub sai_mint: Account<'info, Mint>,
    
    #[account(
        mut,
        constraint = liquidator_sai.mint == sai_mint.key(),
        constraint = liquidator_sai.owner == liquidator.key(),
    )]
    pub liquidator_sai: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [b"vault", cdp.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,
    
    /// CHECK: PDA used as token account authority
    #[account(
        seeds = [b"vault_authority"],
        bump,
    )]
    pub vault_authority: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct InitializeSaiMint<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    
    #[account(
        init,
        payer = admin,
        mint::decimals = 6,
        mint::authority = mint_authority
    )]
    pub sai_mint: Account<'info, Mint>,
    
    /// CHECK: This is the PDA that will be the mint authority
    #[account(
        seeds = [b"mint_authority"],
        bump
    )]
    pub mint_authority: UncheckedAccount<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

// Events

#[event]
pub struct CDPCreatedEvent {
    pub cdp: Pubkey,
    pub owner: Pubkey,
    pub collateral_amount: u64,
    pub sai_amount: u64,
}

#[event]
pub struct CollateralAddedEvent {
    pub cdp: Pubkey,
    pub amount: u64,
    pub new_total: u64,
}

#[event]
pub struct SaiDrawnEvent {
    pub cdp: Pubkey,
    pub amount: u64,
    pub new_debt: u64,
}

#[event]
pub struct SaiRepaidEvent {
    pub cdp: Pubkey,
    pub amount: u64,
    pub new_debt: u64,
}

#[event]
pub struct CDPClosedEvent {
    pub cdp: Pubkey,
    pub owner: Pubkey,
    pub collateral_returned: u64,
}

#[event]
pub struct CDPLiquidatedEvent {
    pub cdp: Pubkey,
    pub liquidator: Pubkey,
    pub collateral_amount: u64,
    pub debt_amount: u64,
}

// Errors

#[error_code]
pub enum SaiError {
    #[msg("Unauthorized access")]
    Unauthorized,
    
    #[msg("CDP has already been liquidated")]
    CdpLiquidated,
    
    #[msg("Math overflow or underflow")]
    MathOverflow,
    
    #[msg("Trying to repay more than the outstanding debt")]
    RepayTooMuch,
    
    #[msg("Cannot close CDP with outstanding debt")]
    OutstandingDebt,
    
    #[msg("Collateralization ratio too low")]
    InsufficientCollateral,
    
    #[msg("Collateralization ratio is sufficient")]
    SufficientCollateral,
} 