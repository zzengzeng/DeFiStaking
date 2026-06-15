// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {PoolInfo, UserInfo} from "../StakeTypes.sol";
import {PoolBWadpLib} from "./PoolBWadpLib.sol";
import {RewardReanchorLib} from "./RewardReanchorLib.sol";
import {StakingExecutionErrors} from "../StakingExecutionErrors.sol";

/// @title PoolBStakeLib
/// @notice Linked library: Pool B stake after global accrual has been updated (`executeStakeB`).
/// @dev Updates rolling `unlockTimeB` and weighted-average `stakeTimestampB` used by withdraw fee / penalty logic.
library PoolBStakeLib {
    using SafeERC20 for IERC20;

    /// @notice Arguments for `executeStakeB`.
    struct StakeBParams {
        /// @notice Beneficiary whose Pool B ledger and lock maps are updated.
        address user;
        /// @notice Amount passed to `transferFrom` on TokenB.
        uint256 amountRequested;
        /// @notice Seconds to extend rolling unlock from `max(now, oldUnlock)`.
        uint256 lockDuration;
        /// @notice Maximum implied FOT fee in basis points vs `amountRequested`.
        uint256 maxTransferFeeBP;
        /// @notice Basis-point denominator (typically `10_000`).
        uint256 basisPoints;
        uint256 minRewardRateDuration;
        uint256 maxRewardDuration;
        uint256 maxAprBp;
        uint256 secondsPerYear;
        uint256 maxTotalSupplyBForRewardRateCap;
    }

    /// @notice Return data: received principal and updated unlock timestamp.
    struct StakeBResult {
        /// @notice TokenB amount credited after balance-delta validation.
        uint256 received;
        /// @notice User’s `unlockTimeB` after applying rolling lock rules.
        uint256 newUnlockTime;
    }

    /// @dev `max(oldUnlock, now + lockDuration)` — later unlock wins to avoid shortening an existing lock.
    function _updateRollingLock(uint256 oldUnlockTime, uint256 _lockDuration) private view returns (uint256) {
        uint256 newUnlockFromNow = block.timestamp + _lockDuration;
        return oldUnlockTime > newUnlockFromNow ? oldUnlockTime : newUnlockFromNow;
    }

    /// @dev Pulls TokenB via `transferFrom` and enforces FOT bounds, `minStakeAmount`, and `tvlCap`.
    function _pullAndValidateStake(PoolInfo storage poolB, StakeBParams memory p) private returns (uint256 received) {
        uint256 balBefore = poolB.stakingToken.balanceOf(address(this));
        poolB.stakingToken.safeTransferFrom(p.user, address(this), p.amountRequested);
        received = poolB.stakingToken.balanceOf(address(this)) - balBefore;

        if (received == 0) {
            revert StakingExecutionErrors.ZeroReceived();
        }
        if (received * p.basisPoints < p.amountRequested * (p.basisPoints - p.maxTransferFeeBP)) {
            revert StakingExecutionErrors.ExcessiveTransferFee();
        }
        if (received < poolB.minStakeAmount) {
            revert StakingExecutionErrors.BelowMinStake();
        }
        if (poolB.tvlCap != 0 && poolB.totalStaked + received > poolB.tvlCap) {
            revert StakingExecutionErrors.ExceedsTVLCap();
        }
    }

    /// @notice Pulls TokenB stake for `p.user`, updates TVL, weighted stake timestamp, and rolling unlock.
    /// @param poolB Pool B `PoolInfo` (TokenB as `stakingToken`).
    /// @param userInfoB Pool B user mapping.
    /// @param unlockTimeB Per-user rolling unlock map.
    /// @param stakeTimestampB Per-user weighted-average deposit time map.
    /// @param p Stake parameters (`StakeBParams`).
    /// @return r Received amount and post-update unlock time.
    function executeStakeB(
        PoolInfo storage poolB,
        mapping(address => UserInfo) storage userInfoB,
        mapping(address => uint256) storage unlockTimeB,
        mapping(address => uint256) storage stakeTimestampB,
        StakeBParams memory p
    ) external returns (StakeBResult memory r) {
        bool isFirstDeposit = (poolB.totalStaked == 0);
        UserInfo storage userB = userInfoB[p.user];
        uint256 oldStakedB = userB.staked;
        uint256 oldTimestampB = stakeTimestampB[p.user];
        uint256 received = _pullAndValidateStake(poolB, p);

        userB.staked += received;
        userB.rewardPaid = poolB.accRewardPerToken;
        poolB.totalStaked += received;

        uint256 remainingTime = poolB.periodFinish > block.timestamp ? poolB.periodFinish - block.timestamp : 0;
        if (poolB.totalStaked > 0 && poolB.availableRewards > 0) {
            if (remainingTime > 0 && isFirstDeposit) {
                RewardReanchorLib.applyCappedRateForRemainingWindow(
                    poolB,
                    remainingTime,
                    p.maxTotalSupplyBForRewardRateCap,
                    p.maxAprBp,
                    p.basisPoints,
                    p.secondsPerYear
                );
            } else if (remainingTime == 0) {
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

        unlockTimeB[p.user] = _updateRollingLock(unlockTimeB[p.user], p.lockDuration);
        stakeTimestampB[p.user] =
            PoolBWadpLib.weightedAvgDepositTimestamp(oldStakedB, oldTimestampB, received, block.timestamp);

        r.received = received;
        r.newUnlockTime = unlockTimeB[p.user];
    }
}
