import React, { useState, useEffect } from 'react';
import '../styles/GovernanceInterface.css';
import { getAllProposals as getProposals, getProposalInfo as getProposalDetails, castVote, createProposal } from '../api';

const GovernanceInterface = ({ walletConnected, connectWallet }) => {
  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState([]);
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [proposalDetails, setProposalDetails] = useState(null);
  const [sdlBalance, setSdlBalance] = useState(5000);
  const [votingPower, setVotingPower] = useState(5000);
  
  // Form state for creating a proposal
  const [newProposal, setNewProposal] = useState({
    title: '',
    description: '',
    changes: '',
  });
  
  // Load proposals on component mount
  useEffect(() => {
    if (walletConnected) {
      loadProposals();
    }
  }, [walletConnected]);
  
  // Load proposal details when a proposal is selected
  useEffect(() => {
    if (selectedProposal) {
      loadProposalDetails(selectedProposal);
    }
  }, [selectedProposal]);
  
  // Load all proposals
  const loadProposals = async () => {
    try {
      setLoading(true);
      const data = await getProposals();
      setProposals(data);
      
      // Select the first proposal by default if none is selected
      if (data.length > 0 && !selectedProposal) {
        setSelectedProposal(data[0].id);
      }
    } catch (error) {
      console.error("Error loading proposals:", error);
    } finally {
      setLoading(false);
    }
  };
  
  // Load details for a specific proposal
  const loadProposalDetails = async (proposalId) => {
    try {
      setLoading(true);
      const details = await getProposalDetails(proposalId);
      setProposalDetails(details);
    } catch (error) {
      console.error("Error loading proposal details:", error);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle voting on a proposal
  const handleVote = async (vote) => {
    if (!selectedProposal) return;
    
    try {
      setLoading(true);
      await castVote(selectedProposal, vote);
      await loadProposalDetails(selectedProposal);
      await loadProposals(); // Refresh the list to update vote counts
    } catch (error) {
      console.error("Error casting vote:", error);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle input change for new proposal form
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewProposal((prev) => ({
      ...prev,
      [name]: value,
    }));
  };
  
  // Handle creating a new proposal
  const handleCreateProposal = async (e) => {
    e.preventDefault();
    
    if (!newProposal.title || !newProposal.description || !newProposal.changes) {
      return;
    }
    
    try {
      setLoading(true);
      await createProposal(
        newProposal.title,
        newProposal.description,
        newProposal.changes
      );
      
      // Reset form and refresh proposals
      setNewProposal({
        title: '',
        description: '',
        changes: '',
      });
      
      await loadProposals();
    } catch (error) {
      console.error("Error creating proposal:", error);
    } finally {
      setLoading(false);
    }
  };
  
  // Calculate progress percentage for votes
  const calculateProgress = (forVotes, againstVotes) => {
    const total = forVotes + againstVotes;
    if (total === 0) return 0;
    return (forVotes / total) * 100;
  };
  
  // Render list of proposals
  const renderProposalList = () => {
    if (proposals.length === 0) {
      return (
        <div className="empty-state">
          <p>No proposals found.</p>
          <p>Create a new proposal to get started!</p>
        </div>
      );
    }
    
    return (
      <div className="proposal-list">
        <h3>Governance Proposals</h3>
        <div className="proposal-cards">
          {proposals.map((proposal) => (
            <div
              key={proposal.id}
              className={`proposal-card ${selectedProposal === proposal.id ? 'selected' : ''}`}
              onClick={() => setSelectedProposal(proposal.id)}
            >
              <div className="proposal-header">
                <span className={`proposal-status ${proposal.status}`}>{proposal.status}</span>
                <span className="proposal-date">Ends: {proposal.endDate}</span>
              </div>
              <h4 className="proposal-title">{proposal.title}</h4>
              <p className="proposal-description">{proposal.description}</p>
              <div className="vote-progress">
                <div className="progress-bar">
                  <div 
                    className="progress-fill for" 
                    style={{ width: `${calculateProgress(proposal.forVotes, proposal.againstVotes)}%` }}
                  ></div>
                </div>
                <div className="vote-counts">
                  <span className="for">For: {proposal.forVotes.toLocaleString()}</span>
                  <span className="against">Against: {proposal.againstVotes.toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };
  
  // Render proposal details
  const renderProposalDetails = () => {
    if (!proposalDetails) return null;
    
    return (
      <div className="proposal-details card">
        <div className="proposal-detail-header">
          <h3>{proposalDetails.title}</h3>
          <span className={`proposal-status ${proposalDetails.status}`}>{proposalDetails.status}</span>
        </div>
        
        <p className="proposal-summary">{proposalDetails.description}</p>
        
        <div className="proposal-metadata">
          <div className="metadata-item">
            <span className="label">Start Date</span>
            <span className="value">{proposalDetails.startDate}</span>
          </div>
          <div className="metadata-item">
            <span className="label">End Date</span>
            <span className="value">{proposalDetails.endDate}</span>
          </div>
          <div className="metadata-item">
            <span className="label">Quorum</span>
            <span className="value">{proposalDetails.quorum.toLocaleString()} SDL</span>
          </div>
          <div className="metadata-item">
            <span className="label">Executor</span>
            <span className="value">{proposalDetails.executor}</span>
          </div>
        </div>
      </div>
    );
  };
  
  return (
    <div className="governance-interface">
      {renderProposalList()}
      {renderProposalDetails()}
    </div>
  );
};

export default GovernanceInterface;