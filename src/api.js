import { Connection, PublicKey, clusterApiUrl, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction } from '@solana/web3.js';
import { Program, AnchorProvider, BN, web3 } from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import saiIdl from './idl/sai.json';
import sldIdl from './idl/sld.json';
import {
  getPythPrice,
  checkLiquidationRisk,
  getActiveLiquidations,
  getLiquidationHistory,
  placeLiquidationBid,
  checkAndLiquidateVaults,
  mockPrices
} from './api/mockLiquidation';

// Connection setup
const getProvider = () => {
const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
    const provider = new AnchorProvider(
        connection, 
        window.solana, 
        { preflightCommitment: 'processed' }
    );
    return provider;
};

// Program IDs - replace with your actual deployed program IDs
const SAI_PROGRAM_ID = new PublicKey('7rh8cXvRFHZJ5XA1JKDCj2qUQNcU9v1HQE8zQWu9CJf8');
const SLD_PROGRAM_ID = new PublicKey('GK9EdzoYPrJxkYYRF9qcheFK5h7GEy5jgUqKaM2VTTcK');

// Token mint IDs - replace with your actual deployed token mints
const SAI_MINT = new PublicKey('9cHhBUkbs1VbLxts6qxdbKZJ3iGXxX2nfBKNYGvKutKY');
const SLD_MINT = new PublicKey('5sM9xxcBTM9rWza6nEgq2cyyCTHjUPreKdgJxNcqELDV');

// Initialize programs
const getSaiProgram = () => {
    const provider = getProvider();
    return new Program(saiIdl, SAI_PROGRAM_ID, provider);
};

const getSldProgram = () => {
    const provider = getProvider();
    return new Program(sldIdl, SLD_PROGRAM_ID, provider);
};

// Utility function to get or create associated token account
const getOrCreateAssociatedTokenAccount = async (mint, owner) => {
    const provider = getProvider();
    const connection = provider.connection;
    
    // Find the associated token address
    const associatedTokenAddress = await getAssociatedTokenAddress(
        mint,
        owner,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    // Check if the account exists
    try {
        await connection.getAccountInfo(associatedTokenAddress);
        return associatedTokenAddress;
    } catch (error) {
        // Create the account if it doesn't exist
        const transaction = new Transaction().add(
            createAssociatedTokenAccountInstruction(
                provider.wallet.publicKey,
                associatedTokenAddress,
                owner,
                mint,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            )
        );
        
        await provider.sendAndConfirm(transaction);
        return associatedTokenAddress;
    }
};

// CDP Functions

export const createCDP = async (collateralAmount, saiAmount, collateralMint) => {
    try {
        const program = getSaiProgram();
        const provider = getProvider();
        
        // Create a new CDP account
        const cdp = web3.Keypair.generate();
        
        // Get the vault authority PDA
        const [vaultAuthority, vaultAuthorityBump] = await PublicKey.findProgramAddressSync(
            [Buffer.from("vault_authority")],
            program.programId
        );
        
        // Get the vault PDA
        const [vault, vaultBump] = await PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), cdp.publicKey.toBuffer()],
            program.programId
        );
        
        // Get or create owner's collateral token account
        const ownerCollateral = await getOrCreateAssociatedTokenAccount(
            collateralMint,
            provider.wallet.publicKey
        );
        
        // Initialize CDP
        const tx = await program.methods
            .initializeCdp(
                new BN(collateralAmount),
                new BN(saiAmount)
            )
            .accounts({
                owner: provider.wallet.publicKey,
                cdp: cdp.publicKey,
                ownerCollateral,
                collateralMint,
                vault,
                vaultAuthority,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                rent: SYSVAR_RENT_PUBKEY,
            })
            .signers([cdp])
            .rpc();
            
        return { tx, cdpAddress: cdp.publicKey.toString() };
    } catch (error) {
        console.error('Error creating CDP:', error);
        throw error;
    }
};

export const addCollateral = async (cdpAddress, amount, collateralMint) => {
    try {
        const program = getSaiProgram();
        const provider = getProvider();
        const cdpPublicKey = new PublicKey(cdpAddress);
        
        // Get the vault PDA
        const [vault, vaultBump] = await PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), cdpPublicKey.toBuffer()],
            program.programId
        );
        
        // Get owner's collateral token account
        const ownerCollateral = await getOrCreateAssociatedTokenAccount(
            collateralMint,
            provider.wallet.publicKey
        );
        
        // Add collateral
        const tx = await program.methods
            .addCollateral(new BN(amount))
            .accounts({
                owner: provider.wallet.publicKey,
                cdp: cdpPublicKey,
                ownerCollateral,
                vault,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .rpc();
            
        return tx;
    } catch (error) {
        console.error('Error adding collateral:', error);
        throw error;
    }
};

