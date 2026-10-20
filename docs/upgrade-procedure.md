# Upgrade Procedure

The current system is not a proxy upgrade. Module replacement is still security-sensitive because Core uses `delegatecall`.

## Upgrade Types

| Change | Procedure |
| --- | --- |
| Parameter change | Governance timelock through `DualPoolStakingAdmin` |
| Operator change | Super governance role operation |
| Module replacement | Super timelock, bytecode review, storage layout review, frontend/API update |
| Full protocol replacement | Fresh deployment plus migration/withdrawal plan |
| Frontend-only change | Frontend release process with transaction payload review |

## Module Replacement Gate

Before `setUserModule` or `setAdminModule`:

- New module bytecode is built from reviewed commit.
- Storage layout compatibility with `DualPoolStorageLayout` is proven.
- Generated ABI/docs are refreshed.
- `make static-analysis` findings are reviewed.
- A timelock operation payload is recorded.
- A rollback or follow-up replacement plan is recorded.

## Fresh Deployment Migration

If a new deployment replaces an old one:

- old deployment status must be documented;
- user funds and reward budgets must be accounted;
- frontend must show the active deployment clearly;
- users must receive withdrawal/migration instructions;
- old deployment monitoring must remain active while funds remain.
