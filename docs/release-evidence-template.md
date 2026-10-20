# Release Evidence Template

## Release Identity

- Release name:
- Git commit SHA:
- Contract bytecode hashes:
- Frontend build commit / artifact ID:
- Deployment network:
- Deployment block:

## Automated Gates

| Gate | Command | Result | Evidence |
| --- | --- | --- | --- |
| Solidity tests | `env -u ETHERSCAN_API_KEY forge test --offline` | `TBD` | `TBD` |
| Static analysis | `make static-analysis` | `TBD` | `TBD` |
| Frontend build | `cd frontend && pnpm run build` | `TBD` | `TBD` |
| Production readiness | `make production-readiness` | `TBD` | `TBD` |
| Frontend env | `make frontend-production-env` | `TBD` | `TBD` |
| Contract sync | `make frontend-contract-sync` | `TBD` | `TBD` |
| Post-deploy verify | `make post-deploy-verify` | `TBD` | `TBD` |

## Deployment Addresses

| Component | Address | Verification link |
| --- | --- | --- |
| TokenA | `TBD` | `TBD` |
| TokenB | `TBD` | `TBD` |
| DualPoolStaking | `TBD` | `TBD` |
| DualPoolUserModule | `TBD` | `TBD` |
| DualPoolAdminModule | `TBD` | `TBD` |
| DualPoolStakingAdmin | `TBD` | `TBD` |
| Governance Timelock | `TBD` | `TBD` |
| Super Timelock | `TBD` | `TBD` |

## Governance Evidence

- `ADMIN_ROLE` holder:
- `DEFAULT_ADMIN_ROLE` holder:
- `OPERATOR_ROLE` holder:
- Governance proposer / executor / canceller:
- Super proposer / executor / canceller:
- Timelock min delays:

## Rehearsal Transactions

| Path | Transaction hash | Notes |
| --- | --- | --- |
| `stakeA` | `TBD` | `TBD` |
| `stakeB` | `TBD` | `TBD` |
| `withdrawA` | `TBD` | `TBD` |
| `withdrawB` | `TBD` | `TBD` |
| `claimA/claimB` | `TBD` | `TBD` |
| `compoundB` | `TBD` | `TBD` |
| `pause/unpause` | `TBD` | `TBD` |
| Timelock schedule/execute/cancel | `TBD` | `TBD` |

## Human Sign-Off

| Role | Name / handle | Approval link | Timestamp |
| --- | --- | --- | --- |
| Protocol security | `TBD` | `TBD` | `TBD` |
| Governance operations | `TBD` | `TBD` | `TBD` |
| Frontend security | `TBD` | `TBD` | `TBD` |
