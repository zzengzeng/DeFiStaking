# Security Policy

## Supported Scope

Security reports are in scope for:

- Solidity contracts under `src/`
- Deployment scripts under `script/`
- Foundry tests and invariant tests under `test/`
- Frontend transaction, governance, and risk-display code under `frontend/src/`
- Documentation that affects operational security, user risk disclosure, or governance procedures

Out of scope unless paired with an exploitable protocol impact:

- Spam, phishing, or social-engineering attempts against team members
- Denial-of-service against public RPC providers
- Issues requiring compromised private keys, unless the report identifies a protocol-side mitigation failure
- Findings against third-party contracts that are not deployed or configured by this project

## Reporting a Vulnerability

Send vulnerability reports to:

- Primary security contact: `security@example.com`
- Backup contact: `ops@example.com`

Replace these placeholders before production launch. The production contacts must be monitored by at least two humans and protected by hardware security keys.

Include:

- Affected contract, function, or frontend route
- Impact and affected assets
- Reproduction steps, PoC, or transaction trace
- Suggested severity
- Any assumptions about token behavior, roles, timelock state, or chain configuration

## Response Targets

| Severity | Initial acknowledgement | Triage target | Public update target |
| --- | ---: | ---: | ---: |
| Critical | 24 hours | 48 hours | After mitigation or user-protection action |
| High | 48 hours | 5 business days | After fix plan is accepted |
| Medium | 5 business days | 10 business days | Release notes or advisory |
| Low | 10 business days | Best effort | Release notes |

## Coordinated Disclosure

Please do not publicly disclose an issue until the team has completed mitigation or agreed on a disclosure date. The team will credit reporters unless anonymity is requested.

## Bug Bounty Status

No public bounty amount is committed in this repository yet. Before mainnet deployment, governance must publish either:

- A funded bug bounty program with scope, severity rubric, payment ranges, and KYC/tax requirements; or
- A written statement that the protocol has no bounty and accepts coordinated disclosure only.

## Safe Harbor

Good-faith testing that follows this policy and avoids privacy violations, fund movement beyond minimal PoC value, service disruption, extortion, or data destruction will not be treated as hostile activity by the project team.
