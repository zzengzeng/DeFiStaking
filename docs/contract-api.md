# Contract API

This document is the external contract interface contract for integrators and frontend maintainers. The authoritative ABI lives in `frontend/src/contracts/abis` and generated Solidity docs live in `docs/src/src`.

## Authentication and Authorization

| Caller | Auth mechanism | Entrypoints |
| --- | --- | --- |
| User | `msg.sender`; no role | `stakeA`, `stakeB`, `withdrawA`, `withdrawB`, `claimA`, `claimB`, `compoundB`, `forceClaimAll`, `emergencyWithdrawA`, `emergencyWithdrawB` |
| Operator | `OPERATOR_ROLE` on Core | `notifyRewardAmountA`, `notifyRewardAmountB`, `pause`, `enableEmergencyMode` |
| Governance | Governance timelock through `DualPoolStakingAdmin` | routine admin and recovery paths |
| Super governance | Super timelock through `DualPoolStakingAdmin` | module pointer and role paths |

## User Entrypoints

| Function | Request | Success behavior | Important errors |
| --- | --- | --- | --- |
| `stakeA(uint256 amount)` | TokenA amount approved to Core | Credits actual received TokenA to Pool A stake | zero amount, below minimum, TVL cap, paused, emergency |
| `stakeB(uint256 amount)` | TokenB amount approved to Core | Credits actual received TokenB to Pool B stake and updates lock metadata | zero amount, below minimum, TVL cap, excessive FOT fee |
| `withdrawA(uint256 amount)` | Pool A principal amount | Debits Pool A principal and transfers gross TokenA | no stake, excess amount, paused |
| `withdrawB(uint256 amount)` | Pool B principal amount | Debits Pool B principal, charges applicable fees, transfers gross TokenB | no stake, excess amount, below early-exit minimum |
| `claimA()` / `claimB()` | none | Pays gross TokenB reward for one pool | cooldown, below minimum claim, bad debt, no rewards |
| `compoundB()` | none | Moves settled A/B rewards into Pool B principal | cooldown, no rewards, bad debt, shutdown |
| `forceClaimAll()` | none | Pays all or part of settled rewards during shutdown/bad debt | unavailable in healthy mode, cooldown |
| `emergencyWithdrawA/B()` | none | Emergency principal exit and reward forfeiture accounting | emergency mode not active, no stake |

## Operator Entrypoints

| Function | Request | Semantics |
| --- | --- | --- |
| `notifyRewardAmountA(uint256 amount, uint256 duration)` | TokenB approved by operator | Funds Pool A budget using actual balance delta; `duration == 0` uses configured default |
| `notifyRewardAmountB(uint256 amount, uint256 duration)` | TokenB approved by operator | Funds Pool B budget using actual balance delta |
| `pause()` | none | Pauses user/admin paths and catches up reward accounting within bounded iterations |
| `enableEmergencyMode()` | none | Irreversible emergency mode activation |

## Governance Entrypoints

Governance should call the `DualPoolStakingAdmin` facade, not Core directly. Routine governance uses the 48h timelock. Super governance uses the 72h timelock.

Examples:

- `setFees`
- `setLockDuration`
- `setRewardDurationA/B`
- `rebalanceBudgets`
- `recoverToken`
- `resolveBadDebt`
- `activateShutdown`
- `forceShutdownFinalize`
- `setUserModule`
- `setAdminModule`

## Idempotency and Ordering

- User transactions are not idempotent; retrying a successful stake/withdraw/claim changes state again or reverts.
- Timelock operations are identified by OpenZeppelin Timelock operation IDs; scheduling the same operation twice with the same salt is not allowed by the timelock.
- Frontend and scripts must read fresh state before displaying reward, fee, partial payout, or governance execution previews.

## Compatibility Commitments

- This is a fresh-deploy module architecture, not a proxy upgrade system.
- Storage layout compatibility matters because Core delegates to modules. Any storage layout change must be reviewed as a breaking deployment unless a migration plan says otherwise.
- External ABI changes must update frontend ABIs, generated docs, README tables, and this file.

## Error Model

Custom errors are defined in `src/StakingExecutionErrors.sol`; generated docs are under `docs/src/src/StakingExecutionErrors.sol/abstract.StakingExecutionErrors.md`.

Integrator guidance:

- Decode custom errors when possible.
- Treat unknown reverts as failed transactions without retry automation.
- Never hide bad debt, shutdown, emergency, FOT, or partial payout errors from users.

## Rate Limits

The contracts do not impose per-address API rate limits beyond cooldowns such as `claimCooldown`. Operational rate limits belong to RPC providers and frontend infrastructure and are documented in `docs/operations.md`.

