# Incident Response Plan

This runbook covers production incidents affecting funds, governance, accounting, or user safety.

## Severity Levels

| Severity | Definition | Initial action |
| --- | --- | --- |
| P0 Critical | Active fund loss, exploitable accounting corruption, compromised admin/super keys, malicious module, or invariant failure with user funds at risk | Convene response room, pause if useful, preserve evidence, prepare emergency mode or shutdown decision |
| P1 High | Bad debt, stuck withdrawals/claims, stale schedule causing unfair distribution, frontend compromise, or suspicious governance transaction | Pause affected flows if needed, notify signers, draft user notice |
| P2 Medium | Non-critical UI misquote, monitoring gap, degraded RPC, failed optional verification | Fix or mitigate in normal release process |
| P3 Low | Documentation drift, non-security bug, cosmetic issue | Track in backlog |

## Response Roles

Fill names before launch.

| Role | Owner | Backup | Required access |
| --- | --- | --- | --- |
| Incident Commander | `TBD` | `TBD` | Can coordinate signers and publish status |
| Protocol Security Lead | `TBD` | `TBD` | Can assess exploitability and mitigation |
| Governance Operator | `TBD` | `TBD` | Can schedule/execute timelock operations |
| Frontend Operator | `TBD` | `TBD` | Can disable unsafe UI and deploy warnings |
| Communications Lead | `TBD` | `TBD` | Can publish user-facing updates |

## Detection Sources

Monitor at minimum:

- `InvariantViolated`
- `InsufficientBudget`
- `BadDebtResolved` and unresolved `badDebtA > 0 || badDebtB > 0`
- `OutboundTransfer.grossAmount > netReceived`
- `Paused`, `EmergencyModeActivated`, `ShutdownActivated`, `ProtocolShutdownComplete`
- `periodFinish < block.timestamp && availableRewards > 0`
- `rewardRate == 0 && availableRewards > 0 && periodFinish > block.timestamp`
- Timelock `CallScheduled`, `CallExecuted`, and `Cancelled`
- Module address changes and role changes

## P0/P1 Procedure

1. Open the incident room and assign an Incident Commander.
2. Freeze non-essential deployments and governance proposals.
3. Snapshot chain state:
   - Core, modules, admin facade, timelocks, TokenA, TokenB addresses
   - `poolA()`, `poolB()`, balances, bad debt, `shutdown`, `emergencyMode`, `paused`
   - pending timelock operations and signer state
4. Decide immediate containment:
   - Use `pause()` for user-facing flow interruption when it reduces harm.
   - Use `enableEmergencyMode()` only when normal operation must permanently narrow into emergency exits.
   - Use `activateShutdown()` only after emergency mode and governance/timelock process are satisfied.
5. If bad debt exists, prepare `resolveBadDebt` funding source and approval path.
6. If frontend is unsafe, disable risky actions and publish a warning banner.
7. Preserve logs, transaction hashes, screenshots, and build artifacts.
8. Publish an initial user update with known facts, affected actions, and next update time.
9. Patch, test, and review the fix. Require at least one security reviewer and one governance/operator reviewer.
10. Post-mortem within 5 business days after containment.

## Emergency Decision Matrix

| Condition | Preferred response | Notes |
| --- | --- | --- |
| UI only issue, contracts healthy | Disable UI action or warning banner | Do not pause contracts unless users are likely to sign harmful transactions |
| Stale reward schedule risk | Pause if active exploitation possible, then use catch-up/reanchor-safe entrypoint | Avoid manual budget movement while active emissions remain |
| Bad debt | Block recover/rebalance, use `forceClaimAll` policy if needed, then `resolveBadDebt` | Confirm payer can really fund Core |
| Compromised Operator | Revoke/rotate via super timelock if possible; evaluate pause/emergency history | Operator can pause, enable emergency, notify rewards |
| Compromised Admin or module authority | Treat as P0; use remaining governance controls and public warnings | Module replacement is equivalent to protocol upgrade |
| Invariant violation | Pause if helpful; identify cause before recover/rebalance | Emergency withdraw paths may emit without reverting by design |

## Communications Template

Initial notice:

> We are investigating an issue affecting `[scope]`. User action `[is/is not]` recommended at this time. The contracts are `[paused/not paused]`; emergency mode is `[active/inactive]`; shutdown is `[active/inactive]`. Next update by `[time UTC]`.

Resolution notice:

> The issue affecting `[scope]` has been mitigated by `[action]`. Affected users: `[summary]`. Remaining risk: `[summary]`. Post-mortem target: `[date]`.

## Exercise Schedule

- Tabletop exercise before production launch.
- Quarterly incident drill.
- Mandatory drill after any module upgrade, role model change, or new chain deployment.

