# Monitoring and Reliability

This document defines production health signals and alert expectations.

## Critical Signals

| Signal | Severity | Action |
| --- | --- | --- |
| `InvariantViolated` event | P0 | Pause, assess bad debt, start incident response |
| `badDebtA > 0 || badDebtB > 0` | P0/P1 | Stop recoveries, prepare repair or force-claim guidance |
| `InsufficientBudget` event | P1 | Investigate reward funding and accounting |
| `Paused` | P1 | Confirm operator action and user messaging |
| `EmergencyModeActivated` | P0 | Start incident response |
| `ShutdownActivated` | P0/P1 | Publish shutdown user flow |
| `ProtocolShutdownComplete` | P1 | Verify residual accounting and remaining claims |
| Timelock operation scheduled | P2 | Review payload and ETA |
| Module pointer changed | P0/P1 | Verify expected bytecode hash |

## Dashboards

Dashboards should show:

- TokenB physical balance;
- Pool A/B `availableRewards`;
- Pool A/B `totalPending`;
- Pool A/B `badDebt`;
- Pool B `totalStaked`;
- `unclaimedFeesB`;
- reward rates and period finish timestamps;
- timelock queued operations;
- frontend deployment version.

## SLO

Operational SLOs before accepting user funds:

- P0 alert acknowledged within 15 minutes.
- P1 alert acknowledged within 60 minutes.
- Timelock queue reviewed at least daily while operations are pending.
- Frontend deployment mismatch alerts investigated before new user campaigns.

## Noise Control

Do not alert on every normal claim/stake/withdraw event. Alert on accounting anomalies, governance changes, emergency state transitions, stale schedules, and frontend/deployment mismatch.

