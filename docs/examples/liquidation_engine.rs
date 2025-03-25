use anchor_lang::prelude::*;
use anchor_lang::solana_program::clock::Clock;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};
use std::convert::TryFrom;

// Import Pyth SDK for price oracle data
use pyth_sdk_solana::PriceAccount;

// Constants
const LIQUIDATION_THRESHOLD: u64 = 110; // 110% collateralization ratio
const PYTH_STALENESS_THRESHOLD: i64 = 60; // 60 seconds
const PRICE_CONFIDENCE_THRESHOLD: f64 = 0.05; // 5%
const AUCTION_DURATION: i64 = 3600; // 1 hour in seconds
const INSTANT_BUY_PREMIUM: u64 = 5; // 5% premium for instant buy

// Pyth price feed ID for SOL/USD
const SOL_USD_PRICE_FEED: &str = "J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix";

#[account]
pub struct Vault {
    pub owner: Pubkey,
    pub collateral_mint: Pubkey,
    pub collateral_amount: u64,
    pub debt_amount: u64,
    pub last_updated: i64,
    pub liquidation_pending: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum AuctionStatus {
    Pending,
    Active,
    Completed,
    Cancelled,
}

#[account]
pub struct Auction {
    pub vault: Pubkey,
    pub status: AuctionStatus,
    pub collateral_amount: u64,
    pub debt_amount: u64,
    pub start_price: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub liquidator: Pubkey,
    pub current_highest_bidder: Pubkey,
    pub current_highest_bid: u64,
}

#[event]
pub struct LiquidationEvent {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub collateral_amount: u64,
    pub debt_amount: u64,
    pub liquidator: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuctionStartedEvent {
    pub auction: Pubkey,
    pub vault: Pubkey,
    pub collateral_amount: u64,
    pub debt_amount: u64,
    pub start_price: u64,
    pub liquidator: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct BidPlacedEvent {
    pub auction: Pubkey,
    pub bidder: Pubkey,
    pub bid_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct AuctionCompletedEvent {
    pub auction: Pubkey,
    pub vault: Pubkey,
    pub winner: Pubkey,
    pub winning_bid: u64,
    pub collateral_amount: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Vault is not eligible for liquidation")]
    NotEligibleForLiquidation,
    #[msg("Auction already exists for this vault")]
    AuctionAlreadyExists,
    #[msg("Auction not found")]
    AuctionNotFound,
    #[msg("Auction is not active")]
    AuctionNotActive,
    #[msg("Bid too low")]
    BidTooLow,
    #[msg("Auction already ended")]
    AuctionEnded,
    #[msg("Auction not ended yet")]
    AuctionNotEnded,
    #[msg("Insufficient funds for bid")]
    InsufficientFunds,
    #[msg("Only liquidator can cancel auction")]
    OnlyLiquidatorCanCancel,
    #[msg("Only bidder can claim collateral")]
    OnlyBidderCanClaimCollateral,
    #[msg("Overflow in calculation")]
    MathOverflow,
    #[msg("Oracle price data is stale")]
    StaleOracleData,
    #[msg("Oracle price confidence is too low")]
    PriceConfidenceTooLow,
    #[msg("Division by zero")]
    DivisionByZero,
    #[msg("Invalid collateral mint")]
    InvalidCollateralMint,
}

pub fn check_collateral_ratio(
    vault: &mut Vault,
    price_feed_account: AccountInfo,
) -> Result<()> {
    // Get the current SOL price in USD from Pyth
    let sol_price = get_sol_price(&price_feed_account)?;
    
    // Calculate vault's collateral value in USD
    let collateral_value = u128::from(vault.collateral_amount)
        .checked_mul(sol_price as u128)
        .ok_or(ErrorCode::MathOverflow)?;
    
    // Calculate collateralization ratio (debt_amount is in SAI, assumed 1:1 with USD)
    let ratio = collateral_value
        .checked_mul(100)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(u128::from(vault.debt_amount))
        .ok_or(ErrorCode::DivisionByZero)?;
    
    // Check if ratio is below liquidation threshold
    if ratio < LIQUIDATION_THRESHOLD.into() {
        // Mark the vault for liquidation
        vault.liquidation_pending = true;
        return Ok(());
    }
    
    vault.liquidation_pending = false;
    Ok(())
}

fn get_sol_price(pyth_price_info: &AccountInfo) -> Result<u64> {
    // Parse the Pyth price account
    let price_account = PriceAccount::try_from(pyth_price_info)?;
    
    // Get the current timestamp
    let current_time = Clock::get()?.unix_timestamp;
    
    // Check for stale data
    if current_time - price_account.publish_time > PYTH_STALENESS_THRESHOLD {
        return Err(ErrorCode::StaleOracleData.into());
    }
    
    // Get the price and confidence interval
    let price = price_account.get_price_unchecked();
    let conf = price_account.get_confidence_interval();
    
    // Check if confidence is acceptable (< 5% of price)
    let confidence_ratio = conf as f64 / price.abs() as f64;
    if confidence_ratio > PRICE_CONFIDENCE_THRESHOLD {
        return Err(ErrorCode::PriceConfidenceTooLow.into());
    }
    
    // Convert to a usable u64 format
    // Pyth prices are signed integers with an exponent, so conversion is needed
    let exponent = price_account.expo;
    let adjusted_price = if exponent >= 0 {
        (price as u64)
            .checked_mul(10_u64.checked_pow(exponent as u32).unwrap())
            .ok_or(ErrorCode::MathOverflow)?
    } else {
        (price as u64)
            .checked_div(10_u64.checked_pow((-exponent) as u32).unwrap())
            .ok_or(ErrorCode::MathOverflow)?
    };
    
    Ok(adjusted_price)
}

pub fn liquidate_vault(
    ctx: Context<LiquidateVault>,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let liquidator = ctx.accounts.liquidator.key();
    let clock = Clock::get()?;
    
    // Check if vault is eligible for liquidation
    if !vault.liquidation_pending {
        return Err(ErrorCode::NotEligibleForLiquidation.into());
    }
    
    // Create an auction for the liquidation
    let auction = &mut ctx.accounts.auction;
    
    // Set auction parameters
    auction.vault = vault.key();
    auction.status = AuctionStatus::Active;
    auction.collateral_amount = vault.collateral_amount;
    auction.debt_amount = vault.debt_amount;
    
    // Start price at 150% of debt amount
    auction.start_price = vault.debt_amount
        .checked_mul(150)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(100)
        .ok_or(ErrorCode::MathOverflow)?;
    
    auction.start_time = clock.unix_timestamp;
    auction.end_time = clock.unix_timestamp
        .checked_add(AUCTION_DURATION)
        .ok_or(ErrorCode::MathOverflow)?;
    
    auction.liquidator = liquidator;
    auction.current_highest_bidder = Pubkey::default();
    auction.current_highest_bid = 0;
    
    // Emit event
    emit!(AuctionStartedEvent {
        auction: auction.key(),
        vault: vault.key(),
        collateral_amount: auction.collateral_amount,
        debt_amount: auction.debt_amount,
        start_price: auction.start_price,
        liquidator,
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

pub fn get_current_price(auction: &Auction, current_time: i64) -> Result<u64> {
    // If auction has ended, return the debt amount
    if current_time >= auction.end_time {
        return Ok(auction.debt_amount);
    }
    
    // Calculate how far along the auction is (0 to 1)
    let auction_duration = auction.end_time
        .checked_sub(auction.start_time)
        .ok_or(ErrorCode::MathOverflow)?;
    
    let elapsed_time = current_time
        .checked_sub(auction.start_time)
        .ok_or(ErrorCode::MathOverflow)?;
    
    let progress = (elapsed_time as f64) / (auction_duration as f64);
    
    // Linearly interpolate between start_price and debt_amount
    let price_drop = auction.start_price
        .checked_sub(auction.debt_amount)
        .ok_or(ErrorCode::MathOverflow)?;
    
    let price_drop_amount = (price_drop as f64 * progress) as u64;
    
    let current_price = auction.start_price
        .checked_sub(price_drop_amount)
        .ok_or(ErrorCode::MathOverflow)?;
    
    Ok(current_price)
}

pub fn place_bid(
    ctx: Context<PlaceBid>,
    bid_amount: u64,
) -> Result<()> {
    let auction = &mut ctx.accounts.auction;
    let bidder = ctx.accounts.bidder.key();
    let clock = Clock::get()?;
    
    // Check if auction is active
    if auction.status != AuctionStatus::Active {
        return Err(ErrorCode::AuctionNotActive.into());
    }
    
    // Check if auction has ended
    if clock.unix_timestamp >= auction.end_time {
        return Err(ErrorCode::AuctionEnded.into());
    }
    
    // Get current price
    let current_price = get_current_price(auction, clock.unix_timestamp)?;
    
    // Check if bid is high enough
    if bid_amount < current_price {
        return Err(ErrorCode::BidTooLow.into());
    }
    
    // Calculate instant buy price (debt_amount + 5%)
    let instant_buy_price = auction.debt_amount
        .checked_mul(100 + INSTANT_BUY_PREMIUM)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(100)
        .ok_or(ErrorCode::MathOverflow)?;
    
    // Check if bidder has enough funds
    // (This would integrate with token accounts in a real implementation)
    
    // Update auction with new bid
    auction.current_highest_bidder = bidder;
    auction.current_highest_bid = bid_amount;
    
    // Emit event
    emit!(BidPlacedEvent {
        auction: auction.key(),
        bidder,
        bid_amount,
        timestamp: clock.unix_timestamp,
    });
    
    // If instant buy price is met, end auction immediately
    if bid_amount >= instant_buy_price {
        auction.status = AuctionStatus::Completed;
        auction.end_time = clock.unix_timestamp;
        
        // Emit completion event
        emit!(AuctionCompletedEvent {
            auction: auction.key(),
            vault: auction.vault,
            winner: bidder,
            winning_bid: bid_amount,
            collateral_amount: auction.collateral_amount,
            timestamp: clock.unix_timestamp,
        });
    }
    
    Ok(())
}

pub fn settle_auction(
    ctx: Context<SettleAuction>,
) -> Result<()> {
    let auction = &mut ctx.accounts.auction;
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;
    
    // Check if auction is active
    if auction.status != AuctionStatus::Active {
        return Err(ErrorCode::AuctionNotActive.into());
    }
    
    // Check if auction has ended
    if clock.unix_timestamp < auction.end_time {
        return Err(ErrorCode::AuctionNotEnded.into());
    }
    
    // Check if there was a valid bid
    if auction.current_highest_bid == 0 {
        // No bids, cancel the auction
        auction.status = AuctionStatus::Cancelled;
        return Ok(());
    }
    
    // Mark auction as completed
    auction.status = AuctionStatus::Completed;
    
    // Emit completion event
    emit!(AuctionCompletedEvent {
        auction: auction.key(),
        vault: auction.vault,
        winner: auction.current_highest_bidder,
        winning_bid: auction.current_highest_bid,
        collateral_amount: auction.collateral_amount,
        timestamp: clock.unix_timestamp,
    });
    
    // In a real implementation:
    // 1. Transfer collateral to winner
    // 2. Pay off debt from winning bid
    // 3. Return any excess to vault owner
    
    Ok(())
}

// Context structs for the instructions
#[derive(Accounts)]
pub struct LiquidateVault<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    
    #[account(init, payer = liquidator, space = 8 + 32 + 4 + 8 + 8 + 8 + 8 + 8 + 32 + 32 + 8)]
    pub auction: Account<'info, Auction>,
    
    #[account(mut)]
    pub liquidator: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlaceBid<'info> {
    #[account(mut)]
    pub auction: Account<'info, Auction>,
    
    #[account(mut)]
    pub bidder: Signer<'info>,
    
    #[account(mut)]
    pub bidder_token_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SettleAuction<'info> {
    #[account(mut)]
    pub auction: Account<'info, Auction>,
    
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    
    #[account(mut)]
    pub winner_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub debt_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub owner_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub vault_collateral_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

// Functions to facilitate testing
#[cfg(test)]
mod tests; 