const fs = require('fs');
const path = require('path');

// Generate mock data for frontend testing
function generateMockData() {
    console.log("Generating mock data for frontend testing...");
    
    // Mock SAI token info
    const saiTokenInfo = {
        saiMint: "SAImint111111111111111111111111111111111111",
        admin: "9o2xcedhF5QvRdiin6dVkaLi5ahCTf5ghoc5CmzY25CR",
    };
    
    // Mock SLD token info
    const sldTokenInfo = {
        sldMint: "SLDmint111111111111111111111111111111111111",
        governance: "GOVacct111111111111111111111111111111111111",
        admin: "9o2xcedhF5QvRdiin6dVkaLi5ahCTf5ghoc5CmzY25CR",
    };
    
    // Mock CDP info
    const cdpInfo = {
        cdpAddress: "CDPacct111111111111111111111111111111111111",
        owner: "9o2xcedhF5QvRdiin6dVkaLi5ahCTf5ghoc5CmzY25CR",
        collateralAmount: 10 * 1_000_000_000, // 10 SOL in lamports
        saiDebt: 7.5 * 1_000_000, // 7.5 SAI with 6 decimals
        lastAccrueTime: Date.now() / 1000,
        liquidationPrice: 7.5 / 10 * 1.2, // 120% of LTV
    };
    
    // Mock governance proposal
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
    
    // Save the mock data
    fs.writeFileSync(
        path.resolve(__dirname, '../../mock/sai_token_info.json'),
        JSON.stringify(saiTokenInfo, null, 2)
    );
    
    fs.writeFileSync(
        path.resolve(__dirname, '../../mock/sld_token_info.json'),
        JSON.stringify(sldTokenInfo, null, 2)
    );
    
    fs.writeFileSync(
        path.resolve(__dirname, '../../mock/cdp_info.json'),
        JSON.stringify(cdpInfo, null, 2)
    );
    
    fs.writeFileSync(
        path.resolve(__dirname, '../../mock/proposal_info.json'),
        JSON.stringify(proposalInfo, null, 2)
    );
    
    console.log("Mock data generated successfully!");
    console.log("You can now use this data for frontend testing without requiring blockchain interactions.");
    console.log("Location: ./mock/");
}

// Create mock directory if it doesn't exist
const mockDir = path.resolve(__dirname, '../../mock');
if (!fs.existsSync(mockDir)) {
    fs.mkdirSync(mockDir, { recursive: true });
}

generateMockData(); 