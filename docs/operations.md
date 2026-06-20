# Operations Runbook

This document is the production operations entrypoint.

## Environments

| Environment | Purpose | Deployment command |
| --- | --- | --- |
| Local Anvil | development and tests | `make anvil` then `make deploy` |
| Sepolia rehearsal | public test deployment | `make deploy NETWORK=sepolia` |
| Production candidate | governed launch rehearsal | `make deploy-production NETWORK=sepolia` |

## Configuration

Root `.env`:

- `SEPOLIA_RPC_URL`
- `DEPLOYER_ACCOUNT`
- `DEPLOYER_ADDRESS`
- `GOVERNANCE_PROPOSER`
- `GOVERNANCE_EXECUTOR`
- `SUPER_PROPOSER`
- `SUPER_EXECUTOR`
- `OPERATOR`
- `ETHERSCAN_API_KEY`

Frontend `.env.local`:

- Core and token addresses
- Admin facade and timelock addresses
- RPC URL
- deployment block for indexers

## Routine Operations

| Operation | Actor | Notes |
| --- | --- | --- |
| Fund rewards | Operator | Uses `notifyRewardAmountA/B`; operator must own/approve TokenB |
| Pause | Operator | Immediate defensive action |
| Emergency mode | Operator | Irreversible; requires incident escalation |
| Parameter update | Governance timelock | Record operation ID and expected post-state |
| Module update | Super timelock | Requires bytecode and storage review |
| Bad debt repair | Governance timelock | Payer must be funded and must approve Core |

## Backups and Recovery

There is no mutable off-chain database for contract truth. Preserve:

- deployment artifacts;
- verified source;
- frontend build hash;
- timelock operation history;
- incident logs;
- monitoring snapshots.

## Access

Production access is governed by `docs/security/key-management.md` and `docs/security/access-review.md`. Hardware-key SSO is required for GitHub, hosting, monitoring, and signer management.

