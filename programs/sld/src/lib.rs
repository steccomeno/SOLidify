use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, MintTo, Transfer};
use anchor_lang::solana_program::{instruction::Instruction, program::invoke_signed};

declare_id!("SLDGkQDvmaXaDYpXTAXxxSQkgRdotTwNNWuZ9AHgK9w");

#[program]
pub mod sld {
    use super::*;

    // Initialize the SLD token and governance system
    pub fn initialize_governance(
        ctx: Context<InitializeGovernance>,
        min_vote_threshold: u64,
        voting_period: i64,
    ) -> Result<()> {
        let governance = &mut ctx.accounts.governance;
        governance.admin = ctx.accounts.admin.key();
        governance.sld_mint = ctx.accounts.sld_mint.key();
        governance.min_vote_threshold = min_vote_threshold;
        governance.voting_period = voting_period;
        governance.proposal_count = 0;

        Ok(())
    }

    // Create a new governance proposal
    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        title: String,
        description: String,
        voting_period: i64,
    ) -> Result<()> {
        let governance = &ctx.accounts.governance;
        let proposal = &mut ctx.accounts.proposal;
        
        proposal.proposer = ctx.accounts.proposer.key();
        proposal.title = title;
        proposal.description = description;
        proposal.created_at = ctx.accounts.clock.unix_timestamp;
        proposal.voting_period = voting_period;
        proposal.for_votes = 0;
        proposal.against_votes = 0;
        proposal.executed = false;

        Ok(())
    }
    
    // Cast a vote on a proposal
    pub fn cast_vote(
        ctx: Context<CastVote>,
        vote_amount: u64,
        support: bool,
    ) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        let vote_record = &mut ctx.accounts.vote_record;
        
        // Ensure proposal is still active
        let current_time = ctx.accounts.clock.unix_timestamp;
        require!(
            current_time <= proposal.created_at + proposal.voting_period,
            ErrorCode::VotingClosed
        );
        
        // Ensure proposal hasn't been executed
        require!(!proposal.executed, ErrorCode::ProposalAlreadyExecuted);
        
        // Initialize vote record
        vote_record.voter = ctx.accounts.voter.key();
        vote_record.proposal = proposal.key();
        vote_record.vote_amount = vote_amount;
        vote_record.support = support;
        
        // Lock tokens by transferring them to governance account
        let transfer_tokens_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.voter_sld.to_account_info(),
                to: ctx.accounts.governance_sld.to_account_info(),
                authority: ctx.accounts.voter.to_account_info(),
            },
        );
        token::transfer(transfer_tokens_ctx, vote_amount)?;
        
        // Update proposal vote counts
        if support {
            proposal.for_votes = proposal.for_votes.checked_add(vote_amount)
                .ok_or(ErrorCode::MathOverflow)?;
        } else {
            proposal.against_votes = proposal.against_votes.checked_add(vote_amount)
                .ok_or(ErrorCode::MathOverflow)?;
        }
        
        Ok(())
    }
    
    // Execute a passed proposal
    pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        let governance = &ctx.accounts.governance;
        
        // Check if voting period has ended
        let current_time = ctx.accounts.clock.unix_timestamp;
        require!(
            current_time > proposal.created_at + proposal.voting_period,
            ErrorCode::VotingStillOpen
        );
        
        // Check if proposal already executed
        require!(!proposal.executed, ErrorCode::ProposalAlreadyExecuted);
        
        // Check if proposal has enough votes
        require!(
            proposal.for_votes >= governance.min_vote_threshold,
            ErrorCode::InsufficientVotes
        );
        
        // Check if proposal passed
        require!(
            proposal.for_votes > proposal.against_votes,
            ErrorCode::ProposalRejected
        );
        
        // Mark proposal as executed
        proposal.executed = true;
        
        // Implementation of the actual execution logic would depend on what the proposal is for
        // This could involve changing parameters in the governance account or other actions
        
        Ok(())
    }
    
    // Mint SLD tokens (admin only)
    pub fn mint_sld(ctx: Context<MintSld>, amount: u64) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ctx.accounts.governance.admin,
            ErrorCode::NotAuthorized
        );

        // Mint SLD tokens to the admin
        let mint_sld_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::MintTo {
                mint: ctx.accounts.sld_mint.to_account_info(),
                to: ctx.accounts.admin_sld.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            &[&[b"mint_authority", &[ctx.bumps.mint_authority]]],
        );
        token::mint_to(mint_sld_ctx, amount)?;

        Ok(())
    }
    
    // Initialize the SLD mint with a PDA as the mint authority
    pub fn initialize_sld_mint(
        ctx: Context<InitializeSldMint>,
    ) -> Result<()> {
        // The mint is already initialized by the time this instruction is called
        // We're just setting up the mint authority and other parameters
        // Nothing to do here since we're using anchor's init feature
        Ok(())
    }
}

