# SOLidify Backend Infrastructure

This document describes the backend infrastructure for the SOLidify protocol, a Solana-based MakerDAO clone that enables users to mint SAI stablecoins against collateral and participate in governance through the SLD token.

## Overview

The SOLidify backend consists of two main Solana programs:

1. **SAI Program**: Handles the creation of Collateralized Debt Positions (CDPs), allowing users to deposit collateral and mint SAI stablecoins.
2. **SLD Program**: Manages the governance token and voting system, enabling holders to create and vote on proposals.

## Program Structure

### SAI Program

The SAI program handles the following operations:

- Initializing a CDP
- Adding collateral to an existing CDP
- Drawing SAI (increasing debt)
- Repaying SAI (reducing debt)
- Closing a CDP
- Liquidating undercollateralized CDPs

### SLD Program

The SLD program handles the following operations:

- Initializing the governance system
- Creating proposals
- Casting votes on proposals
- Executing approved proposals
- Minting SLD tokens

## Getting Started

### Prerequisites

- [Solana CLI Tools](https://docs.solana.com/cli/install-solana-cli-tools)
- [Node.js](https://nodejs.org/) and npm
- [Anchor Framework](https://project-serum.github.io/anchor/getting-started/installation.html)

### Building the Programs

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/SOLidify.git
   cd SOLidify
   ```

2. Build the Anchor programs:
   ```bash
   anchor build
   ```

### Deploying the Programs

1. Generate a deployment keypair:
   ```bash
   mkdir -p keys
   solana-keygen new -o keys/deployer.json
   ```

2. Fund your deployment account:
   ```bash
   solana airdrop 2 $(solana-keygen pubkey keys/deployer.json) --url devnet
   ```

3. Deploy the programs:
   ```bash
   anchor deploy
   ```

### Running the Scripts

Several scripts are provided to help with testing and initialization:

1. **Initialize the tokens and governance system**:
   ```bash
   anchor run initialize
   ```

2. **Create a test CDP**:
   ```bash
   anchor run create_cdp
   ```

3. **Create a test governance proposal**:
   ```bash
   anchor run create_proposal
   ```

## How to Use

### Creating a CDP

To create a CDP, users need to:

1. Deposit collateral (SOL or other supported tokens)
2. Specify the amount of SAI to mint
3. Ensure the collateralization ratio is above the minimum requirement (150%)

Example code:
```javascript
const collateralAmount = new BN(2 * 1_000_000_000); // 2 SOL
const saiAmount = new BN(100 * 1_000_000); // 100 SAI

const tx = await saiProgram.methods
    .initializeCdp(collateralAmount, saiAmount)
    .accounts({
        // account details
    })
    .signers([wallet])
    .rpc();
```

### Managing a CDP

Users can add more collateral, draw more SAI, or repay SAI as needed:

```javascript
// Draw more SAI
const drawAmount = new BN(50 * 1_000_000); // 50 SAI
await saiProgram.methods
    .drawSai(drawAmount)
    .accounts({
        // account details
    })
    .signers([wallet])
    .rpc();

// Repay SAI
const repayAmount = new BN(25 * 1_000_000); // 25 SAI
await saiProgram.methods
    .repaySai(repayAmount)
    .accounts({
        // account details
    })
    .signers([wallet])
    .rpc();
```

### Participating in Governance

SLD token holders can create and vote on proposals:

```javascript
// Create a proposal
const tx = await sldProgram.methods
    .createProposal(
        "Title",
        "Description",
        instructionData,
        programId,
        accounts
    )
    .accounts({
        // account details
    })
    .signers([wallet])
    .rpc();

// Vote on a proposal
await sldProgram.methods
    .castVote(true) // true for vote in favor, false for against
    .accounts({
        // account details
    })
    .signers([wallet])
    .rpc();
```

## Program Accounts

### SAI Program Accounts

- **CDP**: Stores information about a collateralized debt position
- **Vault**: Holds the collateral for a CDP
- **SAI Mint**: The token mint for the SAI stablecoin

### SLD Program Accounts

- **Governance**: Stores governance parameters and proposal count
- **Proposal**: Stores information about a governance proposal
- **VoteRecord**: Records a user's vote on a proposal
- **SLD Mint**: The token mint for the SLD governance token

## Security Considerations

- Always ensure that CDPs maintain a safe collateralization ratio to avoid liquidation
- Private keys should be kept secure and never exposed
- The program uses PDAs for various security critical operations

## License

This project is licensed under the MIT License - see the LICENSE file for details. 