// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {PoolInfo, UserInfo} from "../StakeTypes.sol";

/// @title PoolAccrualViewLib
/// @notice Read-only simulation of `PoolAccrualLib` catch-up + per-user settlement for pending-reward views.
/// @dev Mirrors `updateGlobal` / `settleUser` math without writing storage. Used by `pendingRewardA` / `pendingRewardB`.
library PoolAccrualViewLib {
    /// @notice Returns total claimable rewards for `user` after simulating global catch-up to `timestamp`.
    /// @dev Result matches `userInfo*.rewards` after the next `_catchUpExpiredGlobal` + `_settleUser` on that pool.
    function preview(
        PoolInfo memory pool,
        UserInfo memory user,
        uint256 maxDeltaTime,
        uint256 precision,
        uint256 dustTolerance,
        uint256 maxCatchupIterations,
        uint256 timestamp
    ) internal pure returns (uint256) {
        pool = _catchUpGlobal(pool, maxDeltaTime, precision, dustTolerance, maxCatchupIterations, timestamp);
        if (user.staked == 0) {
            return user.rewards;
        }
        uint256 earned = Math.mulDiv(user.staked, pool.accRewardPerToken - user.rewardPaid, precision);
        return user.rewards + earned;
    }

    function _catchUpGlobal(
        PoolInfo memory pool,
        uint256 maxDeltaTime,
        uint256 precision,
        uint256 dustTolerance,
        uint256 maxCatchupIterations,
        uint256 timestamp
    ) private pure returns (PoolInfo memory) {
        uint256 cap = timestamp < pool.periodFinish ? timestamp : pool.periodFinish;
        uint256 iterations;
        while (pool.lastUpdateTime < cap && iterations < maxCatchupIterations) {
            uint256 prev = pool.lastUpdateTime;
            pool = _updateGlobalStep(pool, maxDeltaTime, precision, dustTolerance, timestamp);
            if (pool.lastUpdateTime == prev) break;
            iterations++;
        }
        return pool;
    }

    function _updateGlobalStep(
        PoolInfo memory pool,
        uint256 maxDeltaTime,
        uint256 precision,
        uint256 dustTolerance,
        uint256 timestamp
    ) private pure returns (PoolInfo memory) {
        uint256 tApplicable = Math.min(timestamp, pool.periodFinish);
        if (pool.totalStaked == 0) {
            pool.lastUpdateTime = tApplicable;
            return pool;
        }
        if (tApplicable <= pool.lastUpdateTime) return pool;

        uint256 deltaTimeRaw = tApplicable - pool.lastUpdateTime;
        uint256 deltaTime = Math.min(deltaTimeRaw, maxDeltaTime);
        if (deltaTime == 0) return pool;

        uint256 deltaReward = deltaTime * pool.rewardRate;
        uint256 actualReward;
        if (pool.availableRewards >= deltaReward) {
            pool.availableRewards -= deltaReward;
            actualReward = deltaReward;
        } else {
            uint256 shortfall = deltaReward - pool.availableRewards;
            actualReward = pool.availableRewards;
            pool.badDebt += shortfall;
            pool.availableRewards = 0;
        }

        if (actualReward == 0) {
            pool.lastUpdateTime += deltaTime;
            return pool;
        }

        uint256 deltaAcc = Math.mulDiv(actualReward, precision, pool.totalStaked);
        uint256 claimablePending = Math.mulDiv(pool.totalStaked, deltaAcc, precision);
        uint256 roundingToDust = actualReward - claimablePending;

        pool.totalPending += claimablePending;
        pool.dust += roundingToDust;

        if (pool.dust >= dustTolerance) {
            pool.availableRewards += pool.dust;
            pool.dust = 0;
        }

        pool.accRewardPerToken += deltaAcc;
        pool.lastUpdateTime += deltaTime;
        return pool;
    }
}
