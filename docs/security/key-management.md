# Key Management and Production Access

This document defines the minimum production controls for roles that can affect protocol funds, modules, governance, or frontend transaction safety.

## Production Role Policy

| Capability | Holder | Minimum control |
| --- | --- | --- |
| `DEFAULT_ADMIN_ROLE` / super path | `DualPoolStakingAdmin` called only by `timelockSuper` | `timelockSuper.minDelay >= 72h`, multisig proposers/cancellers, hardware keys |
| `ADMIN_ROLE` / routine governance | `DualPoolStakingAdmin` called only by `timelockGovernance` | `timelockGovernance.minDelay >= 48h`, multisig proposers/cancellers, hardware keys |
| `OPERATOR_ROLE` | Dedicated operations multisig or tightly controlled hot wallet | Separate from admin/super signers; can pause, enter emergency, and notify rewards |
| Frontend production deploy | Release maintainers | Hardware-key SSO, reviewed deployment, rollback plan |
| RPC / monitoring credentials | Operations | Least privilege, rotation, no shared personal secrets |

## Hardware Security Keys

Production access must require hardware-backed authentication:

- Multisig signers use hardware wallets for on-chain signatures.
- Git hosting, cloud hosting, DNS, monitoring, and secret stores require FIDO2/WebAuthn or equivalent hardware security keys.
- Recovery codes are stored offline and require two humans to access.

## Multiple-Human and Physical-Step Requirements

The following actions require at least two humans and explicit physical signing or approval steps:

- Schedule or execute module changes.
- Grant or revoke `ADMIN_ROLE`, `DEFAULT_ADMIN_ROLE`, or `OPERATOR_ROLE`.
- Change Timelock proposers, executors, cancellers, or delay.
- Execute `activateShutdown`, `forceShutdownFinalize`, `recoverToken`, or large `rebalanceBudgets`.
- Deploy or promote frontend changes that alter transaction payload construction.
- Rotate production deploy keys, RPC write credentials, DNS, or hosting ownership.

Recommended production thresholds:

- Governance multisig: at least 3-of-5.
- Super/security multisig: at least 4-of-7 or stricter.
- Operator multisig: at least 2-of-3, with signer separation from super governance.

Replace these recommendations with the actual launch configuration before production.

## Key Rotation

Rotate keys immediately when:

- A signer device is lost or suspected compromised.
- A signer leaves the team or changes role.
- A phishing attempt succeeds against any production account.
- Timelock, multisig, or frontend deployment credentials are exposed.

Rotation steps:

1. Open an incident ticket and identify affected capabilities.
2. Schedule role or signer changes through the correct timelock.
3. Revoke old credentials after the new path is verified.
4. Update the production address register in `docs/security/dependencies.md`.
5. Publish a governance notice if user funds or admin authority were affected.

## Launch Blockers

Do not accept production funds until:

- Timelock proposer/executor/canceller roles are not single EOAs.
- `DEFAULT_ADMIN_ROLE` and `ADMIN_ROLE` are not held by the deployer.
- `OPERATOR_ROLE` is separate from admin/super governance.
- Signers have hardware wallets or hardware security keys.
- All production addresses are recorded and verified.

