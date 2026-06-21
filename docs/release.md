# Release Procedure

This document describes how to cut a production candidate and decide whether it can be deployed.

## Version Rule

This repository uses fresh deployments rather than proxy upgrades. A release is identified by:

- Git commit SHA
- Contract bytecode hashes
- Deployment script version
- Frontend build commit
- Production address register

## Pre-Release Checklist

1. Ensure the worktree contains only intended release changes.
2. Run `forge fmt --check`.
3. Run `forge build --sizes`.
4. Run `forge test`.
5. Run `make static-analysis` and document accepted findings.
6. Run `cd frontend && npm run build`.
7. Run `make production-readiness` with production env.
8. Run `make frontend-production-env` with production frontend env.
9. Run `make frontend-contract-sync` after frontend env is synced from broadcast artifacts.
10. Run `make post-deploy-verify` after deployment on the target network.
11. Run `make preprod-rehearsal` in the release candidate environment.
12. Fill `docs/release-evidence-template.md`.
13. Record module bytecode hashes and storage layout output.
14. Confirm governance, super governance, and operator signers.
15. Confirm `docs/security/launch-security-checklist.md` has evidence and sign-off.

## Pre-Production Rehearsal

The rehearsal must be executed before production funds are accepted. Use a public test deployment or a fork with production-like roles.

Automated gate:

```shell
make preprod-rehearsal
```

For rehearsal environments where real production owner records or production env variables are intentionally absent, the blocked gates may be observed without passing:

```shell
ALLOW_BLOCKED_PRODUCTION_READINESS=true \
ALLOW_BLOCKED_FRONTEND_ENV=true \
make preprod-rehearsal
```

Manual transaction rehearsal:

- User path: `stakeA`, `stakeB`, `withdrawA`, `withdrawB`, `claimA`, `claimB`, `compoundB`.
- Safety path: `pause`, `unpause`, `enableEmergencyMode`, `emergencyWithdrawA`, `emergencyWithdrawB`.
- Governance path: schedule, wait, execute, and cancel at least one 48h Timelock operation.
- Super governance path: schedule and cancel a 72h module or role operation; execute only on a disposable rehearsal deployment.
- Treasury/accounting path: `notifyRewardAmountA`, `notifyRewardAmountB`, `rebalanceBudgets`, `resolveBadDebt`, `claimFees`, and a blocked `recoverToken` attempt when bad debt exists.
- Terminal path: `activateShutdown`, `forceShutdownFinalize`, and `forceClaimAll` on a disposable rehearsal deployment.

Evidence to save:

- transaction hashes;
- decoded calldata for each Timelock operation;
- role query output after deployment;
- frontend build artifact hash or deployment ID;
- monitoring screenshots or alert test output.
- completed copy of `docs/release-evidence-template.md`.

## Deployment

Production deployment must use:

```shell
make deploy-production NETWORK=sepolia
```

The command requires `DEPLOYER_ACCOUNT` and rejects plaintext `PRIVATE_KEY` production deployment.

## Post-Deployment Checks

- Verify Core, modules, admin facade, and timelock addresses.
- Verify `ADMIN_ROLE` and `DEFAULT_ADMIN_ROLE` are held by the admin facade.
- Verify deployer no longer holds production admin roles.
- Verify `OPERATOR_ROLE` holder matches the approved operator.
- Verify timelock delays.
- Update frontend env and address constants.
- Run `make frontend-production-env` against the exact frontend deployment environment.
- Run `make frontend-contract-sync` against the exact broadcast artifact and frontend env.
- Run `make post-deploy-verify` against the exact deployment RPC endpoint.
- Configure monitoring according to `docs/monitoring-alerts.yaml`.
- Publish deployment transaction hashes and verification links.

## Rollback

Contracts are not proxy-upgraded, so rollback means:

- stop frontend routing to the failed deployment;
- pause or activate emergency mode if user funds are at risk;
- deploy a corrected version if needed;
- publish clear migration or withdrawal instructions;
- do not sweep TokenB unless accounting and shutdown rules allow it.

## Release Decision

Release is blocked by any of:

- failing tests or build;
- failing production readiness gate;
- unreviewed Slither high/medium finding;
- missing production role evidence;
- missing incident response owner;
- unresolved mismatch between frontend ABI/address and deployed contracts.
- failing post-deploy role/module/timelock verification;
- missing monitoring alerts for bad debt, timelock events, emergency/shutdown, and frontend indexer failures.
