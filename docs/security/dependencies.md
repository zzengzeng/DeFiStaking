# External Dependencies and Trust Boundaries

This document is the production dependency register. Any deployment must fill the concrete addresses, owners, and monitoring links before user funds are accepted.

## On-Chain Dependencies

| Dependency | Purpose | Production requirement | Failure impact |
| --- | --- | --- | --- |
| TokenA | Pool A staking asset | Allowlisted ERC20; not rebasing, ERC777, blacklisting, pausable-by-unknown-party, or callback-based | Principal accounting or exits can break |
| TokenB | Pool B staking and reward asset | 18 decimals; allowlisted ERC20; FOT supported only within `maxTransferFeeBP`; not rebasing/ERC777/blacklisting/callback-based | Reward, principal, and invariant accounting can break |
| OpenZeppelin `TimelockController` governance | Executes `DualPoolStakingAdmin` parameter and treasury paths | `minDelay >= 48h`; proposer/canceller/executor controlled by production multisig or equivalent process | Admin changes can be rushed or blocked |
| OpenZeppelin `TimelockController` super | Executes module and role changes | `minDelay >= 72h`; stricter signer set than routine governance | Delegatecall module replacement equals protocol upgrade |
| `DualPoolStakingAdmin` facade | Governance-only wrapper for delayed calls into Core | Must hold Core `ADMIN_ROLE` and `DEFAULT_ADMIN_ROLE`; direct EOA admin roles revoked | Wrong caller or role wiring can bypass intended timelock |
| ERC1820 registry | Optional ERC777 hook detection | If deployed on chain, constructor probes Core, TokenA, and TokenB hook registrations | Probe is not a full proof of non-ERC777 behavior |
| OpenZeppelin contracts v5.6.1 | Access control, pausable, reentrancy guard, safe ERC20, timelock | Version pinned by dependency and CI | Library bug can affect role and transfer assumptions |

## Off-Chain and Frontend Dependencies

| Dependency | Purpose | Production requirement | Failure impact |
| --- | --- | --- | --- |
| RPC provider | Frontend reads, transaction submission, timelock indexing | At least two providers or documented fallback; rate-limit monitoring | UI can show stale state or fail to submit transactions |
| Block explorer API | Optional deployment verification | Not required for protocol safety; verification artifacts retained | User transparency degraded |
| Frontend host | Serves governance and user UI | Protected by hardware-key SSO, reviewed deploys, immutable build provenance when possible | Malicious UI can trick users into unsafe transactions |
| Price display | UI-only reference values | No oracle is used by contracts. Any USD display must be labelled indicative | Users may misread indicative values as protocol guarantees |
| Notification/monitoring stack | Invariant, bad debt, pause, emergency, shutdown alerts | Must monitor events and read-model thresholds in PRD section 10.3 | Delayed detection and response |

## Oracle Policy

The contracts currently do not consume price oracles. If a future version adds an oracle, it must document:

- Provider and fallback path
- Heartbeat and staleness checks
- Decimal normalization
- Manipulation resistance
- Safe behavior when oracle reads fail
- Tests for stale, zero, reverted, and manipulated values

## Production Address Register

Fill this before launch:

| Name | Address | Chain | Owner / admin | Verification link |
| --- | --- | --- | --- | --- |
| TokenA | `TBD` | `TBD` | `TBD` | `TBD` |
| TokenB | `TBD` | `TBD` | `TBD` | `TBD` |
| DualPoolStaking | `TBD` | `TBD` | `DualPoolStakingAdmin` | `TBD` |
| DualPoolUserModule | `TBD` | `TBD` | immutable implementation | `TBD` |
| DualPoolAdminModule | `TBD` | `TBD` | immutable implementation | `TBD` |
| DualPoolStakingAdmin | `TBD` | `TBD` | Timelock controllers | `TBD` |
| Governance Timelock | `TBD` | `TBD` | Multisig / governance | `TBD` |
| Super Timelock | `TBD` | `TBD` | Security multisig | `TBD` |

