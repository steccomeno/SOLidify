# Technical Specification: Liquidation Engine

## Overview

The Liquidation Engine is a critical component of the SOLidify protocol that maintains system solvency by automatically liquidating under-collateralized positions. This document provides technical specifications for implementation.

## Goals

- Ensure protocol solvency by liquidating risky positions
- Use reliable price feeds to determine collateral value
- Implement efficient auction mechanism for liquidated collateral
- Optimize for Solana's performance constraints
- Provide fair liquidation process with appropriate incentives

## Technical Details

### 1. Program Structure

#### Accounts
```rust
#[account]
pub struct Vault {
    pub owner: Pubkey,
    pub collateral_mint: Pubkey,
    pub collateral_amount: u64,
    pub debt_amount: u64,
    pub last_updated: i64,
    pub liquidation_in_progress: bool,
}

#[account]
pub struct LiquidationAuction {
    pub vault: Pubkey,
    pub liquidator: Pubkey,
    pub collateral_amount: u64,
    pub start_price: u64,
    pub current_price: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub status: AuctionStatus,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum AuctionStatus {
    Active,
    Completed,
    Cancelled,
}
```

#### Program Instructions
```rust
#[program]
pub mod liquidation_engine {
    use super::*;

    pub fn check_liquidation(ctx: Context<CheckLiquidation>) -> Result<()> {
        // Logic to check if a vault should be liquidated
    }

    pub fn start_liquidation(ctx: Context<StartLiquidation>) -> Result<()> {
        // Logic to begin liquidation process
    }

    pub fn bid_on_auction(ctx: Context<BidOnAuction>, bid_amount: u64) -> Result<()> {
        // Logic to place bid on liquidated collateral
    }

    pub fn settle_auction(ctx: Context<SettleAuction>) -> Result<()> {
        // Logic to finalize auction and distribute assets
    }
}
```

### 2. Liquidation Process

1. **Liquidation Check**
   - Triggered by keepers or automatically on vault interactions
   - Fetch current price from Pyth oracle
   - Calculate current collateralization ratio
   - If ratio < 110%, mark vault for liquidation

2. **Liquidation Initiation**
   - Create LiquidationAuction PDA
   - Lock vault to prevent further interactions
   - Set initial auction parameters

3. **Dutch Auction Mechanism**
   - Start at price = market_price * 1.05 (5% premium to incentivize liquidators)
   - Price decreases linearly over time until market_price * 0.9
   - First liquidator to bid gets the collateral

4. **Settlement**
   - Transfer collateral to winning bidder
   - Use bid amount to repay vault debt
   - Calculate and apply liquidation penalty (2%)
   - Return any excess funds to vault owner

### 3. Oracle Integration

```rust
// Function to get SOL price from Pyth
fn get_sol_price(pyth_price_account: &AccountInfo) -> Result<u64> {
    let price_feed = pyth_client::load_price(pyth_price_account)?;
    
    // Check for stale prices
    let current_timestamp = Clock::get()?.unix_timestamp;
    if current_timestamp - price_feed.publish_time > 60 {
        return Err(ErrorCode::StaleOracleData.into());
    }
    
    // Check confidence interval
    if price_feed.confidence > price_feed.price / 20 {
        return Err(ErrorCode::PriceConfidenceTooLow.into());
    }
    
    Ok(price_feed.price as u64)
}
```

### 4. Optimization Considerations

- **Compute Units**: Minimize account loading and computation
- **Reentrancy Protection**: Complete all state changes before transferring tokens
- **Gas Efficiency**: Batch operations where possible
- **Sybil Resistance**: Require minimum bid size to prevent auction manipulation

## Frontend Components

### Liquidation Risk Indicator

```typescript
interface LiquidationRiskProps {
  collateralValue: number;
  debtValue: number;
  liquidationThreshold: number;
}

const LiquidationRiskIndicator: React.FC<LiquidationRiskProps> = ({
  collateralValue,
  debtValue,
  liquidationThreshold
}) => {
  const ratio = (collateralValue / debtValue) * 100;
  const buffer = ratio - liquidationThreshold;
  
  // Calculate risk level
  let riskLevel = "low";
  if (buffer < 10) riskLevel = "high";
  else if (buffer < 30) riskLevel = "medium";
  
  return (
    <div className={`liquidation-risk ${riskLevel}`}>
      <h4>Liquidation Risk: {riskLevel.toUpperCase()}</h4>
      <div className="risk-meter">
        <div 
          className="risk-indicator"
          style={{ width: `${Math.min(100, 100 - buffer)}%` }}
        />
      </div>
      <p>Current Ratio: {ratio.toFixed(2)}%</p>
      <p>Liquidation Threshold: {liquidationThreshold}%</p>
      <p>Safety Buffer: {buffer.toFixed(2)}%</p>
    </div>
  );
};
```

