// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {PoolInfo, UserInfo} from "../StakeTypes.sol";
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

    /// @dev Weighted-average “deposit time” used as Pool B holding-duration reference on non-early withdrawals.
    /// @param oldStaked User stake before this deposit.
    /// @param oldTimestamp Prior weighted timestamp (`0`/`unset` treated as fresh stake path).
    /// @param addedAmount New principal credited this call.
    /// @return New weighted timestamp in seconds (unix time scale).
    function _updateWADP(uint256 oldStaked, uint256 oldTimestamp, uint256 addedAmount) private view returns (uint256) {
        if (oldStaked == 0) return block.timestamp;
        if (addedAmount == 0) return oldTimestamp;
        uint256 weightedOld = oldStaked * oldTimestamp;
        uint256 weightedNew = addedAmount * block.timestamp;
        return Math.mulDiv((weightedOld + weightedNew), 1, (oldStaked + addedAmount));
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
        if (isFirstDeposit && poolB.totalStaked > 0 && remainingTime > 0) {
            poolB.rewardRate = poolB.availableRewards / remainingTime;
        }

        unlockTimeB[p.user] = _updateRollingLock(unlockTimeB[p.user], p.lockDuration);
        stakeTimestampB[p.user] = _updateWADP(oldStakedB, oldTimestampB, received);

        r.received = received;
        r.newUnlockTime = unlockTimeB[p.user];
    }
}
