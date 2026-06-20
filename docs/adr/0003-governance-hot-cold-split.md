# ADR 0003: Hot Operator and Delayed Governance Split

## Status

Accepted.

## Context

The protocol needs both fast defensive actions and slow governance changes. Putting every action behind a long timelock would delay pause/emergency response. Letting all actions execute immediately would expose funds to rushed or compromised admin changes.

## Decision

Split privileges:

- `OPERATOR_ROLE` has 0h access to `pause`, `enableEmergencyMode`, and reward funding.
- `ADMIN_ROLE` is held by the governance facade and controlled by a routine timelock.
- `DEFAULT_ADMIN_ROLE` is held by the governance facade and controlled by a stricter super timelock for module and role changes.

## Consequences

Positive:

- Emergency response remains fast.
- Parameter and recovery operations remain delayed and observable.
- Module replacement receives the strongest governance path.

Negative:

- Operator compromise can still pause or trigger emergency mode.
- Governance operations require more deployment wiring and monitoring.
- Documentation must keep role ownership and timelock delays current.

## Rejected Alternatives

- Single admin multisig with no timelock: faster, but weaker user protection.
- Timelock every action: safer for configuration, but too slow for defensive pause/emergency.

