// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {PoolInfo, UserInfo} from "../StakeTypes.sol";
import {StakingExecutionErrors} from "../StakingExecutionErrors.sol";

/// @title ForceClaimAllLib
/// @notice Linked library: `forceClaimAll` settlement across pools with partial pay, debt, and dust handling.
/// @dev Computes spendable TokenB as `balance - (poolB.totalStaked + unclaimedFeesB)` then allocates sequentially to Pool A then B rewards.
library ForceClaimAllLib {
    using SafeERC20 for IERC20;

    /// @notice Inputs for `executeForceClaimAll`.
    struct ForceClaimParams {
        /// @notice Reward / TokenB asset used for payout.
        IERC20 rewardToken;
        /// @notice User whose both pools’ `rewards` fields are cleared.
        address user;
        /// @notice Minimum total claimable to allow force path when no bad debt and not shutdown.
        uint256 minClaimAmount;
        /// @notice Pool B fees reserved on-contract (reduces spendable remainder in liability calc).
        uint256 unclaimedFeesB;
        /// @notice When true, bypasses `BelowMinClaim` for small totals if bad debt is also zero (see revert tree).
        bool shutdown;
    }

    /// @notice Partial payment breakdown for analytics and dust/bad-debt routing.
    struct ForceClaimResult {
        /// @notice Pool A reward component actually paid in TokenB.
        uint256 payA;
        /// @notice Pool B reward component actually paid in TokenB.
        uint256 payB;
        /// @notice Pool A reward shortfall vs full `userA.rewards` before settlement.
        uint256 unpaidA;
        /// @notice Pool B reward shortfall vs full `userB.rewards` before settlement.
        uint256 unpaidB;
    }

    /// @dev Applies unpaid amounts first against `badDebt` (per pool), then remainder into `dust` buckets.
    function _applyUnpaidToDebtAndDust(PoolInfo storage poolA, PoolInfo storage poolB, ForceClaimResult memory r)
        private
    {
        uint256 reduceA = Math.min(r.unpaidA, poolA.badDebt);
        uint256 reduceB = Math.min(r.unpaidB, poolB.badDebt);
        if (reduceA > 0) {
            poolA.badDebt -= reduceA;
        }
        if (reduceB > 0) {
            poolB.badDebt -= reduceB;
        }

        uint256 dustSweepA = r.unpaidA - reduceA;
        uint256 dustSweepB = r.unpaidB - reduceB;
        if (dustSweepA > 0) {
            poolA.dust += dustSweepA;
        }
        if (dustSweepB > 0) {
            poolB.dust += dustSweepB;
        }
    }

    /// @notice Settles both pools’ rewards for `p.user` under shutdown / liquidity rules; may pay partially.
    /// @param poolA Pool A storage.
    /// @param poolB Pool B storage.
    /// @param userInfoA Pool A user mapping.
    /// @param userInfoB Pool B user mapping.
    /// @param lastClaimTime Per-user cooldown map.
    /// @param p Force-claim parameters (`ForceClaimParams`).
    /// @return r Paid and unpaid splits after mutating pending and user rewards.
    function executeForceClaimAll(
        PoolInfo storage poolA,
        PoolInfo storage poolB,
        mapping(address => UserInfo) storage userInfoA,
        mapping(address => UserInfo) storage userInfoB,
        mapping(address => uint256) storage lastClaimTime,
        ForceClaimParams memory p
    ) external returns (ForceClaimResult memory r) {
        UserInfo storage userA = userInfoA[p.user];
        UserInfo storage userB = userInfoB[p.user];
        uint256 rA = userA.rewards;
        uint256 rB = userB.rewards;
        uint256 totalReward = rA + rB;
        if (totalReward == 0) {
            revert StakingExecutionErrors.NoRewardsToClaim();
        }
        if (totalReward < p.minClaimAmount && poolA.badDebt == 0 && poolB.badDebt == 0 && !p.shutdown) {
            revert StakingExecutionErrors.BelowMinClaim(totalReward, p.minClaimAmount);
        }

        uint256 balanceB = p.rewardToken.balanceOf(address(this));
        uint256 lockedB = poolB.totalStaked + p.unclaimedFeesB;
        uint256 remain = balanceB > lockedB ? balanceB - lockedB : 0;

        r.payA = Math.min(rA, remain);
        remain -= r.payA;
        r.payB = Math.min(rB, remain);

        r.unpaidA = rA - r.payA;
        r.unpaidB = rB - r.payB;

        userA.rewards = 0;
        userB.rewards = 0;
        poolA.totalPending -= rA;
        poolB.totalPending -= rB;
        lastClaimTime[p.user] = block.timestamp;
        _applyUnpaidToDebtAndDust(poolA, poolB, r);

        uint256 paidTotal = r.payA + r.payB;
        if (paidTotal > 0) {
            p.rewardToken.safeTransfer(p.user, paidTotal);
        }
    }
}
