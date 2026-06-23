// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Pool, PoolInfo} from "../StakeTypes.sol";
import {PoolAccrualLib} from "../libraries/PoolAccrualLib.sol";
import {PoolBCompoundLib} from "../libraries/PoolBCompoundLib.sol";
import {ForceClaimAllLib} from "../libraries/ForceClaimAllLib.sol";
import {PoolAStakeLib} from "../libraries/PoolAStakeLib.sol";
import {PoolBStakeLib} from "../libraries/PoolBStakeLib.sol";
import {PoolBWithdrawLib} from "../libraries/PoolBWithdrawLib.sol";
import {PoolSingleClaimLib} from "../libraries/PoolSingleClaimLib.sol";
import {RewardReanchorLib} from "../libraries/RewardReanchorLib.sol";
import {PoolCatchUpLib} from "../libraries/PoolCatchUpLib.sol";
import {StakingAdminLib} from "../libraries/StakingAdminLib.sol";
import {StakingExecutionErrors} from "../StakingExecutionErrors.sol";
import {DelegatecallGuard} from "./DelegatecallGuard.sol";
import {DualPoolStorageLayout} from "./DualPoolStorageLayout.sol";

/// @title DualPoolUserModule
/// @notice Delegate **user** execution module (stake/withdraw/claim/compound/emergency); storage is the core’s via `delegatecall`.
/// @dev Only valid when invoked through `DualPoolStaking._delegateTo(userModule, ...)`; never call `execute*` directly on-chain unless you intend to run against this contract’s own (wrong) storage.
/// @custom:delegatecall All mutating paths assume `address(this)` is the core; `msg.sender` in libraries is the **user** passed through calldata, not the EOA tx.origin.
contract DualPoolUserModule is DualPoolStorageLayout, DelegatecallGuard {
    /// @notice Stake / compound / certain withdraw paths are blocked while emergency mode is active (see each `execute*` guard).
    error EmergencyModeActive();
    /// @notice TokenB balance + `badDebt` no longer covers recorded liabilities within `DUST_TOLERANCE`.
    /// @param actual Observed backing side of the invariant (`balance + badDebt`).
    /// @param required Required liability sum from pool state fields.
    error InvariantViolation(uint256 actual, uint256 required);

    event Compounded(
        address indexed user, uint256 amountA, uint256 amountB, uint256 newUserStakedB, uint256 newUnlockTimeB
    );
    event ForceClaimed(
        address indexed user, uint256 paidA, uint256 paidB, uint256 unpaidA, uint256 unpaidB, uint256 timestamp
    );
    event EmergencyWithdrawn(
        address indexed user, uint256 principal, uint256 rewardsForfeited, Pool indexed pool, uint256 withdrawnAt
    );
    event InvariantViolated(uint256 actual, uint256 required, uint256 timestamp);
    event InsufficientBudget(Pool pool, uint256 shortfall, uint256 timestamp);
    event DustAccumulated(Pool pool, uint256 dustAmount, uint256 timestamp);
    event Staked(address indexed user, uint256 amount, uint256 unlockTime, Pool indexed pool);
    event Withdrawn(address indexed user, uint256 amount, uint256 feeOrPenalty, bool early, Pool indexed pool);
    event Claimed(address indexed user, uint256 amountA, uint256 amountB, uint256 timestamp);
    event PoolCatchUpCranked(Pool indexed pool, uint256 lastUpdateTime, uint256 catchUpCap, bool complete);

    /// @notice Permissionless catch-up crank: advances global accrual up to `MAX_CATCHUP_ITERATIONS` steps without reverting.
    /// @param poolRaw `0` = Pool A, `1` = Pool B.
    function executeCrankCatchUpPool(uint8 poolRaw) external onlyDelegatecall {
        if (poolRaw > uint8(Pool.B)) revert StakingExecutionErrors.InvalidPool(poolRaw);
        Pool p = Pool(poolRaw);
        PoolInfo storage pool = p == Pool.A ? poolAState : poolBState;
        bool complete = _advanceCatchUp(pool, p, false);
        emit PoolCatchUpCranked(p, pool.lastUpdateTime, PoolCatchUpLib.accrualCatchUpCap(pool, pausedAt, paused()), complete);
    }

    /// @notice Pool A stake entrypoint for delegatecall from the core.
    /// @param user Beneficiary passed from the core (expected `msg.sender` of the user tx).
    /// @param amount Requested `transferFrom` amount on TokenA (credited amount uses balance delta).
    function executeStakeA(address user, uint256 amount) external onlyDelegatecall {
        if (emergencyMode) revert EmergencyModeActive();
        if (shutdown) revert StakingExecutionErrors.ShutdownModeActive();
        if (amount == 0) revert StakingExecutionErrors.ZeroAmount();
        if (maxTransferFeeBP > BASIS_POINTS) revert StakingExecutionErrors.InvalidMaxTransferFeeBp();
        _catchUpExpiredGlobalA();
        _settleUserA(user);

        PoolAStakeLib.StakeAParams memory params = PoolAStakeLib.StakeAParams({
            user: user,
            amountRequested: amount,
            maxTransferFeeBP: maxTransferFeeBP,
            basisPoints: BASIS_POINTS,
            minRewardRateDuration: MIN_REWARD_RATE_DURATION,
            maxRewardDuration: MAX_DURATION,
            maxAprBp: MAX_APR_BP,
            secondsPerYear: SECONDS_PER_YEAR,
            maxTotalSupplyBForRewardRateCap: maxTotalSupplyBForRewardRateCap
        });

        uint256 actualReceived = PoolAStakeLib.executeStakeA(poolAState, userInfoA, params);
        _assertInvariantB();
        emit Staked(user, actualReceived, 0, Pool.A);
    }

    /// @notice Pool B stake entrypoint for delegatecall from the core.
    /// @param user Beneficiary passed from the core.
    /// @param amount Requested `transferFrom` amount on TokenB.
    function executeStakeB(address user, uint256 amount) external onlyDelegatecall {
        if (emergencyMode) revert EmergencyModeActive();
        if (shutdown) revert StakingExecutionErrors.ShutdownModeActive();
        if (amount == 0) revert StakingExecutionErrors.ZeroAmount();
        if (maxTransferFeeBP > BASIS_POINTS) revert StakingExecutionErrors.InvalidMaxTransferFeeBp();
        _catchUpExpiredGlobalB();
        _settleUserB(user);

        PoolBStakeLib.StakeBParams memory params = PoolBStakeLib.StakeBParams({
            user: user,
            amountRequested: amount,
            lockDuration: lockDuration,
            maxTransferFeeBP: maxTransferFeeBP,
            basisPoints: BASIS_POINTS,
            minRewardRateDuration: MIN_REWARD_RATE_DURATION,
            maxRewardDuration: MAX_DURATION,
            maxAprBp: MAX_APR_BP,
            secondsPerYear: SECONDS_PER_YEAR,
            maxTotalSupplyBForRewardRateCap: maxTotalSupplyBForRewardRateCap
        });
        PoolBStakeLib.StakeBResult memory sb =
            PoolBStakeLib.executeStakeB(poolBState, userInfoB, unlockTimeB, stakeTimestampB, params);
        _assertInvariantB();
        emit Staked(user, sb.received, sb.newUnlockTime, Pool.B);
    }

    /// @notice Pool B withdraw entrypoint for delegatecall from the core.
    /// @param user Account whose principal is reduced.
    /// @param amount Principal to withdraw before fees/penalties.
    function executeWithdrawB(address user, uint256 amount) external onlyDelegatecall {
        if (emergencyMode && !shutdown) revert EmergencyModeActive();
        _catchUpExpiredGlobalB();
        _settleUserB(user);

        PoolBWithdrawLib.WithdrawBParams memory params = PoolBWithdrawLib.WithdrawBParams({
            user: user,
            amount: amount,
            minEarlyExitAmountB: minEarlyExitAmountB,
            penaltyfeeBP: penaltyfeeBP,
            withdrawFeeBP: withdrawFeeBP,
            midTermFeeBP: midTermFeeBP,
            basisPoints: BASIS_POINTS,
            reanchorCaps: _reanchorCaps(),
            maxTransferFeeBP: maxTransferFeeBP
        });

        PoolBWithdrawLib.WithdrawBResult memory res =
            PoolBWithdrawLib.executeWithdrawB(poolBState, userInfoB, stakeTimestampB, unlockTimeB, params);
        bookedUserRewardsB -= res.forfeitedRewardsB;
        unclaimedFeesB += res.feeAddedToUnclaimed;
        _assertInvariantB();
        emit Withdrawn(user, amount, res.feeOrPenaltyForEvent, res.isEarlyForEvent, Pool.B);
    }

    /// @notice Pool A withdraw entrypoint for delegatecall from the core.
    /// @param user Account whose TokenA stake is reduced.
    /// @param amount Principal to return to `user`.
    function executeWithdrawA(address user, uint256 amount) external onlyDelegatecall {
        if (emergencyMode && !shutdown) revert EmergencyModeActive();
        _catchUpExpiredGlobalA();
        _settleUserA(user);
        PoolAStakeLib.executeWithdrawA(poolAState, userInfoA, user, amount, maxTransferFeeBP, BASIS_POINTS);
        _assertInvariantB();
        emit Withdrawn(user, amount, 0, false, Pool.A);
    }

    /// @notice Pool A reward claim entrypoint for delegatecall from the core.
    /// @param user Claimant receiving TokenB payout for Pool A accrued rewards.
    function executeClaimA(address user) external onlyDelegatecall {
        if (emergencyMode && !shutdown) revert EmergencyModeActive();
        // M-2: cooldown applies only after the first successful claim/compound path that set `lastClaimTime` (non-zero).
        if (lastClaimTime[user] != 0 && block.timestamp < lastClaimTime[user] + claimCooldown) {
            revert StakingExecutionErrors.UnlockTimePending(lastClaimTime[user] + claimCooldown, block.timestamp);
        }
        _catchUpExpiredGlobalA();
        _settleUserA(user);
        PoolSingleClaimLib.ClaimParams memory claimParamsA = PoolSingleClaimLib.ClaimParams({
            rewardToken: rewardToken,
            claimer: user,
            minClaimAmount: minClaimAmount,
            badDebtPoolA: poolAState.badDebt,
            badDebtPoolB: poolBState.badDebt,
            poolBTotalStaked: poolBState.totalStaked,
            unclaimedFeesB: unclaimedFeesB,
            maxTransferFeeBP: maxTransferFeeBP,
            basisPoints: BASIS_POINTS
        });
        uint256 reward = PoolSingleClaimLib.executeClaim(poolAState, userInfoA[user], lastClaimTime, claimParamsA);
        bookedUserRewardsA -= reward;
        _assertInvariantB();
        emit Claimed(user, reward, 0, block.timestamp);
    }

    /// @notice Pool B reward claim entrypoint for delegatecall from the core.
    /// @param user Claimant receiving TokenB payout for Pool B accrued rewards.
    function executeClaimB(address user) external onlyDelegatecall {
        if (emergencyMode && !shutdown) revert EmergencyModeActive();
        // M-2: first claim exempt — same `lastClaimTime != 0` guard as `executeClaimA`.
        if (lastClaimTime[user] != 0 && block.timestamp < lastClaimTime[user] + claimCooldown) {
            revert StakingExecutionErrors.UnlockTimePending(lastClaimTime[user] + claimCooldown, block.timestamp);
        }
        _catchUpExpiredGlobalB();
        _settleUserB(user);
        PoolSingleClaimLib.ClaimParams memory claimParamsB = PoolSingleClaimLib.ClaimParams({
            rewardToken: rewardToken,
            claimer: user,
            minClaimAmount: minClaimAmount,
            badDebtPoolA: poolAState.badDebt,
            badDebtPoolB: poolBState.badDebt,
            poolBTotalStaked: poolBState.totalStaked,
            unclaimedFeesB: unclaimedFeesB,
            maxTransferFeeBP: maxTransferFeeBP,
            basisPoints: BASIS_POINTS
        });
        uint256 reward = PoolSingleClaimLib.executeClaim(poolBState, userInfoB[user], lastClaimTime, claimParamsB);
        bookedUserRewardsB -= reward;
        _assertInvariantB();
        emit Claimed(user, 0, reward, block.timestamp);
    }

    /// @notice Force-claim-all entrypoint for delegatecall from the core (partial pay when liquidity is insufficient).
    /// @param user Claimant whose Pool A + B rewards are settled; only during `shutdown` or when either pool has `badDebt`.
    ///      Per-pool `minClaimAmount` applies when not shutdown and no bad debt (see `ForceClaimAllLib`).
    function executeForceClaimAll(address user) external onlyDelegatecall {
        if (emergencyMode && !shutdown) revert EmergencyModeActive();
        if (!shutdown && poolAState.badDebt == 0 && poolBState.badDebt == 0) {
            revert StakingExecutionErrors.ForceClaimAllNotAvailable();
        }
        // M-2: cooldown parity with standard claim — first use still allowed when `lastClaimTime[user] == 0`.
        if (lastClaimTime[user] != 0 && block.timestamp < lastClaimTime[user] + claimCooldown) {
            revert StakingExecutionErrors.UnlockTimePending(lastClaimTime[user] + claimCooldown, block.timestamp);
        }

        _catchUpExpiredGlobalA();
        _catchUpExpiredGlobalB();
        _settleUserA(user);
        _settleUserB(user);

        ForceClaimAllLib.ForceClaimParams memory params = ForceClaimAllLib.ForceClaimParams({
            rewardToken: rewardToken,
            user: user,
            minClaimAmount: minClaimAmount,
            unclaimedFeesB: unclaimedFeesB,
            shutdown: shutdown,
            maxTransferFeeBP: maxTransferFeeBP,
            basisPoints: BASIS_POINTS
        });

        ForceClaimAllLib.ForceClaimResult memory fc =
            ForceClaimAllLib.executeForceClaimAll(poolAState, poolBState, userInfoA, userInfoB, lastClaimTime, params);
        bookedUserRewardsA -= fc.payA + fc.unpaidA;
        bookedUserRewardsB -= fc.payB + fc.unpaidB;

        _assertInvariantB();
        emit ForceClaimed(user, fc.payA, fc.payB, fc.unpaidA, fc.unpaidB, block.timestamp);
    }

    /// @notice Compound-to-Pool-B entrypoint for delegatecall from the core.
    /// @param user Beneficiary whose accrued rewards in both pools become Pool B principal.
    function executeCompoundB(address user) external onlyDelegatecall {
        if (emergencyMode) revert EmergencyModeActive();
        if (shutdown) revert StakingExecutionErrors.ShutdownModeActive();
        _catchUpExpiredGlobalA();
        _catchUpExpiredGlobalB();
        // M-2: same cooldown semantics as claim — first compound allowed when `lastClaimTime` is still zero.
        if (lastClaimTime[user] != 0 && block.timestamp < lastClaimTime[user] + claimCooldown) {
            revert StakingExecutionErrors.UnlockTimePending(lastClaimTime[user] + claimCooldown, block.timestamp);
        }
        if (poolAState.badDebt > 0 || poolBState.badDebt > 0) {
            revert StakingExecutionErrors.BadDebtExists();
        }
        _settleUserA(user);
        _settleUserB(user);

        uint256 rewardA = userInfoA[user].rewards;
        uint256 rewardB = userInfoB[user].rewards;
        if (rewardA > 0 && rewardA < minClaimAmount) {
            revert StakingExecutionErrors.BelowMinClaim(rewardA, minClaimAmount);
        }
        if (rewardB > 0 && rewardB < minClaimAmount) {
            revert StakingExecutionErrors.BelowMinClaim(rewardB, minClaimAmount);
        }

        PoolBCompoundLib.CompoundBParams memory params = PoolBCompoundLib.CompoundBParams({
            user: user,
            lockDuration: lockDuration,
            minRewardRateDuration: MIN_REWARD_RATE_DURATION,
            maxRewardDuration: MAX_DURATION,
            maxAprBp: MAX_APR_BP,
            basisPoints: BASIS_POINTS,
            secondsPerYear: SECONDS_PER_YEAR,
            maxTotalSupplyBForRewardRateCap: maxTotalSupplyBForRewardRateCap
        });
        PoolBCompoundLib.CompoundBResult memory res = PoolBCompoundLib.executeCompoundB(
            poolAState, poolBState, userInfoA, userInfoB, unlockTimeB, stakeTimestampB, lastClaimTime, params
        );
        bookedUserRewardsA -= res.rewardA;
        bookedUserRewardsB -= res.rewardB;

        _assertInvariantB();
        emit Compounded(user, res.rewardA, res.rewardB, res.newUserStakedB, res.newUnlockTimeB);
    }

    /// @notice Emergency Pool A principal exit for delegatecall from the core.
    /// @param user Account whose Pool A position is force-closed to zero.
    function executeEmergencyWithdrawA(address user) external onlyDelegatecall {
        if (!emergencyMode) revert StakingExecutionErrors.NotInEmergency();
        if (shutdown) revert StakingExecutionErrors.ShutdownModeActive();
        // Accrue through `now` and settle so `userInfoA.rewards` / `totalPending` match the index (avoids ghost pending).
        _catchUpExpiredGlobalA();
        _catchUpExpiredGlobalB();
        _settleUserA(user);
        _settleUserB(user);
        uint256 rewardSnapA = userInfoA[user].rewards;
        StakingAdminLib.EmergencyWithdrawAParams memory params = StakingAdminLib.EmergencyWithdrawAParams({
            emergencyMode: emergencyMode,
            shutdown: shutdown,
            user: user,
            maxTransferFeeBP: maxTransferFeeBP,
            basisPoints: BASIS_POINTS
        });
        uint256 stakedAmount =
            StakingAdminLib.executeEmergencyWithdrawA(poolAState, poolBState, userInfoA, params, _reanchorCaps());
        bookedUserRewardsA -= rewardSnapA;
        _checkInvariantBNoRevert();
        emit EmergencyWithdrawn(user, stakedAmount, rewardSnapA, Pool.A, block.timestamp);
    }

    /// @notice Emergency Pool B principal exit for delegatecall from the core.
    /// @param user Account whose Pool B position is force-closed to zero.
    function executeEmergencyWithdrawB(address user) external onlyDelegatecall {
        if (!emergencyMode) revert StakingExecutionErrors.NotInEmergency();
        if (shutdown) revert StakingExecutionErrors.ShutdownModeActive();
        _catchUpExpiredGlobalA();
        _catchUpExpiredGlobalB();
        _settleUserA(user);
        _settleUserB(user);
        uint256 rewardSnapB = userInfoB[user].rewards;
        StakingAdminLib.EmergencyWithdrawBParams memory params = StakingAdminLib.EmergencyWithdrawBParams({
            emergencyMode: emergencyMode,
            shutdown: shutdown,
            user: user,
            maxTransferFeeBP: maxTransferFeeBP,
            basisPoints: BASIS_POINTS
        });
        uint256 stakedAmount = StakingAdminLib.executeEmergencyWithdrawB(
            poolBState, userInfoB, unlockTimeB, stakeTimestampB, params, _reanchorCaps()
        );
        bookedUserRewardsB -= rewardSnapB;
        _checkInvariantBNoRevert();
        emit EmergencyWithdrawn(user, stakedAmount, rewardSnapB, Pool.B, block.timestamp);
    }

    /// @dev APR / duration caps for `RewardReanchorLib.reanchorOnBudgetInjection`.
    function _reanchorCaps() private view returns (RewardReanchorLib.ReanchorCaps memory) {
        return RewardReanchorLib.ReanchorCaps({
            minDuration: MIN_REWARD_RATE_DURATION,
            maxDuration: MAX_DURATION,
            maxAprBp: MAX_APR_BP,
            basisPoints: BASIS_POINTS,
            secondsPerYear: SECONDS_PER_YEAR,
            maxTotalSupplyBForRewardRateCap: maxTotalSupplyBForRewardRateCap
        });
    }

    /// @dev Advances Pool A global reward index; emits `InsufficientBudget` / `DustAccumulated` when the library reports signals.
    function _updateGlobalA() internal {
        PoolAccrualLib.GlobalEmit memory ge =
            PoolAccrualLib.updateGlobal(poolAState, MAX_DELTA_TIME, PRECISION, DUST_TOLERANCE, pausedAt, paused());
        if (ge.insufficient) emit InsufficientBudget(Pool.A, ge.shortfall, block.timestamp);
        if (ge.dust) emit DustAccumulated(Pool.A, ge.dustWei, block.timestamp);
    }

    /// @dev Advances Pool B global reward index.
    function _updateGlobalB() internal {
        PoolAccrualLib.GlobalEmit memory ge =
            PoolAccrualLib.updateGlobal(poolBState, MAX_DELTA_TIME, PRECISION, DUST_TOLERANCE, pausedAt, paused());
        if (ge.insufficient) emit InsufficientBudget(Pool.B, ge.shortfall, block.timestamp);
        if (ge.dust) emit DustAccumulated(Pool.B, ge.dustWei, block.timestamp);
    }

    /// @dev A stale schedule can be re-anchored only after its old emission window is fully accounted.
    ///      Otherwise a new stake could join before `lastUpdateTime` reaches `periodFinish` and share old rewards.
    ///      Uses the same `MAX_CATCHUP_ITERATIONS` budget as `DualPoolAdminModule._catchUpGlobal`.
    function _catchUpExpiredGlobalA() internal {
        _catchUpExpiredGlobal(poolAState, Pool.A);
    }

    /// @dev Same stale-schedule catch-up for Pool B.
    function _catchUpExpiredGlobalB() internal {
        _catchUpExpiredGlobal(poolBState, Pool.B);
    }

    function _catchUpExpiredGlobal(PoolInfo storage pool, Pool p) private {
        _advanceCatchUp(pool, p, true);
    }

    /// @dev Advances `pool.lastUpdateTime` toward `accrualCatchUpCap` by up to `MAX_CATCHUP_ITERATIONS` steps.
    /// @return complete Whether `lastUpdateTime` reached the cap after this call.
    function _advanceCatchUp(PoolInfo storage pool, Pool p, bool requireComplete) private returns (bool complete) {
        uint256 cap = PoolCatchUpLib.accrualCatchUpCap(pool, pausedAt, paused());
        uint256 iterations;
        while (pool.lastUpdateTime < cap && iterations < MAX_CATCHUP_ITERATIONS) {
            uint256 prev = pool.lastUpdateTime;
            if (p == Pool.A) {
                _updateGlobalA();
            } else {
                _updateGlobalB();
            }
            if (pool.lastUpdateTime == prev) break;
            iterations++;
        }
        complete = pool.lastUpdateTime >= cap;
        if (requireComplete && !complete) {
            revert StakingExecutionErrors.PauseCatchUpIncomplete(cap, pool.lastUpdateTime);
        }
    }

    /// @dev Settles Pool A rewards for `user` against `accRewardPerToken`.
    /// @param user Address whose `userInfoA` row is updated.
    function _settleUserA(address user) internal {
        bookedUserRewardsA += PoolAccrualLib.settleUser(poolAState, userInfoA, user, PRECISION);
    }

    /// @dev Settles Pool B rewards for `user` against `accRewardPerToken`.
    /// @param user Address whose `userInfoB` row is updated.
    function _settleUserB(address user) internal {
        bookedUserRewardsB += PoolAccrualLib.settleUser(poolBState, userInfoB, user, PRECISION);
    }

    /// @dev Liability leg (part 1) for TokenB balance invariant: principal plus promised pending rewards.
    /// @return Sum of Pool B staked principal and both pools’ `totalPending`.
    function _invariantRequiredPart1() internal view returns (uint256) {
        return poolBState.totalStaked + poolAState.totalPending + poolBState.totalPending;
    }

    /// @dev Liability leg (part 2) for TokenB balance invariant: unscheduled budgets, fees, and dust buckets.
    /// @return Sum of both pools’ `availableRewards`, `unclaimedFeesB`, and `dust`.
    function _invariantRequiredPart2() internal view returns (uint256) {
        return
            poolAState.availableRewards + poolBState.availableRewards + unclaimedFeesB + poolAState.dust
                + poolBState.dust;
    }

    /// @dev Compares TokenB balance + bad debt vs required liability sum.
    /// @return actual TokenB balance plus both pools’ `badDebt`.
    /// @return required `_invariantRequiredPart1() + _invariantRequiredPart2()`.
    function _invariantBActualRequired() internal view returns (uint256 actual, uint256 required) {
        uint256 balanceB = rewardToken.balanceOf(address(this));
        actual = balanceB + poolAState.badDebt + poolBState.badDebt;
        required = _invariantRequiredPart1() + _invariantRequiredPart2();
    }

    /// @dev Reverts if `bookedUserRewards*` exceeds `totalPending*` (L-5 runtime guard).
    function _assertBookedWithinPending() internal view {
        if (bookedUserRewardsA > poolAState.totalPending || bookedUserRewardsB > poolBState.totalPending) {
            revert StakingExecutionErrors.BookedRewardsExceedPending();
        }
    }

    /// @dev Reverts if TokenB invariant is violated (emits diagnostic event first).
    function _assertInvariantB() internal {
        _assertBookedWithinPending();
        (uint256 actual, uint256 required) = _invariantBActualRequired();
        if (actual + DUST_TOLERANCE < required) {
            emit InvariantViolated(actual, required, block.timestamp);
            revert InvariantViolation(actual, required);
        }
    }

    /// @dev Same invariant check as `_assertInvariantB` but never reverts on TokenB shortfall (emergency paths).
    function _checkInvariantBNoRevert() internal {
        _assertBookedWithinPending();
        (uint256 actual, uint256 required) = _invariantBActualRequired();
        if (actual + DUST_TOLERANCE < required) {
            emit InvariantViolated(actual, required, block.timestamp);
        }
    }
}
