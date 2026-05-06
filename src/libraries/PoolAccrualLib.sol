// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {PoolInfo, UserInfo} from "../StakeTypes.sol";

/// @title PoolAccrualLib
/// @notice Linked library: global reward index updates and per-user reward settlement for one `PoolInfo`.
/// @dev Declared `external` for separate bytecode; core or modules `delegatecall` into deployment copies. All math assumes `pool.totalStaked > 0` when advancing the index (guarded in `updateGlobal`).
library PoolAccrualLib {
    /// @notice Optional signals from `updateGlobal` for the caller to emit as diagnostic events.
    /// @dev `insufficient` / `shortfall` describe a budget shortfall vs `deltaReward`; `dust` / `dustWei` describe sub-threshold recycling.
    struct GlobalEmit {
        /// @notice True when `availableRewards` could not fully fund the accrued `deltaReward` for this step.
        bool insufficient;
        /// @notice Magnitude of reward liability that could not be funded from `availableRewards` (added to `badDebt`).
        uint256 shortfall;
        /// @notice True when truncated per-stake dust was non-zero but below `dustTolerance` (caller may emit once).
        bool dust;
        /// @notice Truncated dust amount in wei added to `pool.dust` for this step (when `dust` is true).
        uint256 dustWei;
    }

    /// @notice Accrues pending rewards for `user` against `pool.accRewardPerToken` using `precision` scaling.
    /// @dev If `user.staked == 0`, syncs `rewardPaid` to the current index without minting rewards.
    /// @dev Intent (M-3): PRD pseudocode sometimes defers `userRewardPaid` to the outer “Fail-safe” step; this implementation
    ///      **always** sets `rewardPaid := acc` here so every entrypoint shares one canonical snapshot after `_updateGlobal`,
    ///      avoiding double-count gaps when `earned == 0` from rounding and reducing duplicated SSTORE at call sites.
    /// @param pool Pool storage whose `accRewardPerToken` is the index source.
    /// @param users Per-address `UserInfo` mapping for the same pool.
    /// @param user Address to settle.
    /// @param precision Fixed-point scale (core uses `1e18`).
    function settleUser(
        PoolInfo storage pool,
        mapping(address => UserInfo) storage users,
        address user,
        uint256 precision
    ) external {
        UserInfo storage u = users[user];
        if (u.staked == 0) {
            u.rewardPaid = pool.accRewardPerToken;
            return;
        }
        uint256 earned = Math.mulDiv(u.staked, pool.accRewardPerToken - u.rewardPaid, precision);
        if (earned > 0) {
            u.rewards += earned;
        }
        u.rewardPaid = pool.accRewardPerToken;
    }

    /// @notice Advances global reward index up to `min(block.timestamp, periodFinish)` and updates pending, bad debt, and dust buckets.
    /// @dev Uses `mulmod` remainder to increment `dust`; recycles dust into `availableRewards` once `dust >= dustTolerance`.
    /// @param pool Pool storage to mutate (`rewardRate`, `lastUpdateTime`, `accRewardPerToken`, buckets).
    /// @param maxDeltaTime Upper bound on elapsed seconds applied in one call (overflow / fairness guard).
    /// @param precision Fixed-point scale for index math (matches `settleUser`).
    /// @param dustTolerance Minimum dust balance before sweeping dust back into `availableRewards`.
    /// @return ge Optional emission hints for shortfall and dust handling.
    function updateGlobal(PoolInfo storage pool, uint256 maxDeltaTime, uint256 precision, uint256 dustTolerance)
        external
        returns (GlobalEmit memory ge)
    {
        uint256 tApplicable = Math.min(block.timestamp, pool.periodFinish);
        if (pool.totalStaked == 0) {
            pool.lastUpdateTime = tApplicable;
            return ge;
        }
        if (tApplicable <= pool.lastUpdateTime) return ge;

        uint256 deltaTimeRaw = tApplicable - pool.lastUpdateTime;
        uint256 deltaTime = Math.min(deltaTimeRaw, maxDeltaTime);
        if (deltaTime == 0) return ge;
        uint256 deltaReward = deltaTime * pool.rewardRate;
        uint256 actualReward;
        if (pool.availableRewards >= deltaReward) {
            pool.availableRewards -= deltaReward;
            pool.totalPending += deltaReward;
            actualReward = deltaReward;
        } else {
            uint256 shortfall = deltaReward - pool.availableRewards;
            actualReward = pool.availableRewards;
            pool.totalPending += actualReward;
            pool.badDebt += shortfall;
            pool.availableRewards = 0;
            ge.insufficient = true;
            ge.shortfall = shortfall;
        }

        uint256 remainder = mulmod(actualReward, precision, pool.totalStaked);
        uint256 truncatedWei = remainder / precision;
        pool.dust += truncatedWei;

        if (pool.dust >= dustTolerance) {
            pool.availableRewards += pool.dust;
            pool.dust = 0;
        } else if (truncatedWei > 0) {
            ge.dust = true;
            ge.dustWei = truncatedWei;
        }

        pool.accRewardPerToken += Math.mulDiv(actualReward, precision, pool.totalStaked);
        pool.lastUpdateTime += deltaTime;
    }
}
