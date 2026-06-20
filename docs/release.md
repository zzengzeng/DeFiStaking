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
8. Record module bytecode hashes and storage layout output.
9. Confirm governance, super governance, and operator signers.
10. Confirm `docs/security/launch-security-checklist.md` has evidence and sign-off.

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
