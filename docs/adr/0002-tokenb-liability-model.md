# ADR 0002: TokenB Liability Accounting Model

## Status

Accepted.

## Context

Pool B principal, Pool A rewards, Pool B rewards, fees, dust, and bad debt all use TokenB. A single physical TokenB balance backs several logical buckets.

## Decision

Use a liability model where:

```text
TokenB balance + badDebt >= totalStakedB + totalPendingA/B + availableRewardsA/B + unclaimedFeesB + dustA/B
```

The contracts enforce this with `_assertInvariantB()` after state-changing paths, with documented emergency exceptions.

## Consequences

Positive:

- Accounting errors are caught near their source.
- Bad debt is explicit rather than hidden in failed transfers.
- Shutdown and force-claim behavior can be reasoned about from one invariant.

Negative:

- Every TokenB path must update the right bucket.
- FOT behavior must be documented as gross accounting with recipient-borne outbound tax.
- Recovery operations must be conservative.

## Rejected Alternatives

- Track only physical balance: simpler, but cannot distinguish pending, rewards, fees, principal, and shortfall.
- Revert forever on any shortfall: protects normal claims, but can trap users during exceptional states.

