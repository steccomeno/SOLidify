use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, MintTo, Transfer, Burn};
use anchor_lang::solana_program::system_instruction;
use anchor_spl::token::spl_token::instruction::AuthorityType;

declare_id!("CB2Mj3T59QjuxmSaZyFyqJ3axfmT1Wk3s9jZyss1RvaA");

#[program]
pub mod sai {
    use super::*;
    
    // Initialize a new CDP (Collateralized Debt Position)
    pub fn initialize_cdp(
        ctx: Context<InitializeCdp>,
    ) -> Result<()> {
        let cdp = &mut ctx.accounts.cdp;
        let clock = Clock::get()?;
        
        // Set up the initial CDP data
        cdp.owner = ctx.accounts.owner.key();
        cdp.collateral_amount = 0;
        cdp.sai_debt = 0;
        cdp.collateral_type = *b"SOL\0"; // Fixed size array for "SOL\0"
        cdp.created_at = clock.unix_timestamp;
        cdp.last_updated_at = clock.unix_timestamp;
        cdp.status = CdpStatus::Active;
        
        Ok(())
    }
    
    // Initialize the vault for a new CDP
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        collateral_amount: u64,
        sai_amount: u64,
    ) -> Result<()> {
        let cdp = &mut ctx.accounts.cdp;
        let clock = Clock::get()?;
        
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
            
            let seeds = &[b"mint_authority".as_ref(), &[*ctx.bumps.get("mint_authority").unwrap()]];
            let signer = &[&seeds[..]];
            
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new_with_signer(
                cpi_program,
                cpi_accounts,
                signer,
            );
            
            token::mint_to(cpi_ctx, sai_amount)?;
        }
        
        // Update CDP data
        cdp.collateral_amount = collateral_amount;
        cdp.sai_debt = sai_amount;
        cdp.last_updated_at = clock.unix_timestamp;
        
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
        
        require!(cdp.status != CdpStatus::Liquidated, SaiError::CdpLiquidated);
        
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
        cdp.last_updated_at = clock.unix_timestamp;
        
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
        
        require!(cdp.status != CdpStatus::Liquidated, SaiError::CdpLiquidated);
        
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
        
        let seeds = &[b"mint_authority".as_ref(), &[*ctx.bumps.get("mint_authority").unwrap()]];
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
        cdp.last_updated_at = clock.unix_timestamp;
        
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
        
        require!(cdp.status != CdpStatus::Liquidated, SaiError::CdpLiquidated);
        require!(amount <= cdp.sai_debt, SaiError::RepayTooMuch);
        
        // Burn SAI tokens
        let cpi_accounts = Burn {
            from: ctx.accounts.owner_sai.to_account_info(),
            mint: ctx.accounts.sai_mint.to_account_info(),
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
        cdp.last_updated_at = clock.unix_timestamp;
        
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
        
        require!(cdp.status != CdpStatus::Liquidated, SaiError::CdpLiquidated);
        require!(cdp.sai_debt == 0, SaiError::OutstandingDebt);
        
        // Transfer collateral back to owner
        let vault_auth_seeds = &[b"vault_authority".as_ref(), &[*ctx.bumps.get("vault_authority").unwrap()]];
        let vault_auth_signer = &[&vault_auth_seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.owner_collateral.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(
            cpi_program,
            cpi_accounts,
            vault_auth_signer,
        );
        
        token::transfer(cpi_ctx, cdp.collateral_amount)?;
        
        emit!(CDPClosedEvent {
            cdp: cdp.key(),
            owner: cdp.owner,
            collateral_returned: cdp.collateral_amount,
        });
        
        Ok(())
    }
    
    // Liquidate an undercollateralized CDP
    pub fn liquidate_cdp(
        ctx: Context<LiquidateCDP>,
    ) -> Result<()> {
        let cdp = &mut ctx.accounts.cdp;
        let clock = Clock::get()?;
        
        require!(cdp.status != CdpStatus::Liquidated, SaiError::CdpLiquidated);
        
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
        cdp.status = CdpStatus::Liquidated;
        cdp.last_updated_at = clock.unix_timestamp;
        
        // Burn liquidator's SAI in exchange for collateral
        // For simplicity, the liquidator pays off all debt
        let cpi_accounts = Burn {
            from: ctx.accounts.liquidator_sai.to_account_info(),
            mint: ctx.accounts.sai_mint.to_account_info(),
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
        let vault_auth_seeds = &[b"vault_authority".as_ref(), &[*ctx.bumps.get("vault_authority").unwrap()]];
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
    pub fn initialize_sai_mint(ctx: Context<InitializeSaiMint>) -> Result<()> {
        // Set mint authority to the PDA
        token::set_authority(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::SetAuthority {
                    account_or_mint: ctx.accounts.sai_mint.to_account_info(),
                    current_authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            AuthorityType::MintTokens,
            Some(ctx.accounts.mint_authority.key()),
        )?;

        Ok(())
    }

    pub fn initialize(ctx: Context<Initialize>, _collateral_ratio: u64) -> Result<()> {
        let cdp = &mut ctx.accounts.cdp;
        let clock = Clock::get()?;
        
        // Initialize CDP state
        cdp.collateral_type = *b"SOL\0"; // Fixed size array for "SOL\0"
        cdp.collateral_amount = 0;
        cdp.sai_debt = 0;
        cdp.created_at = clock.unix_timestamp;
        cdp.last_updated_at = clock.unix_timestamp;
        cdp.owner = ctx.accounts.payer.key();
        cdp.status = CdpStatus::Active;

        // Set mint authority using PDA's authority
        let mint_auth_seeds = &[b"mint_authority".as_ref(), &[*ctx.bumps.get("mint_authority").unwrap()]];
        let mint_auth_signer = &[&mint_auth_seeds[..]];

        token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::SetAuthority {
                    account_or_mint: ctx.accounts.sai_mint.to_account_info(),
                    current_authority: ctx.accounts.mint_authority.to_account_info(),
                },
                mint_auth_signer,
            ),
            AuthorityType::MintTokens,
            Some(ctx.accounts.mint_authority.key()),
        )?;

        Ok(())
    }

    pub fn create_vault(ctx: Context<CreateVault>, amount: u64) -> Result<()> {
        // Transfer collateral to vault
        let transfer_ix = system_instruction::transfer(
            &ctx.accounts.user.key(),
            &ctx.accounts.vault.key(),
            amount,
        );

        anchor_lang::solana_program::program::invoke(
            &transfer_ix,
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Create vault account
        let vault_account = &mut ctx.accounts.vault_account;
        vault_account.owner = ctx.accounts.user.key();
        vault_account.collateral_amount = amount;
        vault_account.debt_amount = 0;
        vault_account.last_update = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn mint_sai(ctx: Context<MintSai>, amount: u64) -> Result<()> {
        let vault_account = &mut ctx.accounts.vault_account;
        let vault = &ctx.accounts.vault;

        // Calculate collateralization ratio
        let collateral_value = vault_account.collateral_amount;
        let debt_value = vault_account.debt_amount + amount;
        let ratio = (collateral_value * 100) / debt_value;

        require!(
            ratio >= vault.liquidation_threshold,
            SaiError::InsufficientCollateral
        );

        // Mint SAI tokens
        token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::MintTo {
                    mint: ctx.accounts.sai_mint.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;

        // Update vault state
        vault_account.debt_amount += amount;
        vault_account.last_update = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn withdraw_collateral(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
        let vault_account = &mut ctx.accounts.vault_account;
        let vault = &ctx.accounts.vault;

        // Calculate new collateralization ratio
        let new_collateral = vault_account.collateral_amount - amount;
        let ratio = (new_collateral * 100) / vault_account.debt_amount;

        require!(
            ratio >= vault.liquidation_threshold,
            SaiError::InsufficientCollateral
        );

        // Transfer collateral back to user
        **vault_account.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.user.to_account_info().try_borrow_mut_lamports()? += amount;

        // Update vault state
        vault_account.collateral_amount -= amount;
        vault_account.last_update = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn liquidate(ctx: Context<Liquidate>, amount: u64) -> Result<()> {
        // Transfer SAI tokens from liquidator to protocol
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.liquidator_sai.to_account_info(),
                to: ctx.accounts.protocol_sai.to_account_info(),
                authority: ctx.accounts.liquidator.to_account_info(),
            },
        );
        anchor_spl::token::transfer(transfer_ctx, amount)?;

        // Burn SAI tokens
        let burn_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Burn {
                mint: ctx.accounts.sai_mint.to_account_info(),
                from: ctx.accounts.protocol_sai.to_account_info(),
                authority: ctx.accounts.protocol.to_account_info(),
            },
        );
        anchor_spl::token::burn(burn_ctx, amount)?;

        // Update protocol state
        let protocol = &mut ctx.accounts.protocol;
        protocol.total_sai_burned = protocol.total_sai_burned.checked_add(amount).unwrap();
        protocol.total_sai_supply = protocol.total_sai_supply.checked_sub(amount).unwrap();

        emit!(LiquidationEvent {
            liquidator: ctx.accounts.liquidator.key(),
            amount,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

// Account Structures

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum CdpStatus {
    Active,
    Liquidated,
}

#[account]
pub struct CDP {
    pub owner: Pubkey,
    pub collateral_amount: u64,
    pub sai_debt: u64,
    pub collateral_type: [u8; 4], // Fixed size array for "SOL\0"
    pub created_at: i64,
    pub last_updated_at: i64,
    pub status: CdpStatus,
}

impl CDP {
    pub const LEN: usize = 8 + // discriminator
                          32 + // owner (Pubkey)
                          8 + // collateral_amount (u64)
                          8 + // sai_debt (u64)
                          4 + // collateral_type ([u8; 4])
                          4 + // padding for alignment
                          8 + // created_at (i64)
                          8 + // last_updated_at (i64)
                          1 + // status (CdpStatus enum - 1 byte for variant)
                          7; // padding for alignment to 8-byte boundary
}

// Contexts

#[derive(Accounts)]
pub struct InitializeCdp<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        init,
        payer = owner,
        space = CDP::LEN,
        seeds = [b"cdp", owner.key().as_ref()],
        bump,
    )]
    pub cdp: Account<'info, CDP>,
    
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(mut)]
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
        seeds = [b"vault_authority", cdp.key().as_ref()],
        bump
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
        bump
    )]
    pub mint_authority: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct AddCollateral<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        mut,
        has_one = owner
    )]
    pub cdp: Account<'info, CDP>,
    
    #[account(mut)]
    pub owner_collateral: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [b"vault", cdp.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
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
        seeds = [b"vault_authority", cdp.key().as_ref()],
        bump
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
        seeds = [b"vault_authority", cdp.key().as_ref()],
        bump
    )]
    pub vault_authority: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct InitializeSaiMint<'info> {
    #[account(
        mut,
        constraint = sai_mint.decimals == 6,
        constraint = sai_mint.mint_authority.unwrap() == payer.key(),
    )]
    pub sai_mint: Account<'info, Mint>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: This is the PDA that will be the mint authority
    #[account(
        seeds = [b"mint_authority"],
        bump
    )]
    pub mint_authority: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = CDP::LEN,
        seeds = [b"cdp", payer.key().as_ref()],
        bump
    )]
    pub cdp: Account<'info, CDP>,
    #[account(
        mut,
        constraint = sai_mint.decimals == 6,
    )]
    pub sai_mint: Account<'info, Mint>,
    /// CHECK: This is safe because we're just using it as a PDA for signing
    #[account(
        seeds = [b"mint_authority"],
        bump,
    )]
    pub mint_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CreateVault<'info> {
    #[account(init, payer = user, space = 8 + VaultAccount::LEN)]
    pub vault_account: Account<'info, VaultAccount>,
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintSai<'info> {
    #[account(mut)]
    pub vault_account: Account<'info, VaultAccount>,
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub sai_mint: Account<'info, Mint>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawCollateral<'info> {
    #[account(mut)]
    pub vault_account: Account<'info, VaultAccount>,
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub user: Signer<'info>,
}

