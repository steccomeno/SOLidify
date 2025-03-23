// Mock API implementation for SOLidify frontend testing
// This file provides mock data instead of real blockchain interactions

import { PublicKey } from '@solana/web3.js';
import { BN } from '@project-serum/anchor';

// Mock data since imports may not work correctly
const saiTokenInfo = {
    saiMint: "SAImint111111111111111111111111111111111111",
    admin: "9o2xcedhF5QvRdiin6dVkaLi5ahCTf5ghoc5CmzY25CR",
};

const sldTokenInfo = {
    sldMint: "SLDmint111111111111111111111111111111111111",
    governance: "GOVacct111111111111111111111111111111111111",
    admin: "9o2xcedhF5QvRdiin6dVkaLi5ahCTf5ghoc5CmzY25CR",
};

const cdpInfo = {
    cdpAddress: "CDPacct111111111111111111111111111111111111",
    owner: "9o2xcedhF5QvRdiin6dVkaLi5ahCTf5ghoc5CmzY25CR",
    collateralAmount: 10 * 1_000_000_000, // 10 SOL in lamports
    saiDebt: 7.5 * 1_000_000, // 7.5 SAI with 6 decimals
    lastAccrueTime: Date.now() / 1000,
    liquidationPrice: 7.5 / 10 * 1.2, // 120% of LTV
};

