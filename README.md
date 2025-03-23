# SOLidify - Solana-based MakerDAO Clone

SOLidify is a decentralized finance (DeFi) application built on the Solana blockchain that replicates core MakerDAO functionality. Users can create Collateralized Debt Positions (CDPs) to generate SAI stablecoins against their deposited collateral.

![SOLidify App Screenshot](https://i.imgur.com/your_screenshot_here.jpg)

## Features

- **SAI Stablecoin**: A stable cryptocurrency soft-pegged to the US Dollar
- **Collateralized Debt Positions (CDPs)**: Deposit SOL as collateral to mint SAI tokens
- **Governance System**: Community-driven protocol governance using SLD governance tokens
- **Lightning-fast transactions**: Built on Solana for near-instant confirmations and low fees
- **Modern UI**: Dark mode interface with responsive design

## Getting Started

### Prerequisites

- Node.js v16 or later
- npm or yarn
- Phantom Wallet browser extension

### Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/SOLidify.git
cd SOLidify/solana-makerdao-clone
```

2. Install dependencies:

```bash
npm install
```

3. Run the development server with mock data:

```bash
./start_app.sh
```

The application will start in development mode with mock data, allowing you to test all features without connecting to the Solana blockchain.

### Using Real Solana Network

To use the real Solana network (devnet):

1. Edit the `.env.local` file:

```
REACT_APP_USE_MOCK=false
```

2. Ensure you have SOL in your Phantom wallet on devnet
3. Run the application:

```bash
npm start
```

## Project Structure

- `src/components/` - React components for the UI
- `src/api/` - API interaction with Solana blockchain
- `src/scripts/` - Utility scripts for setup and testing
- `src/styles/` - CSS files for styling components

## Development

### Available Scripts

- `npm start` - Starts the development server
- `npm run build` - Builds the app for production
- `npm run initialize` - Initializes the protocol on devnet
- `npm run create-cdp` - Creates a test CDP
- `npm run create-proposal` - Creates a test governance proposal

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- Inspired by [MakerDAO](https://makerdao.com/)
- Built with [Solana](https://solana.com/)
- UI inspired by modern DeFi applications like [Legion](https://legion.cc)