#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub sai_mint: Pubkey,
    pub sai_token_account: Pubkey,
    pub collateral_mint: Pubkey,
    pub collateral_token_account: Pubkey,
    pub liquidation_threshold: u64,
    pub liquidation_penalty: u64,
    pub stability_fee: u64,
    pub total_debt: u64,
    pub total_collateral: u64,
}

impl Vault {
    pub const LEN: usize = 32 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 8;
}

#[account]
pub struct VaultAccount {
    pub owner: Pubkey,
    pub collateral_amount: u64,
    pub debt_amount: u64,
    pub last_update: i64,
}

impl VaultAccount {
    pub const LEN: usize = 32 + 8 + 8 + 8;
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

#[event]
pub struct LiquidationEvent {
    pub liquidator: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
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

#[account]
pub struct Protocol {
    pub total_sai_burned: u64,
    pub total_sai_supply: u64,
}

impl Protocol {
    pub const LEN: usize = 8 + // total_sai_burned
                          8; // total_sai_supply
}

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut)]
    pub sai_mint: Account<'info, Mint>,
    #[account(mut)]
    pub protocol_sai: Account<'info, TokenAccount>,
    #[account(mut)]
    pub liquidator_sai: Account<'info, TokenAccount>,
    #[account(mut)]
    pub liquidator: Signer<'info>,
    pub token_program: Program<'info, Token>,
} 