const proposalInfo = {
    proposalAddress: "PROPacct11111111111111111111111111111111111",
    proposer: "9o2xcedhF5QvRdiin6dVkaLi5ahCTf5ghoc5CmzY25CR",
    title: "Increase Minimum Vote Threshold",
    description: "Proposal to increase the minimum vote threshold for governance proposals to ensure greater participation.",
    voteStart: Date.now() / 1000,
    voteEnd: (Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days from now
    yesVotes: 750000 * 1_000_000, // 750,000 SLD
    noVotes: 250000 * 1_000_000, // 250,000 SLD
    status: "active",
};

// Connection state
let isConnected = false;
let walletAddress = null;

// Mock balances
const mockBalances = {
    sol: 10,
    sai: 7.5,
    sld: 100000,
};

// Connect wallet
export const connectWallet = async () => {
    try {
        console.log("Connecting mock wallet...");
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate connection delay
        
        isConnected = true;
        walletAddress = "9o2xcedhF5QvRdiin6dVkaLi5ahCTf5ghoc5CmzY25CR";
        
        return {
            success: true,
            address: walletAddress
        };
    } catch (error) {
        console.error("Mock wallet connection error:", error);
        return {
            success: false,
            error: error.message
        };
    }
};

// Disconnect wallet
export const disconnectWallet = () => {
    isConnected = false;
    walletAddress = null;
    return { success: true };
};

// Check if wallet is connected
export const isWalletConnected = () => {
    return isConnected;
};

// Get wallet address
export const getWalletAddress = () => {
    return walletAddress;
};

// Get token balances
export const getTokenBalances = async () => {
    if (!isConnected) {
        throw new Error("Wallet not connected");
    }
    
    await new Promise(resolve => setTimeout(resolve, 300)); // Simulate network delay
    
    return {
        sol: mockBalances.sol,
        sai: mockBalances.sai,
        sld: mockBalances.sld
    };
};

// Create CDP
export const createCDP = async (collateralAmount) => {
    if (!isConnected) {
        throw new Error("Wallet not connected");
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate transaction time
    
    // Update mock balances
    mockBalances.sol -= collateralAmount;
    mockBalances.sai += collateralAmount * 0.75; // 75% LTV
    
    return {
        success: true,
        signature: "mock_transaction_signature_" + Math.random().toString(36).substring(2, 15),
        cdpAddress: cdpInfo.cdpAddress
    };
};

// Get CDP details
export const getCDPDetails = async (cdpAddress) => {
    await new Promise(resolve => setTimeout(resolve, 300)); // Simulate network delay
    
    return {
        owner: cdpInfo.owner,
        collateralAmount: cdpInfo.collateralAmount / 1_000_000_000, // Convert from lamports to SOL
        saiDebt: cdpInfo.saiDebt / 1_000_000, // Convert from raw to SAI
        liquidationPrice: cdpInfo.liquidationPrice,
        lastAccrueTime: new Date(cdpInfo.lastAccrueTime * 1000).toISOString()
    };
};

// Add collateral to CDP
export const addCollateral = async (cdpAddress, collateralAmount) => {
    if (!isConnected) {
        throw new Error("Wallet not connected");
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate transaction time
    
    // Update mock balances
    mockBalances.sol -= collateralAmount;
    
    return {
        success: true,
        signature: "mock_transaction_signature_" + Math.random().toString(36).substring(2, 15)
    };
};

// Draw SAI from CDP
export const drawSAI = async (cdpAddress, saiAmount) => {
    if (!isConnected) {
        throw new Error("Wallet not connected");
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate transaction time
    
    // Update mock balances
    mockBalances.sai += saiAmount;
    
    return {
        success: true,
        signature: "mock_transaction_signature_" + Math.random().toString(36).substring(2, 15)
    };
};

// Repay SAI to CDP
export const repaySAI = async (cdpAddress, saiAmount) => {
    if (!isConnected) {
        throw new Error("Wallet not connected");
    }
    
    if (mockBalances.sai < saiAmount) {
        throw new Error("Insufficient SAI balance");
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate transaction time
    
    // Update mock balances
    mockBalances.sai -= saiAmount;
    
    return {
        success: true,
        signature: "mock_transaction_signature_" + Math.random().toString(36).substring(2, 15)
    };
};

// Withdraw collateral from CDP
export const withdrawCollateral = async (cdpAddress, collateralAmount) => {
    if (!isConnected) {
        throw new Error("Wallet not connected");
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate transaction time
    
    // Update mock balances
    mockBalances.sol += collateralAmount;
    
    return {
        success: true,
        signature: "mock_transaction_signature_" + Math.random().toString(36).substring(2, 15)
    };
};

// Create governance proposal
export const createProposal = async (title, description) => {
    if (!isConnected) {
        throw new Error("Wallet not connected");
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate transaction time
    
    return {
        success: true,
        signature: "mock_transaction_signature_" + Math.random().toString(36).substring(2, 15),
        proposalAddress: proposalInfo.proposalAddress
    };
};

// Get proposal details
export const getProposalDetails = async (proposalAddress) => {
    await new Promise(resolve => setTimeout(resolve, 300)); // Simulate network delay
    
    return {
        proposer: proposalInfo.proposer,
        title: proposalInfo.title,
        description: proposalInfo.description,
        voteStart: new Date(proposalInfo.voteStart * 1000).toISOString(),
        voteEnd: new Date(proposalInfo.voteEnd * 1000).toISOString(),
        yesVotes: proposalInfo.yesVotes / 1_000_000, // Convert from raw to SLD
        noVotes: proposalInfo.noVotes / 1_000_000, // Convert from raw to SLD
        status: proposalInfo.status
    };
};

// Vote on proposal
export const voteOnProposal = async (proposalAddress, voteYes, voteAmount) => {
    if (!isConnected) {
        throw new Error("Wallet not connected");
    }
    
    if (mockBalances.sld < voteAmount) {
        throw new Error("Insufficient SLD balance");
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate transaction time
    
    // Update mock vote counts
    if (voteYes) {
        proposalInfo.yesVotes += voteAmount * 1_000_000;
    } else {
        proposalInfo.noVotes += voteAmount * 1_000_000;
    }
    
    return {
        success: true,
        signature: "mock_transaction_signature_" + Math.random().toString(36).substring(2, 15)
    };
};

// Get all proposals
export const getAllProposals = async () => {
    await new Promise(resolve => setTimeout(resolve, 300)); // Simulate network delay
    
    return [
        {
            address: proposalInfo.proposalAddress,
            title: proposalInfo.title,
            voteEnd: new Date(proposalInfo.voteEnd * 1000).toISOString(),
            yesVotes: proposalInfo.yesVotes / 1_000_000,
            noVotes: proposalInfo.noVotes / 1_000_000,
            status: proposalInfo.status
        },
        {
            address: "PROPacct22222222222222222222222222222222222",
            title: "Reduce Stability Fee",
            voteEnd: new Date((Date.now() / 1000 + 3 * 24 * 60 * 60) * 1000).toISOString(),
            yesVotes: 800000,
            noVotes: 200000,
            status: "active"
        },
        {
            address: "PROPacct33333333333333333333333333333333333",
            title: "Add New Collateral Type",
            voteEnd: new Date((Date.now() / 1000 - 2 * 24 * 60 * 60) * 1000).toISOString(),
            yesVotes: 900000,
            noVotes: 100000,
            status: "executed"
        }
    ];
}; 