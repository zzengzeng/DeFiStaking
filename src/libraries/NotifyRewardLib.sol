// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {PoolInfo} from "../StakeTypes.sol";
import {StakingExecutionErrors} from "../StakingExecutionErrors.sol";

/// @title NotifyRewardLib
/// @notice Linked library: reward rate and pool accounting updates for `notifyRewardAmount*`.
/// @dev Token pulls must occur in the **core** contract before `delegatecall` into the admin module that calls this library, so ERC20 `transferFrom` sees the core as `msg.sender` where applicable.
library NotifyRewardLib {
    /// @notice Outputs from `applyNotifyAccounting` (actual funded amount and new rate).
    struct NotifyResult {
        /// @notice Reward tokens observed as received (balance delta) passed through to schedule math.
        uint256 actualAmount;
        /// @notice Post-merge emission rate `(actualAmount + leftover) / duration`.
        uint256 newRate;
    }

    /// @notice Applies a new reward schedule: merges leftover emissions, sets `rewardRate`, extends `periodFinish`, and credits `availableRewards`.
    /// @param pool Pool storage to mutate.
    /// @param actualAmount Reward tokens already received by the core (balance delta).
    /// @param duration New emission duration in seconds.
    /// @param maxAprBp Maximum APR in basis points for rate-cap math.
    /// @param basisPoints `10_000` for bp conversions.
    /// @param secondsPerYear Seconds per year for APR cap derivation.
    /// @param maxTotalSupplyBForRewardRateCap Supply ceiling used in max-rate formula.
    /// @return r Result carrying `actualAmount` and `newRate` after checks.
    function applyNotifyAccounting(
        PoolInfo storage pool,
        uint256 actualAmount,
        uint256 duration,
        uint256 maxAprBp,
        uint256 basisPoints,
        uint256 secondsPerYear,
        uint256 maxTotalSupplyBForRewardRateCap
    ) external returns (NotifyResult memory r) {
        r.actualAmount = actualAmount;
        if (actualAmount == 0) {
            revert StakingExecutionErrors.ZeroReceived();
        }

        uint256 remaining = pool.periodFinish > pool.lastUpdateTime ? pool.periodFinish - pool.lastUpdateTime : 0;
        uint256 leftover = remaining * pool.rewardRate;

        r.newRate = (actualAmount + leftover) / duration;
        uint256 maxRewardRate = Math.mulDiv(maxTotalSupplyBForRewardRateCap, maxAprBp, basisPoints * secondsPerYear);
        if (r.newRate > maxRewardRate) {
            revert StakingExecutionErrors.RewardRateExceedsMax(r.newRate, maxRewardRate);
        }

        pool.rewardRate = r.newRate;
        pool.periodFinish = block.timestamp + duration;
        pool.lastUpdateTime = block.timestamp;
        pool.availableRewards += actualAmount;
    }
}