export const drawSai = async (cdpAddress, amount, collateralMint) => {
    try {
        const program = getSaiProgram();
        const provider = getProvider();
        const cdpPublicKey = new PublicKey(cdpAddress);
        
        // Get the vault PDA
        const [vault, vaultBump] = await PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), cdpPublicKey.toBuffer()],
            program.programId
        );
        
        // Get owner's collateral token account
        const ownerCollateral = await getOrCreateAssociatedTokenAccount(
            collateralMint,
            provider.wallet.publicKey
        );
        
        // Draw SAI
        const tx = await program.methods
            .drawSai(new BN(amount))
            .accounts({
                owner: provider.wallet.publicKey,
                cdp: cdpPublicKey,
                ownerCollateral,
                vault,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .rpc();
            
        return tx;
    } catch (error) {
        console.error('Error drawing SAI:', error);
        throw error;
    }
};

export const repaySai = async (cdpAddress, amount, collateralMint) => {
    try {
        const program = getSaiProgram();
        const provider = getProvider();
        const cdpPublicKey = new PublicKey(cdpAddress);
        
        // Get the vault PDA
        const [vault, vaultBump] = await PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), cdpPublicKey.toBuffer()],
            program.programId
        );
        
        // Get owner's collateral token account
        const ownerCollateral = await getOrCreateAssociatedTokenAccount(
            collateralMint,
            provider.wallet.publicKey
        );
        
        // Repay SAI
        const tx = await program.methods
            .repaySai(new BN(amount))
            .accounts({
                owner: provider.wallet.publicKey,
                cdp: cdpPublicKey,
                ownerCollateral,
                vault,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .rpc();
            
        return tx;
    } catch (error) {
        console.error('Error repaying SAI:', error);
        throw error;
    }
};

export const closeCDP = async (cdpAddress, collateralMint) => {
    try {
        const program = getSaiProgram();
        const provider = getProvider();
        const cdpPublicKey = new PublicKey(cdpAddress);
        
        // Get the vault PDA
        const [vault, vaultBump] = await PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), cdpPublicKey.toBuffer()],
            program.programId
        );
        
        // Get the vault authority PDA
        const [vaultAuthority, vaultAuthorityBump] = await PublicKey.findProgramAddressSync(
            [Buffer.from("vault_authority")],
            program.programId
        );
        
        // Get owner's collateral token account
        const ownerCollateral = await getOrCreateAssociatedTokenAccount(
            collateralMint,
            provider.wallet.publicKey
        );
        
        // Close CDP
        const tx = await program.methods
            .closeCdp()
            .accounts({
                owner: provider.wallet.publicKey,
                cdp: cdpPublicKey,
                ownerCollateral,
                vault,
                vaultAuthority,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .rpc();
            
        return tx;
    } catch (error) {
        console.error('Error closing CDP:', error);
        throw error;
    }
};

// CDP User Functions

export const getUserCDPs = async () => {
    try {
        // For demo purposes, return mocked CDPs
        // In a real implementation, this would fetch the user's CDPs from the Solana blockchain
        return [
            {
                address: "9XyR74WRdQW5V7MzM3cYvTpvHoJuSKRgFHmQNfpJQ9V5",
                collateral: 10.5,
                debt: 5000,
                collateralType: "SOL",
                collateralRatio: 210,
                liquidationPrice: 476.19,
                status: "safe"
            },
            {
                address: "2kdHr2Qf2PKy5aS1xiWZSCDfScRjPJQVF7JMPvGfsyoW",
                collateral: 25,
                debt: 10000,
                collateralType: "SOL",
                collateralRatio: 250,
                liquidationPrice: 400,
                status: "safe"
            },
            {
                address: "6TpfVD7iByi2r8BKJhYXRt15XDYeziWck1PXsnx7SYi4",
                collateral: 5,
                debt: 2800,
                collateralType: "SOL",
                collateralRatio: 178.57,
                liquidationPrice: 560,
                status: "warning"
            }
        ];
    } catch (error) {
        console.error('Error getting user CDPs:', error);
        return [];
    }
};

