use anchor_lang::prelude::*;
use anchor_spl::token::{self, TokenAccount, Token};
use pyth_sdk_solana::load_price_feed_from_account_info;

// SOL/USD Pyth price feed public key (Devnet)
const SOL_USD_PYTH_FEED: &str = "J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix";

// Program ID for the SOLidify protocol
#[program]
pub mod solidify {
    use super::*;

    // Instruction to check collateralization ratio and potentially mark for liquidation
    pub fn check_collateral_ratio(ctx: Context<CheckCollateralRatio>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        
        // Get SOL/USD price from Pyth
        let sol_usd_price = get_sol_price(&ctx.accounts.pyth_price_account)?;
        
        // Calculate the vault's collateral value in USD
        let collateral_value = (vault.collateral_amount as u128)
            .checked_mul(sol_usd_price as u128)
            .ok_or(ErrorCode::MathOverflow)?;
        
        // The debt is denominated in USD-pegged stablecoin ($SAI)
        let debt_value = vault.debt_amount as u128;
        
        // Calculate collateralization ratio (scaled by 10000 for precision)
        let collateralization_ratio = collateral_value
            .checked_mul(10000)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(debt_value)
            .ok_or(ErrorCode::DivisionByZero)?;
        
        // Log the current ratio
        msg!("Current collateralization ratio: {}%", collateralization_ratio / 100);
        
        // Check if ratio is below liquidation threshold of 110% (1.1 * 10000 = 11000)
        if collateralization_ratio < 11000 {
            msg!("Vault is under-collateralized. Marking for liquidation.");
            vault.liquidation_pending = true;
            
            // Emit liquidation event
            emit!(LiquidationEvent {
                vault: vault.key(),
                owner: vault.owner,
                collateral_amount: vault.collateral_amount,
                debt_amount: vault.debt_amount,
                collateralization_ratio: collateralization_ratio as u64,
                timestamp: Clock::get()?.unix_timestamp,
            });
        }
        
        Ok(())
    }

    // Other instructions...
}

// Function to get SOL price from Pyth
fn get_sol_price(pyth_price_account: &AccountInfo) -> Result<u64> {
    // Load the price feed
    let price_feed = load_price_feed_from_account_info(pyth_price_account)
        .map_err(|_| ErrorCode::InvalidOracleAccount)?;
    
    // Get the current price
    let price_data = price_feed.get_current_price()
        .ok_or(ErrorCode::NoCurrentPrice)?;
    
    // Check if the price is negative (this should never happen for SOL)
    if price_data.price < 0 {
        return Err(ErrorCode::NegativePrice.into());
    }
    
    // Check for stale prices (more than 60 seconds old)
    let current_timestamp = Clock::get()?.unix_timestamp;
    let price_publish_time = price_data.publish_time;
    
    if current_timestamp - price_publish_time > 60 {
        return Err(ErrorCode::StaleOracleData.into());
    }
    
    // Check confidence interval (price should be accurate within 5%)
    let confidence = price_data.conf as f64;
    let price = price_data.price as f64;
    
    if confidence / price > 0.05 {
        return Err(ErrorCode::PriceConfidenceTooLow.into());
    }
    
    // Convert price to u64, scaling if necessary
    // Pyth prices typically have a specific exponent that needs to be considered
    let exponent = price_data.expo;
    let scaled_price = (price * 10f64.powi(-exponent)) as u64;
    
    // Log the fetched price
    msg!("SOL/USD price: ${}", scaled_price);
    
    Ok(scaled_price)
}

// Accounts required for checking collateralization
#[derive(Accounts)]
pub struct CheckCollateralRatio<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    
    #[account(address = Pubkey::from_str(SOL_USD_PYTH_FEED).unwrap())]
    /// CHECK: This is the Pyth price account that we validate in the instruction
    pub pyth_price_account: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

// Vault account structure
#[account]
pub struct Vault {
    pub owner: Pubkey,
    pub collateral_mint: Pubkey,
    pub collateral_amount: u64,
    pub debt_amount: u64,
    pub last_updated: i64,
    pub liquidation_pending: bool,
}

// Event emitted when a vault is marked for liquidation
#[event]
pub struct LiquidationEvent {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub collateral_amount: u64,
    pub debt_amount: u64,
    pub collateralization_ratio: u64,
    pub timestamp: i64,
}

// Error codes
#[error_code]
pub enum ErrorCode {
    #[msg("Math overflow")]
    MathOverflow,
    
    #[msg("Division by zero")]
    DivisionByZero,
    
    #[msg("Invalid oracle account")]
    InvalidOracleAccount,
    
    #[msg("No current price available")]
    NoCurrentPrice,
    
    #[msg("Price cannot be negative")]
    NegativePrice,
    
    #[msg("Oracle data is stale")]
    StaleOracleData,
    
    #[msg("Price confidence too low")]
    PriceConfidenceTooLow,
} 