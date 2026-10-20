# Test Strategy

This document defines what must be proven before a change can ship.

## Test Layers

| Layer | Command | Purpose |
| --- | --- | --- |
| Formatting | `forge fmt --check` | Prevent style churn and generated formatting drift |
| Build and size | `forge build --sizes` | Compile contracts and confirm runtime size margins |
| Unit and scenario tests | `forge test` | Validate protocol accounting, roles, user paths, emergency, shutdown |
| Fuzz tests | included in `forge test` | Probe arithmetic and invariant edges |
| Static analysis | `make static-analysis` | Detect high-risk Solidity patterns while excluding documented accepted detectors |
| Frontend build | `cd frontend && npm run build` | Validate TypeScript/Next production build |
| Production readiness | `make production-readiness` | Confirm launch gates and governance evidence |

## Blocking Scenarios

Changes touching funds, roles, modules, accounting, rewards, or shutdown must cover:

- TokenB invariant preservation.
- `availableRewards`, `totalPending`, `bookedUserRewards`, `badDebt`, and dust transitions.
- MAX_DELTA_TIME catch-up and stale schedule behavior.
- FOT inbound and outbound gross/net behavior.
- Timelock and role restrictions.
- Emergency and shutdown transitions.
- Module pointer validation and storage layout impact.

## Manual Review

Manual review is required for:

- Slither findings that are not fixed.
- Any storage layout change.
- Any change to `DualPoolStakingAdmin` governance routing.
- Any frontend transaction payload or ABI change.
- Production deployment env and signer configuration.

## Release Acceptance

A production candidate is not releasable until:

- All blocking tests pass on a clean worktree.
- `make production-readiness` passes with production env and evidence.
- The PR template security checklist is complete.
- Slither accepted findings are linked from the release notes and `docs/security/static-analysis-findings.md`.
