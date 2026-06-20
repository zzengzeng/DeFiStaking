# ADR 0001: Core With Delegatecall Modules

## Status

Accepted for the current fresh-deploy architecture.

## Context

The protocol has many user and governance paths. Keeping all logic in a single Core contract risks exceeding contract size limits and makes review harder.

## Decision

Use `DualPoolStaking` as the external ABI and role boundary, and delegate user/admin execution bodies into `DualPoolUserModule` and `DualPoolAdminModule`.

## Consequences

Positive:

- Core remains within runtime size limits.
- User and admin logic can be reviewed by boundary.
- The external ABI stays centered on Core.

Negative:

- Module storage layout must match Core storage exactly.
- Module pointer changes are equivalent to protocol upgrades.
- Static analysis reports low-level call/delegatecall findings that must be reviewed, not ignored.

## Rejected Alternatives

- Single monolithic contract: simpler mental model, but size and review pressure are worse.
- Proxy upgrade framework: standard for upgrades, but adds proxy-specific storage and governance risks not needed for fresh deployments.