export const getCDPInfo = async (cdpAddress) => {
    try {
        // For demo purposes, return mocked CDP details
        // In a real implementation, this would fetch the CDP details from the Solana blockchain
        const allCdps = await getUserCDPs();
        const cdp = allCdps.find(c => c.address === cdpAddress);
        
        if (!cdp) {
            throw new Error('CDP not found');
        }
        
        return {
            ...cdp,
            stabilityFee: "1%",
            liquidationPenalty: "13%",
            minimumRatio: "150%",
            createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            lastAction: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            currentPrice: 1000, // Current price of collateral in USD
            availableToWithdraw: cdp.collateral - (cdp.debt * 1.5 / 1000), // Based on minimum ratio
            availableToDraw: (cdp.collateral * 1000 / 1.5) - cdp.debt // Based on minimum ratio
        };
    } catch (error) {
        console.error('Error getting CDP info:', error);
        throw error;
    }
};

// Governance Functions

export const createProposal = async (title, description, action, parameters) => {
    try {
        // For demo purposes, return a mock transaction signature
        // In a real implementation, this would create a proposal on the Solana blockchain
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate blockchain delay
        return {
            signature: "5KL6aQ4NzPdmShPG6JpDwVTRMrwcSUwRvFBGgTLwKjMPjHbbrELf3w7HZUCCirnQXk4sne4yv8HzJcA5PUcVZMtP",
            proposalId: Math.floor(Math.random() * 1000000).toString()
        };
    } catch (error) {
        console.error('Error creating proposal:', error);
        throw error;
    }
};

export const castVote = async (proposalId, support) => {
    try {
        // For demo purposes, return a mock transaction signature
        // In a real implementation, this would cast a vote on the Solana blockchain
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate blockchain delay
        return {
            signature: "3rV7bA6N5E6UE9xWzrZVpzKn1s4cHMzDQjrDSxMVL7ReUvkJNEB2ZhepUDCyGUyGCzX94MjAE5hKXUQGkiwvMYbV",
            success: true
        };
    } catch (error) {
        console.error('Error casting vote:', error);
        throw error;
    }
};

export const executeProposal = async (proposalId) => {
    try {
        // For demo purposes, return a mock transaction signature
        // In a real implementation, this would execute a proposal on the Solana blockchain
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate blockchain delay
        return {
            signature: "4vSD7nhyGCbVBkGzNzMrQrAFXnzw6JrZiCScfvXMzDCo1CHQVMUfcNBp3FXQ5FwvMpXvS9hXdnUuFsYVJJCsQME2",
            success: true
        };
    } catch (error) {
        console.error('Error executing proposal:', error);
        throw error;
    }
};

export const getGovernanceData = async () => {
    try {
        // For demo purposes, return mock data
        // In a real implementation, this would fetch data from the Solana blockchain
        return {
            proposals: [
                {
                    id: '1',
                    title: 'Adjust Liquidation Ratio',
                    description: 'Proposal to adjust the liquidation ratio from 150% to 155% to improve system stability',
                    status: 'active',
                    votesFor: 42500,
                    votesAgainst: 15750,
                    endDate: Date.now() + 86400000 * 3, // 3 days from now
                    action: 'updateRatio',
                    parameters: '155',
                    proposer: 'DeF1User.sol',
                    createdAt: Date.now() - 86400000 * 2 // 2 days ago
                },
                {
                    id: '2',
                    title: 'Reduce Stability Fee',
                    description: 'Proposal to reduce the stability fee from 1% to 0.5% to encourage more CDP creation',
                    status: 'passed',
                    votesFor: 65280,
                    votesAgainst: 12340,
                    endDate: Date.now() - 86400000, // 1 day ago
                    action: 'updateFee',
                    parameters: '0.5',
                    proposer: 'SolFinance',
                    createdAt: Date.now() - 86400000 * 5 // 5 days ago
                },
                {
                    id: '3',
                    title: 'Add USDC as Collateral',
                    description: 'Proposal to add USDC as a valid collateral type for CDPs',
                    status: 'rejected',
                    votesFor: 28750,
                    votesAgainst: 48200,
                    endDate: Date.now() - 86400000 * 2, // 2 days ago
                    action: 'addCollateral',
                    parameters: 'USDC',
                    proposer: 'StableCoinDAO',
                    createdAt: Date.now() - 86400000 * 7 // 7 days ago
                }
            ],
            stats: {
                totalSLD: '1,000,000',
                activeSLD: '750,240',
                proposals: '14',
                activeProposals: '3'
            }
        };
    } catch (error) {
        console.error('Error getting governance data:', error);
        throw error;
    }
};

export const getUserSLDBalance = async () => {
    try {
        // For demo purposes, return a mock balance
        // In a real implementation, this would fetch the actual token balance from the Solana blockchain
        return 5000;
    } catch (error) {
        console.error('Error getting user SLD balance:', error);
        throw error;
    }
};

