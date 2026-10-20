# RewardReanchorLib
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/49679f252829d0b3ac33cfb42d46070f8f7fbdc0/src/libraries/RewardReanchorLib.sol)

**Title:**
RewardReanchorLib

Starts a fresh emission schedule when the prior period has ended (or never had wall-clock time left) but `availableRewards` still holds budget (e.g. empty pool for a full notify window).

Active-window paths (`remainingTime > 0`) clamp `rewardRate` to the same `deriveMaxRewardRate` ceiling as `NotifyRewardLib`.


## Functions
### deriveMaxRewardRate

Same ceiling as `NotifyRewardLib.applyNotifyAccounting` (`MAX_APR_BP` × deploy-time supply cap).


```solidity
function deriveMaxRewardRate(
    uint256 maxTotalSupplyBForRewardRateCap,
    uint256 maxAprBp,
    uint256 basisPoints,
    uint256 secondsPerYear
) public pure returns (uint256);
```

### applyCappedRateForRemainingWindow

Active-window re-anchor: `rate = availableRewards / remainingTime`, capped at `deriveMaxRewardRate`.

If the budget is smaller than the remaining window, use a 1 wei/sec micro-emission window instead of
writing a zero `rewardRate`.


```solidity
function applyCappedRateForRemainingWindow(
    PoolInfo storage pool,
    uint256 remainingTime,
    uint256 maxTotalSupplyBForRewardRateCap,
    uint256 maxAprBp,
    uint256 basisPoints,
    uint256 secondsPerYear
) public;
```

### reanchorOnBudgetInjection

Re-anchors after `availableRewards` grows without a full `notify` (forfeiture, rebalance credit, bad-debt surplus, etc.).

Active window (`periodFinish > now`): capped `applyCappedRateForRemainingWindow`. Expired window: `reanchorStaleSchedule`.


```solidity
function reanchorOnBudgetInjection(PoolInfo storage pool, ReanchorCaps memory caps) external;
```

### reanchorStaleSchedule

If `availableRewards > 0` and there is no remaining time in the current `periodFinish` window, assign `rewardRate` / `periodFinish` / `lastUpdateTime` so `PoolAccrualLib` can drain the bucket.

Caps `rewardRate` like `NotifyRewardLib`; may use up to `maxDuration` seconds when the budget is large. When `budget < minDuration` so `budget / minDuration == 0`, uses micro-emission (`rate = 1`, `duration = budget`) instead of opening a zero-rate window.


```solidity
function reanchorStaleSchedule(
    PoolInfo storage pool,
    uint256 minDuration,
    uint256 maxDuration,
    uint256 maxAprBp,
    uint256 basisPoints,
    uint256 secondsPerYear,
    uint256 maxTotalSupplyBForRewardRateCap
) public;
```

## Structs
### ReanchorCaps
APR / duration caps shared by stake, compound, and post-injection re-anchor paths.


```solidity
struct ReanchorCaps {
    uint256 minDuration;
    uint256 maxDuration;
    uint256 maxAprBp;
    uint256 basisPoints;
    uint256 secondsPerYear;
    uint256 maxTotalSupplyBForRewardRateCap;
}
```

