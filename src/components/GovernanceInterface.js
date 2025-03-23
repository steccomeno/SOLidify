import React, { useState, useEffect } from 'react';
import {
  getAllProposals as getProposals,
  getProposalInfo as getProposalDetails,
  castVote,
  createProposal,
  getUserSLDBalance,
  getGovernanceData,
  connectWallet
} from '../api';
import './GovernanceInterface.css';

// Function to format numbers with commas
const formatNumber = (num) => {
  if (num === undefined || num === null) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

// Function to parse Markdown-like content
const renderMarkdown = (content) => {
  if (!content) return null;
  
  return <div className="markdown-content" dangerouslySetInnerHTML={{ __html: content.replace(/\n/g, '<br>') }} />;
};

const GovernanceInterface = () => {
  const [walletConnected, setWalletConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState([]);
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [proposalDetails, setProposalDetails] = useState(null);
  const [sldBalance, setSldBalance] = useState(0);
  const [govData, setGovData] = useState({
    totalSLD: 0,
    activeProposals: 0,
    totalVotes: 0
  });
  const [activeTab, setActiveTab] = useState('all');

  // Load proposals on component mount
  useEffect(() => {
    loadProposals();
    checkIfWalletConnected();
  }, []);

  // Load proposal details when a proposal is selected
  useEffect(() => {
    if (selectedProposal) {
      loadProposalDetails(selectedProposal);
    } else {
      setProposalDetails(null);
    }
  }, [selectedProposal]);

  // Load governance data when wallet is connected
  useEffect(() => {
    if (walletConnected) {
      loadGovernanceData();
      loadSLDBalance();
    }
  }, [walletConnected]);

  const checkIfWalletConnected = async () => {
    try {
      const connected = await connectWallet();
      setWalletConnected(connected);
    } catch (error) {
      console.error("Failed to check wallet connection:", error);
    }
  };

  const handleConnectWallet = async () => {
    setLoading(true);
    try {
      const connected = await connectWallet();
      setWalletConnected(connected);
    } catch (error) {
      console.error("Failed to connect wallet:", error);
    } finally {
      setLoading(false);
    }
  };
  
  const loadProposals = async () => {
    try {
      setLoading(true);
      const fetchedProposals = await getProposals();
      setProposals(fetchedProposals);
      setLoading(false);
    } catch (error) {
      console.error('Error loading proposals:', error);
      setLoading(false);
    }
  };
  
  const loadProposalDetails = async (proposalId) => {
    try {
      setLoading(true);
      const details = await getProposalDetails(proposalId);
      setProposalDetails(details);
      setLoading(false);
    } catch (error) {
      console.error('Error loading proposal details:', error);
      setLoading(false);
    }
  };
  
  const loadSLDBalance = async () => {
    try {
      const balance = await getUserSLDBalance();
      setSldBalance(balance);
    } catch (error) {
      console.error('Error loading SLD balance:', error);
    }
  };
  
  const loadGovernanceData = async () => {
    try {
      const data = await getGovernanceData();
      setGovData(data);
    } catch (error) {
      console.error('Error loading governance data:', error);
    }
  };
  
  const handleVote = async (vote) => {
    if (!selectedProposal || !walletConnected) return;
    
    try {
      setLoading(true);
      await castVote(selectedProposal, vote);
      // Refresh the proposal details
      await loadProposalDetails(selectedProposal);
      setLoading(false);
    } catch (error) {
      console.error('Error casting vote:', error);
      setLoading(false);
    }
  };

  const filteredProposals = () => {
    if (activeTab === 'all') return proposals;
    return proposals.filter(proposal => {
      if (activeTab === 'active') return proposal.status === 'active';
      if (activeTab === 'passed') return proposal.status === 'passed';
      if (activeTab === 'defeated') return proposal.status === 'defeated' || proposal.status === 'rejected';
      if (activeTab === 'pending') return proposal.status === 'pending';
      return true;
    });
  };

  const calculatePassPercentage = (details) => {
    if (!details) return 0;
    const total = details.forVotes + details.againstVotes;
    if (total === 0) return 0;
    return Math.round((details.forVotes / total) * 100);
  };

  return (
    <div className="governance-interface">
      <div className="governance-header">
        <h1 className="governance-title">Governance</h1>
        <p className="governance-intro">
          Participate in the decentralized governance of SOLidify. Vote on proposals that shape the future of the protocol, from parameter changes to technical upgrades.
        </p>
      </div>
      
      {walletConnected && (
        <div className="governance-stats">
          <div className="governance-stat">
            <div className="stat-title">Your Voting Power</div>
            <div className="stat-value">{formatNumber(sldBalance)} SLD</div>
            <div className="stat-description">
              {govData.totalSLD > 0 ? ((sldBalance / govData.totalSLD) * 100).toFixed(2) : '0.00'}% of total supply
            </div>
          </div>
          
          <div className="governance-stat">
            <div className="stat-title">Total SLD Supply</div>
            <div className="stat-value">{formatNumber(govData.totalSLD)} SLD</div>
            <div className="stat-description">Distributed across all holders</div>
          </div>
          
          <div className="governance-stat">
            <div className="stat-title">Active Proposals</div>
            <div className="stat-value">{govData.activeProposals}</div>
            <div className="stat-description">Proposals currently being voted on</div>
          </div>
          
          <div className="governance-stat">
            <div className="stat-title">Total Votes Cast</div>
            <div className="stat-value">{formatNumber(govData.totalVotes)}</div>
            <div className="stat-description">Across all proposals</div>
          </div>
        </div>
      )}

      {!walletConnected ? (
        <div className="connect-prompt">
          <h2>Connect Your Wallet</h2>
          <p>Connect your wallet to view your voting power and participate in governance decisions.</p>
          <button 
            className="button primary-button"
            onClick={handleConnectWallet}
            disabled={loading}
          >
            {loading ? 'Connecting...' : 'Connect Wallet'}
          </button>
        </div>
      ) : (
        <div className="governance-content">
          <div className="proposals-list-container">
            <div className="proposals-filter">
              <button 
                className={`filter-tab ${activeTab === 'all' ? 'active' : ''}`} 
                onClick={() => setActiveTab('all')}
              >
                All
              </button>
              <button 
                className={`filter-tab ${activeTab === 'active' ? 'active' : ''}`} 
                onClick={() => setActiveTab('active')}
              >
                Active
              </button>
              <button 
                className={`filter-tab ${activeTab === 'passed' ? 'active' : ''}`} 
                onClick={() => setActiveTab('passed')}
              >
                Passed
              </button>
              <button 
                className={`filter-tab ${activeTab === 'defeated' ? 'active' : ''}`} 
                onClick={() => setActiveTab('defeated')}
              >
                Defeated
              </button>
              <button 
                className={`filter-tab ${activeTab === 'pending' ? 'active' : ''}`} 
                onClick={() => setActiveTab('pending')}
              >
                Pending
              </button>
            </div>
            
            {loading && proposals.length === 0 ? (
              <div className="proposals-loading">Loading proposals...</div>
            ) : filteredProposals().length === 0 ? (
              <div className="proposals-empty">
                <h3>No Proposals Found</h3>
                <p>There are no proposals in this category yet.</p>
              </div>
            ) : (
              <div className="proposals-list">
                {filteredProposals().map((proposal) => (
                  <div 
                    key={proposal.id} 
                    className={`proposal-card ${selectedProposal === proposal.id ? 'selected' : ''}`}
                    onClick={() => setSelectedProposal(proposal.id)}
                  >
                    <div className="proposal-header">
                      <div className="proposal-title">{proposal.title}</div>
                      <span className={`proposal-status status-${proposal.status}`}>
                        {proposal.status.charAt(0).toUpperCase() + proposal.status.slice(1)}
                      </span>
                    </div>
                    
                    <p className="proposal-description">{proposal.description}</p>
                    
                    <div className="proposal-meta">
                      <div className="proposal-date">
                        <span>Start: {proposal.startDate}</span>
                        <span>•</span>
                        <span>End: {proposal.endDate}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="proposal-details">
            {!selectedProposal || loading ? (
              <div className="proposal-details-placeholder">
                <h3>Select a Proposal</h3>
                <p>Choose a proposal from the list to view its details and vote on it.</p>
              </div>
            ) : (
              <div className="proposal-details-content">
                <div className="details-header">
                  <h2 className="details-title">{proposalDetails?.title}</h2>
                  <span className={`details-status status-${proposalDetails?.status}`}>
                    {proposalDetails?.status.charAt(0).toUpperCase() + proposalDetails?.status.slice(1)}
                  </span>
                  <p className="details-description">{proposalDetails?.description}</p>
                </div>
                
                <div className="vote-progress">
                  <div className="progress-header">
                    <div className="progress-title">Vote Progress</div>
                    <div className="vote-counts">
                      {formatNumber(proposalDetails?.forVotes || 0)} For / {formatNumber(proposalDetails?.againstVotes || 0)} Against
                    </div>
                  </div>
                  
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${calculatePassPercentage(proposalDetails)}%` }}
                    ></div>
                  </div>
                  
                  <div className="progress-labels">
                    <div className="vote-label">
                      <div className="label-color for-color"></div>
                      <span>For ({calculatePassPercentage(proposalDetails)}%)</span>
                    </div>
                    <div className="vote-label">
                      <div className="label-color against-color"></div>
                      <span>Against ({100 - calculatePassPercentage(proposalDetails)}%)</span>
                    </div>
                  </div>
                </div>
                
                <div className="proposal-metadata">
                  <div className="metadata-item">
                    <span className="metadata-label">Start Date</span>
                    <span className="metadata-value">{proposalDetails?.startDate}</span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">End Date</span>
                    <span className="metadata-value">{proposalDetails?.endDate}</span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">Quorum</span>
                    <span className="metadata-value">{formatNumber(proposalDetails?.quorum || 0)} SLD</span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">Executor</span>
                    <span className="metadata-value">{proposalDetails?.executor}</span>
                  </div>
                </div>
                
                <div className="proposal-content">
                  <h2>Proposal Details</h2>
                  {renderMarkdown(proposalDetails?.fullDescription)}
                </div>
                
                {proposalDetails?.status === 'active' && (
                  <div className="voting-section">
                    <h3>Cast Your Vote</h3>
                    <div className="voting-notice">
                      You have {formatNumber(sldBalance)} SLD voting power. Once cast, your vote cannot be changed.
                    </div>
                    <div className="voting-buttons">
                      <button 
                        className="vote-button vote-for"
                        onClick={() => handleVote('for')}
                        disabled={loading}
                      >
                        Vote For
                      </button>
                      <button 
                        className="vote-button vote-against"
                        onClick={() => handleVote('against')}
                        disabled={loading}
                      >
                        Vote Against
                      </button>
                    </div>
                  </div>
                )}
                
                {proposalDetails?.status === 'passed' && proposalDetails?.implementation && (
                  <div className="implementation-details">
                    <h3>Implementation</h3>
                    <p>{proposalDetails.implementation}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GovernanceInterface;