export const getProposalInfo = async (proposalAddress) => {
    try {
        const program = getSldProgram();
        const proposalPublicKey = new PublicKey(proposalAddress);
        
        // Fetch proposal data
        const proposalData = await program.account.proposal.fetch(proposalPublicKey);
        
        return {
            id: proposalData.id.toString(),
            proposer: proposalData.proposer.toString(),
            title: proposalData.title,
            description: proposalData.description,
            createdAt: new Date(proposalData.createdAt * 1000).toLocaleString(),
            votingEndsAt: new Date(proposalData.votingEndsAt * 1000).toLocaleString(),
            executed: proposalData.executed,
            votesFor: proposalData.votesFor.toString(),
            votesAgainst: proposalData.votesAgainst.toString(),
            programId: proposalData.programId.toString(),
        };
    } catch (error) {
        console.error('Error fetching proposal info:', error);
        throw error;
    }
};

export const getAllProposals = async () => {
    try {
        const program = getSldProgram();
        
        // Find all proposals
        const proposals = await program.account.proposal.all();
        
        return proposals.map(proposal => {
            return {
                address: proposal.publicKey.toString(),
                id: proposal.account.id.toString(),
                proposer: proposal.account.proposer.toString(),
                title: proposal.account.title,
                description: proposal.account.description,
                createdAt: new Date(proposal.account.createdAt * 1000).toLocaleString(),
                votingEndsAt: new Date(proposal.account.votingEndsAt * 1000).toLocaleString(),
                executed: proposal.account.executed,
                votesFor: proposal.account.votesFor.toString(),
                votesAgainst: proposal.account.votesAgainst.toString()
            };
        });
    } catch (error) {
        console.error('Error fetching all proposals:', error);
        throw error;
    }
};

// Wallet connection
export const connectWallet = async () => {
    try {
        // Check if Phantom wallet is available
        if (!window.solana || !window.solana.isPhantom) {
            alert('Phantom wallet is not installed. Please install it to use this application.');
            return false;
        }

        // Connect to the wallet
        await window.solana.connect();
        return true;
    } catch (error) {
        console.error('Error connecting to wallet:', error);
        return false;
    }
};

// Add these exports near the end of the file, before the last export
export const getOraclePrice = async (assetSymbol) => {
  try {
    return await getPythPrice(assetSymbol);
  } catch (error) {
    console.error('Error getting oracle price:', error);
    throw error;
  }
};

export const checkVaultLiquidationRisk = async (cdpAddress) => {
  try {
    // Get the CDP details
    const cdp = await getCDPInfo(cdpAddress);
    
    // Determine collateral type (simplified for mock)
    const collateralType = cdp.collateralMint.toString() === SAI_MINT.toString() ? 'SOL' : 'USDC';
    
    // Format the data for the liquidation risk check
    const cdpData = {
      id: cdpAddress,
      collateralAmount: cdp.collateralAmount,
      debtAmount: cdp.debtAmount,
      collateralType,
    };
    
    return await checkLiquidationRisk(cdpData);
  } catch (error) {
    console.error('Error checking vault liquidation risk:', error);
    throw error;
  }
};

export const getCollateralPrice = async (collateralType) => {
  try {
    const price = await getOraclePrice(collateralType);
    return price.price;
  } catch (error) {
    console.error(`Error getting ${collateralType} price:`, error);
    // Fallback to static price if oracle call fails
    return mockPrices[collateralType] || 0;
  }
};

export const getAllActiveLiquidations = async () => {
  try {
    return await getActiveLiquidations();
  } catch (error) {
    console.error('Error getting active liquidations:', error);
    throw error;
  }
};

export const getLiquidationHistoryForUser = async (limit = 10) => {
  try {
    const liquidations = await getLiquidationHistory(limit);
    // In a real implementation, we would filter by the user's public key
    // For demo purposes, just return all liquidations
    return liquidations;
  } catch (error) {
    console.error('Error getting liquidation history:', error);
    throw error;
  }
};

export const bidOnLiquidationAuction = async (auctionId, bidAmount) => {
  try {
    return await placeLiquidationBid(auctionId, bidAmount);
  } catch (error) {
    console.error('Error placing bid on liquidation auction:', error);
    throw error;
  }
};

export const runLiquidationCheck = async () => {
  try {
    return await checkAndLiquidateVaults();
  } catch (error) {
    console.error('Error running liquidation check:', error);
    throw error;
  }
};
