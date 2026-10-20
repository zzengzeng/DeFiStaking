# Change Management

This document defines how security-sensitive changes are proposed, reviewed, tested, approved, and released.

## Change Classes

| Class | Examples | Required process |
| --- | --- | --- |
| Protocol accounting | Rewards, `totalPending`, `availableRewards`, bad debt, shutdown, FOT | Security review, tests, Slither, explicit invariant impact note |
| Storage layout / modules | Core/module variables, `delegatecall` targets, module replacement | Storage layout diff, migration statement, super timelock |
| Governance / roles | Timelock config, role grant/revoke, admin facade | Governance review, multisig approval, timelock delay |
| Frontend transaction payloads | ABI, encodeFunctionData, governance cards, claim/withdraw flow | Frontend security review, payload snapshot, user warning review |
| Documentation-only | PRD, README, security docs | Owner review; no protocol deployment unless docs affect risk disclosure |

## Pull Request Requirements

Every security-sensitive PR must include:

- Summary of user/fund impact.
- List of changed entrypoints.
- Invariant impact statement.
- Tests added or explanation why not.
- Storage layout impact statement.
- Operational impact: roles, timelock, monitoring, frontend disclosure.
- Links to relevant threat-model rows.

## Release Checklist

Before deployment:

1. CI green: fmt, build, tests, static analysis.
2. Storage layout reviewed.
3. Deployment script parameters reviewed.
4. Production addresses and module bytecode hashes recorded.
5. Timelock operation payload decoded and reviewed by two humans.
6. Frontend address/ABI update reviewed.
7. Monitoring updated for new events/errors.
8. Rollback or mitigation plan documented.

## Timelock Operation Review

Every scheduled operation should record:

- Timelock address.
- Target address.
- Function selector and decoded arguments.
- Salt and predecessor.
- Earliest execution time.
- Expected post-state.
- Reviewer approvals.

