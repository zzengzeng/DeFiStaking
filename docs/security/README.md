# Security Documentation

This directory is the security operations entrypoint. Production launch is blocked until the launch checklist, ownership records, dependency register, and disclosure contacts are filled with real evidence.

## Documents

- [Security Model](security-model.md)
- [Threat Model and Attack Playbook](threat-model.md)
- [External Dependencies and Trust Boundaries](dependencies.md)
- [Incident Response](incident-response.md)
- [Key Management](key-management.md)
- [Security Owners](security-owners.md)
- [Launch Security Checklist](launch-security-checklist.md)
- [Audit, Disclosure, and Bug Bounty Plan](audit-and-bounty.md)
- [Static Analysis Findings](static-analysis-findings.md)
- [Access Review](access-review.md)
- [Change Management](change-management.md)
- [Employee Security](employee-security.md)

## Launch Rule

Do not accept production user funds until:

- `make production-readiness` passes;
- all security owners and contacts are real monitored identities;
- all production addresses and signer sets are recorded;
- external audit or approved exception is recorded;
- static analysis findings are fixed or accepted with rationale;
- incident response has been dry-run.

