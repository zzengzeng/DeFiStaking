# Contributing

This project handles funds and privileged governance operations. Treat every change as security-sensitive until proven otherwise.

## Development Flow

1. Read `README.md`, `PRD.md`, and the relevant docs under `docs/`.
2. Keep changes scoped to one behavioral area.
3. Update tests and docs with code changes.
4. Use the PR template and fill every security checklist item.

## Required Checks

Run before requesting review:

```shell
forge fmt --check
forge build --sizes
forge test
cd frontend && npm run build
```

Run Slither for security-sensitive contract changes:

```shell
make static-analysis
```

## Review Requirements

Any change touching these areas needs security review:

- reward accounting;
- TokenB invariant;
- FOT behavior;
- bad debt and recovery;
- emergency/shutdown;
- timelock/governance;
- module pointers or storage layout;
- frontend transaction payloads.

## Documentation Requirements

Update the matching document when behavior changes:

- architecture: `docs/architecture.md`
- external contract semantics: `docs/contract-api.md`
- security boundaries: `docs/security/security-model.md`
- tests: `docs/testing/test-strategy.md`
- release/deploy: `docs/release.md`
- monitoring/operations: `docs/monitoring.md`, `docs/operations.md`
- major decisions: `docs/adr/`

## Security Issues

Do not open a public issue for an unpatched vulnerability. Use the contacts and process in `SECURITY.md`.
