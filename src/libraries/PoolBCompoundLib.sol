// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PoolInfo, UserInfo} from "../StakeTypes.sol";
import {PoolBWadpLib} from "./PoolBWadpLib.sol";
import {RewardReanchorLib} from "./RewardReanchorLib.sol";
import {StakingExecutionErrors} from "../StakingExecutionErrors.sol";

/// @title PoolBCompoundLib
/// @notice Linked library: compound accrued rewards from both pools into Pool B stake (no external token pull).
/// @dev Debits `totalPending` on both pools and increases `userB.staked` / `poolB.totalStaked` by the sum of settled rewards.
library PoolBCompoundLib {
    /// @notice Inputs for `executeCompoundB`.
    struct CompoundBParams {
        /// @notice User whose rewards are converted to Pool B principal.
        address user;
        /// @notice Rolling lock duration applied after compounding (same semantics as stake).
        uint256 lockDuration;
        uint256 minRewardRateDuration;
        uint256 maxRewardDuration;
        uint256 maxAprBp;
        uint256 basisPoints;
        uint256 secondsPerYear;
        uint256 maxTotalSupplyBForRewardRateCap;
    }

    /// @notice Result of a compound operation for events and UI.
    struct CompoundBResult {
        /// @notice Pool A reward component rolled into stake (wei).
        uint256 rewardA;
        /// @notice Pool B reward component rolled into stake (wei).
        uint256 rewardB;
        /// @notice User’s total Pool B stake after compounding.
        uint256 newUserStakedB;
        /// @notice User’s `unlockTimeB` after applying rolling lock.
        uint256 newUnlockTimeB;
    }

    /// @dev Same rolling-lock rule as `PoolBStakeLib._updateRollingLock`.
    function _updateRollingLock(uint256 oldUnlockTime, uint256 _lockDuration) private view returns (uint256) {
        uint256 newUnlockFromNow = block.timestamp + _lockDuration;
        return oldUnlockTime > newUnlockFromNow ? oldUnlockTime : newUnlockFromNow;
    }

    /// @dev Mutates Pool B stake, TVL, lock maps, and optionally recomputes `rewardRate` when Pool B was empty.
    function _applyCompoundIntoPoolB(
        PoolInfo storage poolB,
        UserInfo storage userB,
        mapping(address => uint256) storage unlockTimeB,
        mapping(address => uint256) storage stakeTimestampB,
        CompoundBParams memory p,
        uint256 compoundTotal
    ) private returns (uint256 newUserStakedB, uint256 newUnlockTimeB) {
        bool wasEmptyB = (poolB.totalStaked == 0);
        uint256 oldStakedB = userB.staked;
        uint256 oldTimestampB = stakeTimestampB[p.user];

        userB.staked += compoundTotal;
        poolB.totalStaked += compoundTotal;

        unlockTimeB[p.user] = _updateRollingLock(unlockTimeB[p.user], p.lockDuration);
        stakeTimestampB[p.user] =
            PoolBWadpLib.weightedAvgDepositTimestamp(oldStakedB, oldTimestampB, compoundTotal, block.timestamp);

        uint256 remTime = poolB.periodFinish > block.timestamp ? poolB.periodFinish - block.timestamp : 0;
        if (wasEmptyB && poolB.availableRewards > 0) {
            if (remTime > 0) {
                RewardReanchorLib.applyCappedRateForRemainingWindow(
                    poolB, remTime, p.maxTotalSupplyBForRewardRateCap, p.maxAprBp, p.basisPoints, p.secondsPerYear
                );
            } else {
                RewardReanchorLib.reanchorStaleSchedule(
                    poolB,
                    p.minRewardRateDuration,
                    p.maxRewardDuration,
                    p.maxAprBp,
                    p.basisPoints,
                    p.secondsPerYear,
                    p.maxTotalSupplyBForRewardRateCap
                );
            }
        }

        newUserStakedB = userB.staked;
        newUnlockTimeB = unlockTimeB[p.user];
    }

    /// @notice Converts settled rewards in Pool A and B for `p.user` into additional Pool B principal.
    /// @param poolA Pool A storage (pending debited by `rewardA`).
    /// @param poolB Pool B storage (pending debited by `rewardB`; stake increased by sum).
    /// @param userInfoA Pool A user mapping.
    /// @param userInfoB Pool B user mapping.
    /// @param unlockTimeB Pool B unlock map.
    /// @param stakeTimestampB Pool B weighted deposit time map.
    /// @param lastClaimTime Global per-user cooldown map.
    /// @param p Compound parameters (`CompoundBParams`).
    /// @return r Amounts rolled and post-state stake / unlock snapshot.
    function executeCompoundB(
        PoolInfo storage poolA,
        PoolInfo storage poolB,
        mapping(address => UserInfo) storage userInfoA,
        mapping(address => UserInfo) storage userInfoB,
        mapping(address => uint256) storage unlockTimeB,
        mapping(address => uint256) storage stakeTimestampB,
        mapping(address => uint256) storage lastClaimTime,
        CompoundBParams memory p
    ) external returns (CompoundBResult memory r) {
        UserInfo storage userA = userInfoA[p.user];
        UserInfo storage userB = userInfoB[p.user];

        r.rewardA = userA.rewards;
        r.rewardB = userB.rewards;
        uint256 compoundTotal = r.rewardA + r.rewardB;

        if (compoundTotal == 0) revert StakingExecutionErrors.NoRewardsToCompound();

        if (poolA.totalPending < r.rewardA || poolB.totalPending < r.rewardB) {
            revert StakingExecutionErrors.InsufficientPending(compoundTotal, poolA.totalPending + poolB.totalPending);
        }

        userA.rewards = 0;
        userB.rewards = 0;
        poolA.totalPending -= r.rewardA;
        poolB.totalPending -= r.rewardB;

        userA.rewardPaid = poolA.accRewardPerToken;
        userB.rewardPaid = poolB.accRewardPerToken;

        (r.newUserStakedB, r.newUnlockTimeB) =
            _applyCompoundIntoPoolB(poolB, userB, unlockTimeB, stakeTimestampB, p, compoundTotal);

        lastClaimTime[p.user] = block.timestamp;
    }
}
