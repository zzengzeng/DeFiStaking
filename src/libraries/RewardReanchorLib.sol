// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {PoolInfo} from "../StakeTypes.sol";

/// @title RewardReanchorLib
/// @notice Starts a fresh emission schedule when the prior period has ended (or never had wall-clock time left) but `availableRewards` still holds budget (e.g. empty pool for a full notify window).
/// @dev Active-window paths (`remainingTime > 0`) clamp `rewardRate` to the same `deriveMaxRewardRate` ceiling as `NotifyRewardLib`.
library RewardReanchorLib {
    /// @notice APR / duration caps shared by stake, compound, and post-injection re-anchor paths.
    struct ReanchorCaps {
        uint256 minDuration;
        uint256 maxDuration;
        uint256 maxAprBp;
        uint256 basisPoints;
        uint256 secondsPerYear;
        uint256 maxTotalSupplyBForRewardRateCap;
    }

    /// @notice Same ceiling as `NotifyRewardLib.applyNotifyAccounting` (`MAX_APR_BP` × deploy-time supply cap).
    function deriveMaxRewardRate(
        uint256 maxTotalSupplyBForRewardRateCap,
        uint256 maxAprBp,
        uint256 basisPoints,
        uint256 secondsPerYear
    ) public pure returns (uint256) {
        return Math.mulDiv(maxTotalSupplyBForRewardRateCap, maxAprBp, basisPoints * secondsPerYear);
    }

    /// @notice Active-window re-anchor: `rate = availableRewards / remainingTime`, capped at `deriveMaxRewardRate`.
    /// @dev If the budget is smaller than the remaining window, use a 1 wei/sec micro-emission window instead of
    ///      writing a zero `rewardRate`.
    function applyCappedRateForRemainingWindow(
        PoolInfo storage pool,
        uint256 remainingTime,
        uint256 maxTotalSupplyBForRewardRateCap,
        uint256 maxAprBp,
        uint256 basisPoints,
        uint256 secondsPerYear
    ) public {
        if (remainingTime == 0 || pool.availableRewards == 0) return;
        uint256 rate = pool.availableRewards / remainingTime;
        uint256 maxRate = deriveMaxRewardRate(maxTotalSupplyBForRewardRateCap, maxAprBp, basisPoints, secondsPerYear);
        if (maxRate == 0) return;
        if (rate == 0) {
            pool.rewardRate = 1;
            pool.periodFinish = block.timestamp + pool.availableRewards;
            pool.lastUpdateTime = block.timestamp;
            return;
        }
        if (rate > maxRate) {
            rate = maxRate;
        }
        pool.rewardRate = rate;
    }

    /// @notice Re-anchors after `availableRewards` grows without a full `notify` (forfeiture, rebalance credit, bad-debt surplus, etc.).
    /// @dev Active window (`periodFinish > now`): capped `applyCappedRateForRemainingWindow`. Expired window: `reanchorStaleSchedule`.
    function reanchorOnBudgetInjection(PoolInfo storage pool, ReanchorCaps memory caps) external {
        if (pool.availableRewards == 0) return;

        uint256 rem = pool.periodFinish > block.timestamp ? pool.periodFinish - block.timestamp : 0;
        if (rem > 0) {
            applyCappedRateForRemainingWindow(
                pool, rem, caps.maxTotalSupplyBForRewardRateCap, caps.maxAprBp, caps.basisPoints, caps.secondsPerYear
            );
            return;
        }

        reanchorStaleSchedule(
            pool,
            caps.minDuration,
            caps.maxDuration,
            caps.maxAprBp,
            caps.basisPoints,
            caps.secondsPerYear,
            caps.maxTotalSupplyBForRewardRateCap
        );
    }

    /// @notice If `availableRewards > 0` and there is no remaining time in the current `periodFinish` window, assign `rewardRate` / `periodFinish` / `lastUpdateTime` so `PoolAccrualLib` can drain the bucket.
    /// @dev Caps `rewardRate` like `NotifyRewardLib`; may use up to `maxDuration` seconds when the budget is large. When `budget < minDuration` so `budget / minDuration == 0`, uses micro-emission (`rate = 1`, `duration = budget`) instead of opening a zero-rate window.
    function reanchorStaleSchedule(
        PoolInfo storage pool,
        uint256 minDuration,
        uint256 maxDuration,
        uint256 maxAprBp,
        uint256 basisPoints,
        uint256 secondsPerYear,
        uint256 maxTotalSupplyBForRewardRateCap
    ) public {
        if (pool.availableRewards == 0) return;

        uint256 rem = pool.periodFinish > block.timestamp ? pool.periodFinish - block.timestamp : 0;
        if (rem > 0) return;

        uint256 budget = pool.availableRewards;
        uint256 maxRewardRate =
            deriveMaxRewardRate(maxTotalSupplyBForRewardRateCap, maxAprBp, basisPoints, secondsPerYear);
        if (maxRewardRate == 0) return;

        uint256 rate = budget / minDuration;
        uint256 duration = minDuration;
        if (rate == 0) {
            rate = 1;
            duration = budget;
        } else if (rate > maxRewardRate) {
            rate = maxRewardRate;
            duration = Math.max(minDuration, (budget + rate - 1) / rate);
            if (duration > maxDuration) {
                duration = maxDuration;
                rate = budget / duration;
                if (rate > maxRewardRate) {
                    rate = maxRewardRate;
                }
            }
        }

        pool.rewardRate = rate;
        pool.periodFinish = block.timestamp + duration;
        pool.lastUpdateTime = block.timestamp;
    }
}
