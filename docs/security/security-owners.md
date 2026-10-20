# Security Ownership

This file defines who is accountable for security decisions. Replace `TBD` values before production launch.

## Named Owners

| Area | Primary | Backup | Responsibilities |
| --- | --- | --- | --- |
| Protocol security | `TBD` | `TBD` | Threat model, invariant review, audit coordination, severity calls |
| Governance operations | `TBD` | `TBD` | Timelock scheduling/execution, signer coordination, role changes |
| Frontend security | `TBD` | `TBD` | Transaction payload review, warning UX, deployment access |
| Monitoring and incident response | `TBD` | `TBD` | Alerts, incident room, status updates, post-mortems |
| Dependency management | `TBD` | `TBD` | Library upgrades, external contract register, RPC/frontend dependencies |

## Required Reviews

| Change type | Required reviewers |
| --- | --- |
| Reward accounting, pending, bad debt, shutdown, or FOT logic | Protocol security + one engineer |
| Module pointer, storage layout, role, or Timelock change | Protocol security + governance operations |
| Deployment script or production address update | Governance operations + protocol security |
| Frontend transaction encoding or governance UI | Frontend security + protocol security |
| Incident response or key management process | Incident response owner + governance operations |

## Storage Layout Rule

Any change to Core or module storage layout must include:

- Fresh `forge inspect <contract> storage-layout` review.
- Explicit statement whether the change is fresh-deploy-only or migration-safe.
- Migration plan if any production deployment exists.

## Background Checks and Identity Verification

Repository evidence alone cannot prove employee identity checks. The organization must maintain a private HR/security record that confirms:

- Production signers and deployers have verified identities.
- Background checks or equivalent trust reviews are completed where legally permitted.
- Offboarding removes multisig, repository, hosting, RPC, monitoring, and communication access.

