# SOLidify Testing Guide

This guide provides instructions for testing the SOLidify dApp without requiring real Solana tokens or blockchain interactions.

## Mock Testing Setup

We've created a mock testing environment that simulates the SOLidify dApp functionality without requiring devnet SOL or real blockchain transactions. This allows for quick testing and UI development.

### 1. Generate Mock Data

First, generate the mock data by running:

```bash
node src/tools/start_frontend_demo.js
```

This creates JSON files in the `mock` directory that simulate token information, CDP details, and governance proposals.

### 2. Use the Demo API

The demo API implementation (`src/api_demo.js`) provides all the necessary functions to interact with the dApp without real blockchain transactions. It simulates:

- Wallet connection
- Token balances
- CDP creation and management
- Governance proposals and voting

To use this API in your frontend, import from `api_demo.js` instead of the regular `api.js`.

### 3. Run the Simulation

You can run a simulation of the core protocol functionality with:

```bash
node src/tools/test_faucet.js
```

This simulates the initialization, CDP creation, and governance processes, providing mock addresses and balances.

## Testing with Real Blockchain (When Devnet SOL is Available)

When you're ready to test with the actual blockchain:

1. Obtain devnet SOL from a working faucet or transfer from another wallet
2. Import your test wallet into Phantom using the private key in `phantom_private_key.txt`
3. Make sure Phantom is set to Devnet network
4. Run the initialization script: `node src/scripts/initialize.js`
5. Run the CDP creation script: `node src/scripts/create_cdp.js`
6. Run the governance proposal script: `node src/scripts/create_proposal.js`

## Troubleshooting

### Devnet SOL Issues

If you're unable to obtain devnet SOL, you can:

1. Try alternative faucets:
   - Visit https://solfaucet.com
   - Try the Solana CLI: `solana airdrop 1 YOUR_ADDRESS --url devnet`

2. Modify scripts to work with lower SOL amounts:
   - The `initialize.js` script has been modified to work with as little as 0.01 SOL

### Phantom Wallet Setup

1. Import your wallet using the private key in `phantom_private_key.txt`
2. Set Phantom to Devnet network (Settings > Developer Settings > Change Network > Devnet)
3. Add custom tokens for SAI and SLD after running the initialization script

## Mock API Reference

The mock API provides the following functions:

- `connectWallet()` - Simulates wallet connection
- `getTokenBalances()` - Returns mock token balances
- `createCDP(collateralAmount)` - Creates a simulated CDP
- `getCDPDetails(cdpAddress)` - Returns mock CDP details
- `drawSAI(cdpAddress, saiAmount)` - Simulates drawing SAI
- `repaySAI(cdpAddress, saiAmount)` - Simulates repaying SAI
- `createProposal(title, description)` - Creates a mock proposal
- `voteOnProposal(proposalAddress, voteYes, voteAmount)` - Simulates voting

All functions return promises that resolve with mock data, simulating network delays to provide a realistic testing experience. 