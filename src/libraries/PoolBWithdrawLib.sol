// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {PoolInfo, UserInfo} from "../StakeTypes.sol";
import {FOTTransferLib} from "./FOTTransferLib.sol";
import {RewardReanchorLib} from "./RewardReanchorLib.sol";
import {StakingExecutionErrors} from "../StakingExecutionErrors.sol";

/// @title PoolBWithdrawLib
/// @notice Linked library: Pool B withdraw, fees, penalties, and optional early-exit forfeiture logic.
/// @dev Early exit before `unlockTimeB` forfeits accrued `userB.rewards` back to `availableRewards` and charges `penaltyfeeBP` on principal.
///      Outbound TokenB FOT tax is borne by the user (PRD §4.6); protocol fees stay on-contract.
library PoolBWithdrawLib {
    /// @notice Intermediate fee/penalty breakdown for a single withdraw evaluation.
    struct WithdrawCalc {
        /// @notice Schedule-based withdraw fee (not early exit) in TokenB wei.
        uint256 fee;
        /// @notice Early-exit penalty on principal in TokenB wei.
        uint256 penalty;
        /// @notice True when `block.timestamp < unlockTimeB[user]`.
        bool isEarly;
    }

    /// @notice Inputs for `executeWithdrawB`.
    struct WithdrawBParams {
        /// @notice Account whose Pool B stake is reduced.
        address user;
        /// @notice Principal amount to withdraw from `userB.staked`.
        uint256 amount;
        /// @notice Minimum principal for an early exit (anti-dust / rounding constraint).
        uint256 minEarlyExitAmountB;
        /// @notice Early-exit penalty basis points on principal.
        uint256 penaltyfeeBP;
        /// @notice Withdraw fee basis points for short holding durations.
        uint256 withdrawFeeBP;
        /// @notice Mid-term fee basis points for medium holding durations.
        uint256 midTermFeeBP;
        /// @notice Basis-point denominator (`10_000`).
        uint256 basisPoints;
        /// @notice Schedule caps for post-forfeiture `rewardRate` re-anchor.
        RewardReanchorLib.ReanchorCaps reanchorCaps;
        /// @notice FOT outbound tax ceiling (`0` = no transfer loss allowed; symmetric with inbound).
        uint256 maxTransferFeeBP;
    }

    /// @notice Outputs for `executeWithdrawB` (caller aggregates fees into `unclaimedFeesB` if needed).
    struct WithdrawBResult {
        /// @notice Normal-path fee retained on-contract for later `claimFees` sweep.
        uint256 feeAddedToUnclaimed;
        /// @notice Sum of fee + penalty for a single analytics event field.
        uint256 feeOrPenaltyForEvent;
        /// @notice Whether the withdraw used early-exit semantics.
        bool isEarlyForEvent;
        /// @notice Pool B rewards moved from pending into `availableRewards` on early exit (`0` if not early / no rewards).
        uint256 forfeitedRewardsB;
    }

    /// @dev Validates `minEarlyExitAmountB`, forfeits user rewards into `availableRewards`, and returns principal penalty.
    function _handleEarlyExit(PoolInfo storage poolB, UserInfo storage userB, WithdrawBParams memory p)
        private
        returns (uint256 penalty, uint256 forfeitedReward)
    {
        if (p.amount < p.minEarlyExitAmountB) {
            revert StakingExecutionErrors.BelowMinEarlyExit(p.amount, p.minEarlyExitAmountB);
        }

        forfeitedReward = userB.rewards;
        if (forfeitedReward > 0) {
            if (poolB.totalPending < forfeitedReward) {
                revert StakingExecutionErrors.InsufficientPending(forfeitedReward, poolB.totalPending);
            }
            userB.rewards = 0;
            poolB.totalPending -= forfeitedReward;
            poolB.availableRewards += forfeitedReward;
        }

        penalty = Math.mulDiv(p.amount, p.penaltyfeeBP, p.basisPoints);
    }

    /// @dev Tiered fee schedule: `< 90 days` uses `withdrawFeeBP`, `<= 180 days` uses `midTermFeeBP`, else `0`.
    function _computeNormalFee(uint256 holdingDuration, WithdrawBParams memory p) private pure returns (uint256 fee) {
        uint256 feeBp;
        if (holdingDuration < 90 days) {
            feeBp = p.withdrawFeeBP;
        } else if (holdingDuration <= 180 days) {
            feeBp = p.midTermFeeBP;
        } else {
            feeBp = 0;
        }

        if (feeBp > 0) {
            fee = Math.mulDiv(p.amount, feeBp, p.basisPoints);
        }
    }

    /// @notice Withdraws Pool B principal for `p.user`, applying early/mid/normal fee rules and updating pool accounting.
    /// @param poolB Pool B `PoolInfo` storage.
    /// @param userInfoB Pool B user mapping.
    /// @param stakeTimestampB Per-user weighted deposit time (must be non-zero for valid withdraw).
    /// @param unlockTimeB Per-user unlock timestamp for early-exit detection.
    /// @param p Withdraw parameters (`WithdrawBParams`).
    /// @return r Fee sweep hint, event aggregation fields, and early flag.
    function executeWithdrawB(
        PoolInfo storage poolB,
        mapping(address => UserInfo) storage userInfoB,
        mapping(address => uint256) storage stakeTimestampB,
        mapping(address => uint256) storage unlockTimeB,
        WithdrawBParams memory p
    ) external returns (WithdrawBResult memory r) {
        UserInfo storage userB = userInfoB[p.user];

        if (p.amount == 0) revert StakingExecutionErrors.ZeroAmount();
        if (userB.staked < p.amount) {
            revert StakingExecutionErrors.InsufficientBalance(p.amount, userB.staked);
        }

        uint256 start = stakeTimestampB[p.user];
        if (start == 0) revert StakingExecutionErrors.InvalidStakeTimestamp();

        uint256 holdingDuration = block.timestamp - start;
        WithdrawCalc memory calc;

        if (block.timestamp < unlockTimeB[p.user]) {
            (calc.penalty, r.forfeitedRewardsB) = _handleEarlyExit(poolB, userB, p);
            calc.isEarly = true;
        } else {
            calc.fee = _computeNormalFee(holdingDuration, p);
            if (calc.fee > 0) {
                r.feeAddedToUnclaimed = calc.fee;
            }
        }

        // Penalty stays on-contract (see PRD); see `RewardReanchorLib.reanchorOnBudgetInjection` for why we refresh `rewardRate` here.
        if (calc.isEarly && (r.forfeitedRewardsB > 0 || calc.penalty > 0)) {
            if (calc.penalty > 0) {
                poolB.availableRewards += calc.penalty;
            }
            RewardReanchorLib.reanchorOnBudgetInjection(poolB, p.reanchorCaps);
        }

        uint256 netAmount = p.amount - calc.fee - calc.penalty;
        userB.staked -= p.amount;
        userB.rewardPaid = poolB.accRewardPerToken;
        poolB.totalStaked -= p.amount;

        FOTTransferLib.transferGross(poolB.stakingToken, p.user, netAmount, p.maxTransferFeeBP, p.basisPoints);

        r.feeOrPenaltyForEvent = calc.fee + calc.penalty;
        r.isEarlyForEvent = calc.isEarly;
    }
}
