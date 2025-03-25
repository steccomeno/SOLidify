use anchor_lang::prelude::*;
use anchor_spl::token::{self, TokenAccount, Token, Transfer};

#[program]
pub mod solidify_liquidation {
    use super::*;

    // Start a Dutch auction for a liquidated vault
    pub fn start_auction(
        ctx: Context<StartAuction>,
        collateral_amount: u64,
        debt_amount: u64
    ) -> Result<()> {
        let auction = &mut ctx.accounts.auction;
        let clock = Clock::get()?;
        
        // Initialize auction data
        auction.vault = ctx.accounts.vault.key();
        auction.collateral_amount = collateral_amount;
        auction.debt_amount = debt_amount;
        auction.start_price = calculate_start_price(collateral_amount, debt_amount)?;
        auction.status = AuctionStatus::Active;
        auction.start_time = clock.unix_timestamp;
        auction.end_time = clock.unix_timestamp + 3600; // 1 hour auction
        auction.liquidator = ctx.accounts.liquidator.key();
        auction.current_highest_bidder = Pubkey::default();
        auction.current_highest_bid = 0;
        
        msg!("Dutch auction started for vault {}", auction.vault);
        msg!("Starting price: {}", auction.start_price);
        
        // Emit auction started event
        emit!(AuctionStartedEvent {
            auction: auction.key(),
            vault: auction.vault,
            collateral_amount: auction.collateral_amount,
            debt_amount: auction.debt_amount,
            start_price: auction.start_price,
            start_time: auction.start_time,
            end_time: auction.end_time,
        });
        
        Ok(())
    }
    
    // Place a bid on an active auction
    pub fn place_bid(
        ctx: Context<PlaceBid>,
        bid_amount: u64
    ) -> Result<()> {
        let auction = &mut ctx.accounts.auction;
        let clock = Clock::get()?;
        
        // Ensure auction is active
        require!(auction.status == AuctionStatus::Active, ErrorCode::AuctionNotActive);
        
        // Ensure auction has not ended
        require!(clock.unix_timestamp < auction.end_time, ErrorCode::AuctionEnded);
        
        // Calculate current Dutch auction price
        let current_price = get_current_price(auction, clock.unix_timestamp)?;
        
        // Ensure bid is at least the current price
        require!(bid_amount >= current_price, ErrorCode::BidTooLow);
        
        // If there's already a bid, ensure this one is higher
        if auction.current_highest_bid > 0 {
            require!(bid_amount > auction.current_highest_bid, ErrorCode::BidTooLow);
        }
        
        // Process the payment: transfer tokens from bidder to protocol treasury
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.bidder_token_account.to_account_info(),
                to: ctx.accounts.treasury_token_account.to_account_info(),
                authority: ctx.accounts.bidder.to_account_info(),
            },
        );
        
        // If this is not the first bid, return funds to previous bidder
        if auction.current_highest_bid > 0 && auction.current_highest_bidder != Pubkey::default() {
            // Return previous bid (would be implemented with a separate CPI call)
            msg!("Refunding previous bidder: {}", auction.current_highest_bidder);
        }
        
        // Complete the transfer
        token::transfer(transfer_ctx, bid_amount)?;
        
        // Update auction state
        auction.current_highest_bidder = ctx.accounts.bidder.key();
        auction.current_highest_bid = bid_amount;
        
        // If bid meets the instant buy price (debt amount + 5%), close the auction immediately
        let instant_buy_price = auction.debt_amount.checked_mul(105).ok_or(ErrorCode::MathOverflow)?.checked_div(100).ok_or(ErrorCode::DivisionByZero)?;
        
        if bid_amount >= instant_buy_price {
            auction.status = AuctionStatus::Completed;
            auction.end_time = clock.unix_timestamp;
            
            msg!("Auction completed with instant buy price: {}", bid_amount);
            
            // Emit auction completed event
            emit!(AuctionCompletedEvent {
                auction: auction.key(),
                winner: auction.current_highest_bidder,
                final_price: auction.current_highest_bid,
                collateral_amount: auction.collateral_amount,
            });
        } else {
            msg!("Bid placed: {} by {}", bid_amount, ctx.accounts.bidder.key());
            
            // Emit bid placed event
            emit!(BidPlacedEvent {
                auction: auction.key(),
                bidder: ctx.accounts.bidder.key(),
                bid_amount: bid_amount,
                timestamp: clock.unix_timestamp,
            });
        }
        
        Ok(())
    }
    
    // Settle auction after it has ended
    pub fn settle_auction(ctx: Context<SettleAuction>) -> Result<()> {
        let auction = &mut ctx.accounts.auction;
        let clock = Clock::get()?;
        
        // Ensure auction is active
        require!(auction.status == AuctionStatus::Active, ErrorCode::AuctionNotActive);
        
        // Ensure auction has ended
        require!(clock.unix_timestamp >= auction.end_time, ErrorCode::AuctionNotEnded);
        
        // Ensure there was at least one bid
        require!(auction.current_highest_bid > 0, ErrorCode::NoBids);
        
        // Mark auction as completed
        auction.status = AuctionStatus::Completed;
        
        // Transfer collateral to winner (would be implemented with token transfer CPI)
        msg!("Transferring {} collateral to auction winner: {}", 
            auction.collateral_amount, 
            auction.current_highest_bidder);
        
        // Emit auction completed event
        emit!(AuctionCompletedEvent {
            auction: auction.key(),
            winner: auction.current_highest_bidder,
            final_price: auction.current_highest_bid,
            collateral_amount: auction.collateral_amount,
        });
        
        Ok(())
    }
}

