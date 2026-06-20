## Summary

- 

## User / Fund Impact

- [ ] No user or fund impact
- [ ] User-visible behavior changes
- [ ] Fund accounting, custody, claim, withdraw, emergency, shutdown, or governance impact

Describe impact:

## Changed Entrypoints

- [ ] User path: stake / withdraw / claim / compound / emergency / forceClaimAll
- [ ] Operator path: pause / emergency / notify
- [ ] Admin path: parameters / recovery / rebalance / shutdown / bad debt
- [ ] Super path: modules / roles
- [ ] Frontend transaction payloads
- [ ] Documentation only

## Security Checklist

- [ ] Invariant impact considered (`TokenB`, `bookedUserRewards`, `totalPending`, `badDebt`)
- [ ] Storage layout impact stated
- [ ] Timelock / role impact stated
- [ ] FOT gross/net behavior considered
- [ ] MAX_DELTA_TIME / stale schedule behavior considered
- [ ] Frontend user-risk disclosure considered
- [ ] Tests added or updated
- [ ] `forge fmt --check` passes
- [ ] `forge test` passes
- [ ] Slither findings reviewed or accepted-risk entry added

## Storage Layout

- [ ] No storage layout change
- [ ] Fresh-deploy-only change
- [ ] Migration-safe change with plan

Notes:

## Timelock / Governance Operations

If this PR requires a timelock operation, include:

- Timelock:
- Target:
- Function:
- Arguments:
- Expected post-state:

