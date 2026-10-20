# Audit, Vulnerability Disclosure, and Bug Bounty Plan

This document turns external audit and disclosure expectations into launch requirements.

## External Audit Requirements

Before mainnet deployment, the protocol must have one of:

1. A completed external audit report covering the deployed commit; or
2. A written exception approved by protocol security and governance, with a compensating-control plan and limited launch scope.

Audit scope must include:

- `src/DualPoolStaking.sol`
- `src/DualPoolStakingAdmin.sol`
- `src/modules/*`
- `src/libraries/*`
- `script/DualPoolStaking.s.sol`
- Storage layout compatibility for Core and modules
- Governance/timelock role wiring
- FOT TokenB behavior and outbound gross/net accounting
- Shutdown, emergency, bad debt, and reanchor flows
- Frontend transaction encoding for governance and user actions

## Audit Evidence Register

| Audit firm / reviewer | Scope commit | Report link | Status | Critical/high fixed? |
| --- | --- | --- | --- | --- |
| `TBD` | `TBD` | `TBD` | `BLOCKED` | `TBD` |

## Accepted-Risk Register

Any unfixed audit or tool finding must be recorded here.

Static-analysis findings are tracked in [`static-analysis-findings.md`](static-analysis-findings.md). The table below is reserved for external audit findings and manual review exceptions.

| Finding | Severity | Reason accepted | Expiration / revisit date | Owner |
| --- | --- | --- | --- | --- |
| `TBD` | `TBD` | `TBD` | `TBD` | `TBD` |

## Vulnerability Disclosure Program

`SECURITY.md` is the canonical disclosure policy. Production launch requires:

- Real monitored security email aliases.
- At least two humans with access.
- Response SLA acknowledgement.
- Escalation path into incident response.

## Bug Bounty Program

Before public mainnet launch, choose one:

- Funded public bounty.
- Private invite-only bounty.
- Explicit no-bounty statement with coordinated disclosure only.

Minimum bounty scope should include:

- Theft or permanent lock of TokenA/TokenB.
- Incorrect reward accounting, bad debt, or invariant violation.
- Governance/timelock bypass.
- Malicious module replacement path.
- Frontend transaction payload manipulation.
- User loss through FOT, shutdown, emergency, or partial payout misrepresentation.

Suggested severity rubric:

| Severity | Example impact |
| --- | --- |
| Critical | Direct theft or permanent freezing of user funds, governance takeover |
| High | Solvent accounting corruption, bad debt creation, unauthorized admin action |
| Medium | User harm requiring unusual conditions, denial of important user action |
| Low | Misleading UI or documentation with limited direct fund impact |
