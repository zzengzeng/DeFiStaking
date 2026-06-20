# Security Model

This document collects the protocol security boundaries in one place. It complements `docs/security/threat-model.md` and `docs/security/key-management.md`.

## Assets

- TokenA principal in Pool A
- TokenB principal in Pool B
- TokenB reward budgets, pending rewards, fees, and dust
- Governance timelock authority
- Super timelock authority
- Operator authority
- Frontend transaction payload integrity

## Trust Boundaries

| Boundary | Trusted side | Untrusted side | Required control |
| --- | --- | --- | --- |
| User wallet to Core | Core checks | User input | Role-free functions validate amount, mode, caps, and cooldown |
| Operator to Core | `OPERATOR_ROLE` | Any non-operator | AccessControl and production signer controls |
| Timelock to Admin facade | Timelock | Direct callers | `onlyGovernanceTimelock` / `onlySuperTimelock` |
| Core to modules | Reviewed module code | Arbitrary address | Code-length checks, super timelock, bytecode hash record |
| Core to tokens | Allowlisted ERC20 behavior | Malicious token behavior | Token review, ERC1820 checks, FOT cap, no rebasing/ERC777/callback assets |
| Frontend to contracts | Contract validation | UI and RPC data | Contracts remain authoritative |

## Roles

| Role | Production holder | Powers | Delay |
| --- | --- | --- | --- |
| `DEFAULT_ADMIN_ROLE` | `DualPoolStakingAdmin` facade controlled by super timelock | module pointers, role changes, super configuration | at least 72h |
| `ADMIN_ROLE` | `DualPoolStakingAdmin` facade controlled by governance timelock | routine parameters, recovery, rebalance, shutdown, bad debt repair | at least 48h |
| `OPERATOR_ROLE` | approved operations signer or multisig | pause, emergency mode, reward funding | 0h |
| User | any address | user asset flows | none |

## Default Deny Rules

- Production deployer must not retain admin roles.
- Governance must not bypass the facade for delayed paths.
- Module targets must not be EOAs or empty-code addresses.
- `recoverToken(TokenB)` must not run while either pool has bad debt.
- Production reward tokens must not require off-chain intervention to permit exits.

## Failure Modes

| Failure mode | Expected behavior |
| --- | --- |
| TokenB backing shortfall | Record bad debt, block normal claims/recovery, allow repair and force claim path |
| Stale reward schedule | Catch up or re-anchor without letting late stakers take old emissions |
| Emergency | Stop normal risky paths, allow emergency exits and reward forfeiture accounting |
| Shutdown | Stop new reward schedules and provide withdrawal/claim/finalization path |
| Frontend compromise | Users may see malicious prompts, but contract role and accounting checks remain binding |

## Security Acceptance Criteria

Before production:

- `make production-readiness` passes.
- `forge fmt --check`, `forge build --sizes`, `forge test`, frontend `npm run build`, and Slither review are complete.
- Slither findings are either fixed or recorded as accepted findings with reasoning.
- Production addresses, bytecode hashes, role holders, and timelock delays are recorded.
- Incident response and signer recovery procedures have been dry-run.

