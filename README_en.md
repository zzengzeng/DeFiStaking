# DualPoolStaking — Parallel Dual-Pool Compounding Rewards Staking Protocol

A Solidity smart contract project built with Foundry, implementing a **Parallel Dual-Pool** compounding rewards staking protocol.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Key Features](#key-features)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Contract Overview](#contract-overview)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security Design](#security-design)

## Architecture Overview

The protocol uses a **Parallel Dual-Pool** design with a Liability Accumulation Model for linear reward distribution of TokenB:

| Pool | Stake Asset | Reward Asset | Purpose |
|---|---|---|---|
| **Pool A** | TokenA | TokenB | Base staking pool, no lock period, no principal fee |
| **Pool B** | TokenB | TokenB | Compounding pool with rolling lock and fee tier structure |

Users can perform a full **Stake → Earn → Compound** closed-loop cycle between Pool A and Pool B.

## Key Features

- **Dual-Pool Staking** — Pool A (TokenA → earn TokenB) and Pool B (TokenB → earn TokenB)
- **Compounding Rewards** — Consolidate earned rewards from both A/B pools into Pool B principal for auto-compounding
- **Liability Accumulation Model** — Global index `accRewardPerToken` with user snapshots for precise per-wei reward calculation
- **WADP Time Weighting** — Weighted average deposit period prevents fee tier gaming through additional staking
- **Rolling Lock** — Max-override method; each Stake/Compound maintains or pushes back the unlock time
- **Emergency Mode** — Operator-activated, one-way irreversible emergency exit channel
- **Shutdown Liquidation** — Orderly shutdown + `forceShutdownFinalize` to prevent zombie deadlocks
- **Bad Debt Management** — `BadDebt` recording + `resolveBadDebt` physical repair + `forceClaimAll` discounted bailout
- **TokenB Invariant** — Physical balance must always cover账面 debt; enforced at the end of every state change
- **FOT Defense** — Fee-On-Transfer token support with slippage protection and real-arrival Cap checking
- **ERC777 Defense** — Deployment whitelist + ERC1820 probing to prevent hook-based CEI bypass
- **Timelock Governance** — OpenZeppelin `TimelockController`-based; Admin ops ≥48h delay, super changes ≥72h

## Project Structure

```
DeFiStaking/
├── foundry.toml                  # Foundry config (compiler 0.8.34)
├── Makefile                      # Build/test/deploy shortcut commands
├── PRD.md                        # Protocol Requirements Document (complete math & architecture)
├── src/
│   ├── DualPoolStaking.sol       # Core: staking/withdrawal/rewards/state machine
│   ├── DualPoolStakingAdmin.sol  # Governance facade (Admin op wrapper)
│   ├── StakeTypes.sol            # Type definitions (Pool enum, events, errors)
│   ├── StakingExecutionErrors.sol# Custom error set
│   ├── MockERC20.sol             # Test ERC20 mock token
│   ├── libraries/                # Logic libraries
│   │   ├── PoolAccrualLib.sol    # Global reward update engine _updateGlobalX
│   │   ├── PoolAStakeLib.sol     # Pool A staking logic
│   │   ├── PoolBStakeLib.sol     # Pool B staking logic
│   │   ├── PoolBCompoundLib.sol  # Compound (CompoundB) logic
│   │   ├── PoolBWithdrawLib.sol  # Pool B withdrawal (Early Exit / Mature Fee)
│   │   ├── ForceClaimAllLib.sol  # forceClaimAll discounted settlement logic
│   │   ├── NotifyRewardLib.sol   # notifyRewardAmount injection logic
│   │   ├── PoolSingleClaimLib.sol# Single-pool claim (claimA / claimB)
│   │   └── StakingAdminLib.sol   # Admin parameter configuration logic
│   └── modules/
│       ├── DualPoolUserModule.sol    # User ops module (stake/withdraw/claim/compound/emergency)
│       ├── DualPoolAdminModule.sol   # Admin ops module (fees/pause/shutdown/recovery, etc.)
│       └── DualPoolStorageLayout.sol # Unified storage layout for upgrade safety
├── test/
│   └── DualPoolStaking.t.sol       # Full test suite
├── script/
│   └── DualPoolStaking.s.sol       # One-click deploy script (Mock + Timelock included)
└── frontend/                       # Frontend DApp (Next.js + TypeScript)
```

## Getting Started

### Prerequisites

- [Foundry](https://book.getfoundry.sh/) (`forge`, `cast`, `anvil`)
- Recommended Solidity version: **0.8.34**

### Installation

```shell
# Install dependencies (forge-std + OpenZeppelin Contracts v5.6.1)
make install

# Build
make build
```

### Run Tests

```shell
make test          # Run all tests
make snapshot      # Gas snapshot
```

### Local Deployment

```shell
# Terminal A: Start Anvil local node
make anvil

# Terminal B: Deploy full contract stack
make deploy
```

### Sepolia Deployment

```shell
# Configure in .env: SEPOLIA_RPC_URL, PRIVATE_KEY, ETHERSCAN_API_KEY
make deploy NETWORK=sepolia
```

## Contract Overview

### DualPoolStaking (Core Contract)

The main contract inherits user module, admin module, and storage layout, implementing:

| Function | Description |
|---|---|
| `stakeA(amount)` / `stakeB(amount)` | Stake TokenA or TokenB |
| `withdrawA(amount)` / `withdrawB(amount)` | Withdraw (A: no lock/fee; B: fee tier structure) |
| `compound()` | Transfer A+B earned rewards entirely into Pool B principal |
| `claim()` / `forceClaimAll()` | Claim rewards / Discounted bailout (during bad debt) |
| `emergencyWithdraw()` | Emergency exit (forfeits unclaimed rewards) |
| `notifyRewardAmountA(amount, duration)` / `notifyRewardAmountB` | Inject reward budget |
| `pause()` / `unpause()` | Pause/resume protocol |
| `enableEmergencyMode()` | Activate emergency mode (one-way irreversible) |
| `shutdown()` / `forceShutdownFinalize()` | Shutdown liquidation |

### DualPoolStakingAdmin (Governance Facade)

Wraps Admin operations requiring time-lock delay:

- Fee configuration (`setFees`, `setLockDuration`)
- TVL cap and minimum stake amount
- Budget rebalancing (`rebalanceBudgets`)
- Fee extraction (`claimFees`)
- Token recovery (`recoverToken`)
- Bad debt resolution (`resolveBadDebt`)

## Testing

Test file: [`test/DualPoolStaking.t.sol`](test/DualPoolStaking.t.sol), covering:

- Full Stake / Withdraw / Claim / Compound lifecycle
- Early Exit penalties and Mature fee tiers
- WADP time weighting verification
- Rolling Lock behavior
- Emergency / Shutdown state machine
- Empty pool re-anchor
- Budget insufficiency BadDebt handling
- `forceClaimAll` discounted settlement
- `resolveBadDebt` repair
- TokenB invariant verification
- FOT token simulation

## Deployment

The deployment script [`script/DualPoolStaking.s.sol`](script/DualPoolStaking.s.sol) performs one-click deployment:

1. Deploy MockERC20 (TokenA / TokenB)
2. Deploy `DualPoolStaking` core
3. Deploy user module and admin module
4. Deploy governance facade `DualPoolStakingAdmin`
5. Initialize `TimelockController`

## Security Design

### Role System

| Role | Permissions | Timelock |
|---|---|---|
| **Owner** (`DEFAULT_ADMIN_ROLE`) | Module pointers, super configuration | ≥72h |
| **Admin** (`ADMIN_ROLE`) | Risk parameters, asset extraction, budget rebalancing | ≥48h |
| **Operator** (`OPERATOR_ROLE`) | Pause, emergency mode, reward injection | 0h (defensive/injection) |
| **User** | Stake/withdraw/claim/compound | — |

### Key Security Mechanisms

- **CEI Priority** — Strict Check-Effect-Interaction ordering
- **Reentrancy Protection** — `nonReentrant` on all asset-changing functions
- **TokenB Invariant** — Physical balance must cover book debt; verified at end of every operation
- **WADP Anti-Arbitrage** — Time-weighted deposit period prevents fee tier reset
- **MAX_DELTA_TIME (30 days)** — Single time delta cap to prevent overflow
- **Dust Recovery** — Rounding dust accumulates and is recycled back to budget once threshold is met

### Full Architecture Document

See [`PRD.md`](PRD.md) — includes complete mathematical formulas, state machine matrix, edge case analysis, and event/error definitions.

## License

MIT
