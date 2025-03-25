# SOLidify Task Assignments

This document outlines the assignment of tasks from our product roadmap to team members. Each task follows our collaborative workflow process and should be implemented according to the technical specifications.

## Sprint 1: Liquidation Engine & Oracle Integration

| Task | Assignee | Timeline | Branch | Status |
|------|----------|----------|--------|--------|
| Liquidation Engine Core Logic | @dev1 | Week 1-2 | `feature/liquidation-core` | Not Started |
| Pyth Oracle Integration | @dev2 | Week 1-2 | `feature/pyth-oracle` | Not Started |
| Dutch Auction Mechanism | @dev1 | Week 3 | `feature/dutch-auction` | Not Started |
| Frontend Liquidation UI | @dev3 | Week 2-3 | `feature/liquidation-ui` | Not Started |
| Integration Tests | @dev2 | Week 4 | `feature/liquidation-tests` | Not Started |
| Code Review & Integration | All | Week 4 | - | Not Started |

### Dependencies
- Pyth Oracle Integration must be completed before Liquidation Engine can be finalized
- Core logic needs to be implemented before UI components

### Definition of Done
- All unit tests pass
- Integration tests validate complete liquidation flow
- Code reviewed and approved by at least one other team member
- Documentation updated and comprehensive
- Successfully deployed and tested on Devnet

## Sprint 2: Solana-Native Features

| Task | Assignee | Timeline | Branch | Status |
|------|----------|----------|--------|--------|
| SLD Staking via Marinade | @dev2 | Week 1-2 | `feature/sld-staking` | Not Started |
| BONK Collateral Integration | @dev1 | Week 1-2 | `feature/bonk-collateral` | Not Started |
| Governance Power Calculation | @dev2 | Week 3 | `feature/gov-power-calc` | Not Started |
| Staking UI Components | @dev3 | Week 2-3 | `feature/staking-ui` | Not Started |
| BONK Collateral UI | @dev3 | Week 2-3 | `feature/bonk-ui` | Not Started |
| Integration Tests | @dev1 | Week 4 | `feature/solana-features-tests` | Not Started |

### Dependencies
- SLD Staking implementation needed before Governance Power Calculation
- Core implementations must be completed before corresponding UI components

### Definition of Done
- All features fully tested with unit and integration tests
- Documentation on how to use new features
- UI components responsive and user-friendly
- Demo video created for team review

## Sprint 3: Frontend Enhancements & Governance

| Task | Assignee | Timeline | Branch | Status |
|------|----------|----------|--------|--------|
| Realms Integration | @dev2 | Week 1-3 | `feature/realms-integration` | Not Started |
| Governance Dashboard UI | @dev3 | Week 1-3 | `feature/governance-ui` | Not Started |
| SAI Minting/Redeeming Improvements | @dev1 | Week 1-2 | `feature/sai-mint-redeem` | Not Started |
| Risk Visualization Components | @dev3 | Week 3-4 | `feature/risk-visualization` | Not Started |
| User Documentation | @dev2 | Week 4 | `feature/user-docs` | Not Started |
| Final Integration & Testing | All | Week 4 | - | Not Started |

### Dependencies
- Realms Integration needed before Governance Dashboard UI
- Risk models needed for proper visualization components

### Definition of Done
- All UI components work consistently across devices
- Governance voting fully functional with Realms
- User flow for minting/redeeming is intuitive
- Risk visualization accurately reflects actual risk
- User documentation is comprehensive and accessible

## Team Contact Information

- **@dev1 (Alex)**: Backend/Anchor Development - alex@solidify.dev
- **@dev2 (Dana)**: Solana Integration Specialist - dana@solidify.dev
- **@dev3 (Jamie)**: Frontend/UI Development - jamie@solidify.dev

## Development Guidelines

1. **Branch Creation**
   - Create branches from `develop` using the naming format specified
   - Keep branches focused on specific features

2. **Communication**
   - Daily standup at 10am UTC
   - Blocking issues should be communicated immediately in the team channel
   - Progress updates on Fridays

3. **Code Quality**
   - Follow Rust and React best practices
   - All code must pass linting before PR submission
   - Unit tests required for all new functionality

4. **Review Process**
   - All PRs require at least one review from another team member
   - Address review comments promptly
   - Final integration testing before merging to `develop`

## Resources

- [LIQUIDATION_ENGINE_SPEC.md](./specs/LIQUIDATION_ENGINE_SPEC.md) - Technical specification for the Liquidation Engine
- [ROADMAP.md](../ROADMAP.md) - Complete product roadmap
- [COLLABORATIVE_WORKFLOW.md](../COLLABORATIVE_WORKFLOW.md) - Workflow process documentation 