## Testing Strategy

### Unit Tests

1. **Price Feed Tests**
   - Test handling of valid price updates
   - Test rejection of stale data
   - Test handling of low confidence intervals

2. **Liquidation Threshold Tests**
   - Test correct triggering at exactly 110%
   - Test no liquidation above threshold
   - Test edge cases with very small positions

### Integration Tests

```typescript
describe('Liquidation Engine', () => {
  it('should liquidate vault when collateral ratio drops below threshold', async () => {
    // Set up vault with collateral
    const vault = await createTestVault(provider, collateralAmount, debtAmount);
    
    // Mock price drop
    await mockPythPriceDrop(provider, originalPrice, newLowerPrice);
    
    // Trigger liquidation check
    const tx = await program.methods
      .checkLiquidation()
      .accounts({
        vault: vault.publicKey,
        pythPriceAccount: mockPythAccount,
        // ... other accounts
      })
      .rpc();
      
    // Verify vault is now in liquidation
    const vaultData = await program.account.vault.fetch(vault.publicKey);
    expect(vaultData.liquidationInProgress).to.be.true;
  });
  
  it('should properly distribute funds after auction completion', async () => {
    // Set up auction environment
    // ...
    
    // Place winning bid
    // ...
    
    // Settle auction
    // ...
    
    // Check balances
    const liquidatorBalance = await getTokenBalance(liquidator.publicKey, collateralMint);
    const protocolFeeBalance = await getTokenBalance(protocolFeeAccount, stablecoinMint);
    const vaultOwnerBalance = await getTokenBalance(vaultOwner.publicKey, stablecoinMint);
    
    // Assertions to verify correct fund distribution
    expect(liquidatorBalance).to.equal(expectedLiquidatorCollateral);
    expect(protocolFeeBalance).to.equal(expectedProtocolFee);
    expect(vaultOwnerBalance).to.equal(expectedExcessFunds);
  });
});
```

## Deployment Plan

1. **Devnet Testing**
   - Deploy to Devnet for extended testing
   - Perform stress tests with multiple concurrent liquidations
   - Validate oracle integration with test feeds

2. **Security Audit**
   - Complete code audit before mainnet deployment
   - Focus on reentrancy vulnerabilities and economic attacks

3. **Mainnet Deployment**
   - Deploy program with admin keys in multi-sig
   - Gradually increase debt ceiling to limit risk
   - Activate keepers to monitor vaults

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Oracle Failure | High | Implement circuit breakers and fallback mechanisms |
| Flash Loan Attacks | High | Add minimum time delays for large position changes |
| Auction Manipulation | Medium | Ensure declining price mechanism and minimum bid requirements |
| Network Congestion | Medium | Design to handle delayed transactions gracefully |
| Insufficient Liquidator Participation | High | Ensure sufficient liquidation incentives |

## Success Metrics

- **Solvency Maintenance**: Protocol should maintain > 100% collateralization at all times
- **Liquidation Efficiency**: Auctions should settle within 1 hour on average
- **Liquidator Returns**: Average premium to liquidators of 3-5%
- **Failed Liquidations**: < 0.1% of liquidations should fail due to technical issues

## Future Improvements

- Multi-collateral liquidation strategies
- Partial liquidations for large positions
- Integration with insurance fund for underwater positions
- Dynamic liquidation thresholds based on market volatility

## Appendix

### A. Common Error Codes

```rust
#[error_code]
pub enum ErrorCode {
    #[msg("Vault is not undercollateralized")]
    NotUndercollateralized,
    
    #[msg("Oracle data is stale")]
    StaleOracleData,
    
    #[msg("Price confidence too low")]
    PriceConfidenceTooLow,
    
    #[msg("Auction already in progress")]
    AuctionAlreadyInProgress,
    
    #[msg("Bid too low")]
    BidTooLow,
    
    #[msg("Auction ended")]
    AuctionEnded,
    
    // Additional error codes...
}
```

### B. Relevant Solana Documentation

- [Pyth Price Feeds](https://docs.pyth.network/documentation/solana-price-feeds)
- [SPL Token Documentation](https://spl.solana.com/token)
- [Anchor Framework](https://anchor-lang.com/) 