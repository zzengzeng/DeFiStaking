// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {PoolInfo, UserInfo} from "../StakeTypes.sol";
import {FOTTransferLib} from "./FOTTransferLib.sol";
import {StakingExecutionErrors} from "../StakingExecutionErrors.sol";

/// @title ForceClaimAllLib
/// @notice Linked library: `forceClaimAll` settlement across pools with partial pay, debt, and dust handling.
/// @dev Liquidation policy: spendable TokenB is `balance - (poolB.totalStaked + unclaimedFeesB)`, then allocated
///      sequentially to Pool A then Pool B rewards. It intentionally does not reserve `availableRewards` because this
///      path is available only during shutdown or bad debt, where unpaid user rewards take priority over future budgets.
library ForceClaimAllLib {

    /// @notice Inputs for `executeForceClaimAll`.
    struct ForceClaimParams {
        /// @notice Reward / TokenB asset used for payout.
        IERC20 rewardToken;
        /// @notice User whose both pools’ `rewards` fields are cleared.
        address user;
        /// @notice Minimum claim threshold (wei); **per-pool** when `!shutdown` and no bad debt—same semantics as `claimA`/`claimB`.
        uint256 minClaimAmount;
        /// @notice Pool B fees reserved on-contract (reduces spendable remainder in liability calc).
        uint256 unclaimedFeesB;
        /// @notice When true, bypasses `BelowMinClaim` for small totals if bad debt is also zero (see revert tree).
        bool shutdown;
        /// @notice FOT outbound tax ceiling (`0` = standard ERC20).
        uint256 maxTransferFeeBP;
        /// @notice Basis-point denominator (`10_000`).
        uint256 basisPoints;
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

    /// @notice Settles both pools’ rewards for `p.user`; may pay partially when liquidity is short.
    /// @dev When **not** `shutdown` and both pools have zero `badDebt`, each pool with `rewards > 0` must be `>= minClaimAmount`
    ///      (same anti-dust rule as single-pool claims—cannot sum two sub-threshold pools via this path). Shutdown or any pool
    ///      bad debt relaxes that check so small balances can still be cleared with partial pay.
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
        if (!p.shutdown && poolA.badDebt == 0 && poolB.badDebt == 0) {
            if (rA > 0 && rA < p.minClaimAmount) {
                revert StakingExecutionErrors.BelowMinClaim(rA, p.minClaimAmount);
            }
            if (rB > 0 && rB < p.minClaimAmount) {
                revert StakingExecutionErrors.BelowMinClaim(rB, p.minClaimAmount);
            }
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
            FOTTransferLib.transferGross(p.rewardToken, p.user, paidTotal, p.maxTransferFeeBP, p.basisPoints);
        }
    }
}