// Account Structures

#[account]
pub struct Governance {
    pub admin: Pubkey,             // 32
    pub sld_mint: Pubkey,          // 32
    pub min_vote_threshold: u64,   // 8
    pub voting_period: i64,        // 8
    pub proposal_count: u64,       // 8
}

impl Governance {
    pub const LEN: usize = 32 + 32 + 8 + 8 + 8;
}

#[account]
pub struct Proposal {
    pub proposer: Pubkey,          // 32
    pub title: String,             // 4 + 100
    pub description: String,       // 4 + 500
    pub created_at: i64,           // 8
    pub voting_period: i64,        // 8
    pub for_votes: u64,            // 8
    pub against_votes: u64,        // 8
    pub executed: bool,            // 1
}

impl Proposal {
    pub const LEN: usize = 32 + (4 + 100) + (4 + 500) + 8 + 8 + 8 + 8 + 1;
}

#[account]
pub struct VoteRecord {
    pub voter: Pubkey,             // 32
    pub proposal: Pubkey,          // 32
    pub vote_amount: u64,          // 8
    pub support: bool,             // 1
}

impl VoteRecord {
    pub const LEN: usize = 32 + 32 + 8 + 1;
}

// Contexts

#[derive(Accounts)]
pub struct InitializeGovernance<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    
    #[account(
        init,
        payer = admin,
        space = 8 + Governance::LEN,
        seeds = [b"governance"],
        bump
    )]
    pub governance: Account<'info, Governance>,
    
    #[account(
        init,
        payer = admin,
        mint::decimals = 6,
        mint::authority = mint_authority
    )]
    pub sld_mint: Account<'info, Mint>,
    
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

#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub proposer: Signer<'info>,
    
    #[account(
        init,
        payer = proposer,
        space = 8 + Proposal::LEN
    )]
    pub proposal: Account<'info, Proposal>,
    
    pub governance: Account<'info, Governance>,
    
    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,
    
    #[account(mut)]
    pub voter_sld: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    
    #[account(
        init,
        payer = voter,
        space = 8 + VoteRecord::LEN,
        seeds = [
            b"vote_record",
            proposal.key().as_ref(),
            voter.key().as_ref()
        ],
        bump
    )]
    pub vote_record: Account<'info, VoteRecord>,
    
    #[account(mut)]
    pub governance: Account<'info, Governance>,
    
    /// CHECK: This account is for storing locked SLD tokens
    #[account(mut)]
    pub governance_sld: Account<'info, TokenAccount>,
    
    pub sld_mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    #[account(mut)]
    pub executor: Signer<'info>,
    
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    
    pub governance: Account<'info, Governance>,
    
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct MintSld<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    
    #[account(mut)]
    pub governance: Account<'info, Governance>,
    
    #[account(mut)]
    pub sld_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub admin_sld: Account<'info, TokenAccount>,
    
    /// CHECK: This is the PDA that is the mint authority
    #[account(
        seeds = [b"mint_authority"],
        bump
    )]
    pub mint_authority: UncheckedAccount<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct InitializeSldMint<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    
    #[account(
        init,
        payer = admin,
        mint::decimals = 6,
        mint::authority = mint_authority,
    )]
    pub sld_mint: Account<'info, Mint>,
    
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

// Events

#[event]
pub struct ProposalCreatedEvent {
    pub proposal_id: u64,
    pub proposer: Pubkey,
    pub title: String,
    pub voting_ends_at: i64,
}

#[event]
pub struct VoteCastEvent {
    pub proposal_id: u64,
    pub voter: Pubkey,
    pub voted_for: bool,
    pub voting_power: u64,
}

#[event]
pub struct ProposalExecutedEvent {
    pub proposal_id: u64,
    pub executor: Pubkey,
    pub votes_for: u64,
    pub votes_against: u64,
}

#[event]
pub struct SldMintedEvent {
    pub recipient: Pubkey,
    pub amount: u64,
}

// Errors

#[error_code]
pub enum ErrorCode {
    #[msg("Not authorized to perform this action")]
    NotAuthorized,
    
    #[msg("Math operation overflow")]
    MathOverflow,
    
    #[msg("Voting period has closed")]
    VotingClosed,
    
    #[msg("Voting period is still open")]
    VotingStillOpen,
    
    #[msg("Proposal has already been executed")]
    ProposalAlreadyExecuted,
    
    #[msg("Proposal does not have enough votes to execute")]
    InsufficientVotes,
    
    #[msg("Proposal was rejected (more against votes than for votes)")]
    ProposalRejected,
} 