// Calculate the starting price for the Dutch auction (150% of debt)
fn calculate_start_price(collateral_amount: u64, debt_amount: u64) -> Result<u64> {
    debt_amount
        .checked_mul(150)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(100)
        .ok_or(ErrorCode::DivisionByZero)
}

// Calculate the current price based on time elapsed in the Dutch auction
fn get_current_price(auction: &Account<Auction>, current_timestamp: i64) -> Result<u64> {
    // Ensure we're within the auction period
    if current_timestamp >= auction.end_time {
        return Ok(auction.debt_amount); // Minimum price is the debt amount
    }
    
    // Calculate elapsed time as a percentage of total auction duration
    let total_duration = auction.end_time - auction.start_time;
    let elapsed = current_timestamp - auction.start_time;
    let progress = (elapsed as f64) / (total_duration as f64);
    
    // Calculate price decay - linear decrease from start_price to debt_amount
    let price_range = auction.start_price - auction.debt_amount;
    let price_reduction = (price_range as f64 * progress) as u64;
    
    auction.start_price
        .checked_sub(price_reduction)
        .ok_or(ErrorCode::MathOverflow.into())
}

// Auction account structure
#[account]
pub struct Auction {
    pub vault: Pubkey,                 // Associated vault being liquidated
    pub status: AuctionStatus,         // Current auction status
    pub collateral_amount: u64,        // Amount of collateral for sale
    pub debt_amount: u64,              // Debt amount to be recovered
    pub start_price: u64,              // Starting price for the Dutch auction
    pub start_time: i64,               // Timestamp when auction started
    pub end_time: i64,                 // Timestamp when auction ends
    pub liquidator: Pubkey,            // Account that initiated the liquidation
    pub current_highest_bidder: Pubkey, // Current winning bidder
    pub current_highest_bid: u64,      // Current highest bid amount
}

// Auction status enum
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum AuctionStatus {
    Active,
    Completed,
    Cancelled
}

// Event emitted when an auction is started
#[event]
pub struct AuctionStartedEvent {
    pub auction: Pubkey,
    pub vault: Pubkey,
    pub collateral_amount: u64,
    pub debt_amount: u64, 
    pub start_price: u64,
    pub start_time: i64,
    pub end_time: i64,
}

// Event emitted when a bid is placed
#[event]
pub struct BidPlacedEvent {
    pub auction: Pubkey,
    pub bidder: Pubkey,
    pub bid_amount: u64,
    pub timestamp: i64,
}

// Event emitted when an auction is completed
#[event]
pub struct AuctionCompletedEvent {
    pub auction: Pubkey,
    pub winner: Pubkey,
    pub final_price: u64,
    pub collateral_amount: u64,
}

// Accounts required for starting an auction
#[derive(Accounts)]
pub struct StartAuction<'info> {
    #[account(init, payer = liquidator, space = 8 + 250)]
    pub auction: Account<'info, Auction>,
    
    pub vault: AccountInfo<'info>,
    
    #[account(mut)]
    pub liquidator: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

// Accounts required for placing a bid
#[derive(Accounts)]
pub struct PlaceBid<'info> {
    #[account(mut)]
    pub auction: Account<'info, Auction>,
    
    #[account(mut)]
    pub bidder: Signer<'info>,
    
    #[account(mut)]
    pub bidder_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub treasury_token_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

// Accounts required for settling an auction
#[derive(Accounts)]
pub struct SettleAuction<'info> {
    #[account(mut)]
    pub auction: Account<'info, Auction>,
    
    #[account(mut)]
    pub settler: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

// Error codes
#[error_code]
pub enum ErrorCode {
    #[msg("Math overflow")]
    MathOverflow,
    
    #[msg("Division by zero")]
    DivisionByZero,
    
    #[msg("Auction is not active")]
    AuctionNotActive,
    
    #[msg("Auction has already ended")]
    AuctionEnded,
    
    #[msg("Auction has not ended yet")]
    AuctionNotEnded,
    
    #[msg("Bid is too low")]
    BidTooLow,
    
    #[msg("No bids were placed on this auction")]
    NoBids,
} 