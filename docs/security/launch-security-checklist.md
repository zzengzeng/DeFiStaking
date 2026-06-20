# Production Launch Security Checklist

This checklist is a launch gate. Do not accept production user funds until every required item is complete, reviewed, and linked to evidence.

## Sign-Off Table

| Area | Owner | Status | Evidence |
| --- | --- | --- | --- |
| Protocol security | `TBD` | `BLOCKED` | `TBD` |
| Governance operations | `TBD` | `BLOCKED` | `TBD` |
| Frontend security | `TBD` | `BLOCKED` | `TBD` |
| Monitoring / incident response | `TBD` | `BLOCKED` | `TBD` |
| Legal / compliance for bounty and disclosure | `TBD` | `BLOCKED` | `TBD` |

## Mandatory Launch Gates

| Gate | Required evidence | Status |
| --- | --- | --- |
| Roles documented | PRD role table, README role table, deployed role query output | `BLOCKED` until production addresses filled |
| External dependencies documented | `docs/security/dependencies.md` completed with addresses and owners | `BLOCKED` |
| Incident response tested | Tabletop exercise notes and at least one dry run of pause/emergency/shutdown decision flow | `BLOCKED` |
| Attack paths documented | `docs/security/threat-model.md` reviewed and mapped to tests | `READY FOR REVIEW` |
| Identity and background checks | Private HR/security record for production signers and deployers | `BLOCKED` |
| Security owner assigned | `docs/security/security-owners.md` filled with real names/handles | `BLOCKED` |
| Hardware keys required | Key management evidence for GitHub, hosting, multisig, cloud/RPC accounts | `BLOCKED` |
| Multi-human key management | Multisig threshold, signer list, recovery process, timelock role config | `BLOCKED` |
| Invariants tested every commit | CI green for fmt/build/test and static analysis | `READY FOR REVIEW` |
| Automated tooling | Slither enabled in CI; any accepted findings documented | `READY FOR REVIEW` |
| External audit / disclosure | Audit report or explicit pre-launch exception; `SECURITY.md` contacts live | `BLOCKED` |
| User abuse mitigations | Frontend risk text for FOT, partial payout, timelock, emergency, shutdown | `READY FOR REVIEW` |

## On-Chain Deployment Checks

Run and save output before launch:

```shell
forge test
forge fmt --check
forge build --sizes
forge inspect DualPoolStaking storage-layout
forge inspect DualPoolUserModule storage-layout
forge inspect DualPoolAdminModule storage-layout
```

Verify on-chain:

- `ADMIN_ROLE` is held by `DualPoolStakingAdmin`, not deployer.
- `DEFAULT_ADMIN_ROLE` is held by `DualPoolStakingAdmin`, not deployer.
- `OPERATOR_ROLE` is held by the approved operations signer set.
- `timelockGovernance.minDelay >= 48 hours`.
- `timelockSuper.minDelay >= 72 hours`.
- Timelock proposers, cancellers, and executors are multisig/governance-controlled.
- `userModule` and `adminModule` bytecode hashes match reviewed artifacts.
- TokenA and TokenB addresses match the dependency register.
- TokenB has 18 decimals.
- TokenA and TokenB are approved by the token risk review.

## Frontend Launch Checks

- Production environment variables match the deployed addresses.
- Governance UI shows both timelocks and the admin facade.
- Claim/withdraw flows display FOT gross/net semantics.
- `forceClaimAll` displays partial payout semantics and A-then-B ordering.
- Shutdown and emergency banners are visible and tested.
- Indicative USD values are labelled as UI-only and not oracle-backed.
- Build artifact hash and deployment commit are recorded.

## Monitoring Checks

Alerts must exist for:

- `InvariantViolated`
- `InsufficientBudget`
- `badDebtA > 0 || badDebtB > 0`
- `OutboundTransfer.grossAmount > netReceived`
- `Paused`, `EmergencyModeActivated`, `ShutdownActivated`, `ProtocolShutdownComplete`
- Timelock scheduled/executed/cancelled operations
- Module or role changes
- Stale schedules and zero-rate budget windows

## Final Launch Decision

Launch may proceed only when all `BLOCKED` statuses are changed to `PASS` with evidence links and at least two humans sign off:

- Protocol Security Lead
- Governance Operations Lead

