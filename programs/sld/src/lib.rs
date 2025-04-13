use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint};
use anchor_lang::solana_program::system_instruction;

declare_id!("VrzGbEB4PBEM5g1RrJn7A82gGbwPYtc9TvZjqY3NUzM");

#[program]
pub mod sld {
    use super::*;

    // Initialize the SLD token and governance system
    pub fn initialize_governance(
        ctx: Context<InitializeGovernance>,
        quorum: u64,
        voting_period: i64,
    ) -> Result<()> {
        let governance = &mut ctx.accounts.governance;
        governance.admin = ctx.accounts.payer.key();
        governance.quorum = quorum;
        governance.voting_period = voting_period;
        governance.total_supply = 0;
        governance.proposal_count = 0;
        Ok(())
    }

    // Create a new governance proposal
    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        title: String,
        description: String,
    ) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        let governance = &mut ctx.accounts.governance;

        // Check if the proposer has enough voting power
        require!(
            ctx.accounts.proposer_token_account.amount >= governance.quorum,
            ErrorCode::InsufficientVotingPower
        );

        // Initialize proposal
        proposal.proposer = ctx.accounts.proposer.key();
        proposal.title = title;
        proposal.description = description;
        proposal.for_votes = 0;
        proposal.against_votes = 0;
        proposal.start_time = Clock::get()?.unix_timestamp;
        proposal.end_time = proposal.start_time + governance.voting_period;
        proposal.executed = false;
        proposal.cancelled = false;

        // Increment proposal count
        governance.proposal_count = governance.proposal_count.checked_add(1).unwrap();

        Ok(())
    }
    
    // Cast a vote on a proposal
    pub fn cast_vote(
        ctx: Context<CastVote>,
        vote: bool,
    ) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        let voter = &mut ctx.accounts.voter_account;
        let clock = Clock::get()?;

        // Check if proposal is still active
        require!(
            clock.unix_timestamp >= proposal.start_time && 
            clock.unix_timestamp <= proposal.end_time,
            ErrorCode::InvalidVotingTime
        );

        // Check if voter hasn't voted yet
        require!(!voter.has_voted, ErrorCode::AlreadyVoted);

        // Record vote
        let voting_power = ctx.accounts.voter_token_account.amount;
        if vote {
            proposal.for_votes = proposal.for_votes.checked_add(voting_power).unwrap();
        } else {
            proposal.against_votes = proposal.against_votes.checked_add(voting_power).unwrap();
        }

        voter.has_voted = true;
        voter.vote = vote;
        voter.voting_power = voting_power;
        voter.proposal = proposal.key();

        Ok(())
    }
    
    // Execute a passed proposal
    pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        let governance = &ctx.accounts.governance;
        let clock = Clock::get()?;

        // Check if proposal has ended
        require!(
            clock.unix_timestamp > proposal.end_time,
            ErrorCode::ProposalStillActive
        );
        
        // Check if proposal has enough votes
        require!(
            proposal.for_votes >= governance.quorum,
            ErrorCode::InsufficientVotes
        );
        
        // Check if proposal hasn't been executed yet
        require!(!proposal.executed, ErrorCode::ProposalAlreadyExecuted);
        
        // Mark proposal as executed
        proposal.executed = true;
        
        Ok(())
    }
    
    // Mint SLD tokens (admin only)
    pub fn mint_sld(ctx: Context<MintSld>, amount: u64) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ctx.accounts.governance.admin,
            ErrorCode::NotAuthorized
        );

        // Mint SLD tokens to the admin
        let mint_authority_seeds = &[b"mint_authority".as_ref(), &[*ctx.bumps.get("mint_authority").unwrap()]];
        let signer = &[&mint_authority_seeds[..]];
        
        let cpi_accounts = token::MintTo {
            mint: ctx.accounts.sld_mint.to_account_info(),
            to: ctx.accounts.admin_sld.to_account_info(),
            authority: ctx.accounts.mint_authority.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(
            cpi_program,
            cpi_accounts,
            signer,
        );
        
        token::mint_to(cpi_ctx, amount)?;

        Ok(())
    }
    
    // Initialize the SLD mint with a PDA as the mint authority
    pub fn initialize_sld_mint(_ctx: Context<InitializeSldMint>) -> Result<()> {
        Ok(())
    }
}

// Account Structures

#[account]
pub struct Governance {
    pub admin: Pubkey,
    pub quorum: u64,
    pub voting_period: i64,
    pub total_supply: u64,
    pub proposal_count: u64,
}

impl Governance {
    pub const LEN: usize = 32 + // admin
                          8 + // quorum
                          8 + // voting_period
                          8 + // total_supply
                          8; // proposal_count
}

#[account]
pub struct Proposal {
    pub proposer: Pubkey,
    pub title: String,
    pub description: String,
    pub for_votes: u64,
    pub against_votes: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub executed: bool,
    pub cancelled: bool,
}

impl Proposal {
    pub const LEN: usize = 32 + // proposer
                          100 + // title (max length)
                          1000 + // description (max length)
                          8 + // for_votes
                          8 + // against_votes
                          8 + // start_time
                          8 + // end_time
                          1 + // executed
                          1; // cancelled
}

#[account]
pub struct Voter {
    pub has_voted: bool,
    pub vote: bool,
    pub voting_power: u64,
    pub proposal: Pubkey,
}

impl Voter {
    pub const LEN: usize = 1 + // has_voted
                          1 + // vote
                          8 + // voting_power
                          32; // proposal
}

// Contexts

#[derive(Accounts)]
pub struct InitializeGovernance<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + Governance::LEN,
        seeds = [b"governance"],
        bump
    )]
    pub governance: Account<'info, Governance>,
    pub sld_mint: Account<'info, Mint>,
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
pub struct CreateProposal<'info> {
    #[account(
        init,
        payer = proposer,
        space = 8 + Proposal::LEN,
    )]
    pub proposal: Account<'info, Proposal>,
    #[account(mut)]
    pub governance: Account<'info, Governance>,
    pub proposer_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub proposer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    
    #[account(
        init_if_needed,
        payer = voter_signer,
        space = Voter::LEN,
        seeds = [b"voter", proposal.key().as_ref(), voter_signer.key().as_ref()],
        bump
    )]
    pub voter_account: Account<'info, Voter>,
    
    #[account(mut)]
    pub voter_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub voter_signer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    pub governance: Account<'info, Governance>,
    #[account(mut)]
    pub executor: Signer<'info>,
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
    #[account(
        init,
        payer = payer,
        mint::decimals = 6,
        mint::authority = payer.key(),
    )]
    pub sld_mint: Account<'info, Mint>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
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
    
    #[msg("Insufficient voting power")]
    InsufficientVotingPower,
    
    #[msg("Invalid voting time")]
    InvalidVotingTime,
    
    #[msg("Already voted")]
    AlreadyVoted,
    
    #[msg("Proposal is still active")]
    ProposalStillActive,
    
    #[msg("Insufficient votes")]
    InsufficientVotes,
    
    #[msg("Proposal already executed")]
    ProposalAlreadyExecuted,
} 