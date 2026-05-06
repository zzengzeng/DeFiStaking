// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Pool} from "../StakeTypes.sol";
import {PoolAccrualLib} from "../libraries/PoolAccrualLib.sol";
import {PoolBCompoundLib} from "../libraries/PoolBCompoundLib.sol";
import {ForceClaimAllLib} from "../libraries/ForceClaimAllLib.sol";
import {PoolAStakeLib} from "../libraries/PoolAStakeLib.sol";
import {PoolBStakeLib} from "../libraries/PoolBStakeLib.sol";
import {PoolBWithdrawLib} from "../libraries/PoolBWithdrawLib.sol";
import {PoolSingleClaimLib} from "../libraries/PoolSingleClaimLib.sol";
import {StakingAdminLib} from "../libraries/StakingAdminLib.sol";
import {StakingExecutionErrors} from "../StakingExecutionErrors.sol";
import {DualPoolStorageLayout} from "./DualPoolStorageLayout.sol";

/// @title DualPoolUserModule
/// @notice Delegate **user** execution module (stake/withdraw/claim/compound/emergency); storage is the core’s via `delegatecall`.
/// @dev Only valid when invoked through `DualPoolStaking._delegateTo(userModule, ...)`; never call `execute*` directly on-chain unless you intend to run against this contract’s own (wrong) storage.
/// @custom:delegatecall All mutating paths assume `address(this)` is the core; `msg.sender` in libraries is the **user** passed through calldata, not the EOA tx.origin.
contract DualPoolUserModule is DualPoolStorageLayout {
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
    event EmergencyWithdrawn(address indexed user, uint256 amount, Pool indexed pool, uint256 at);
    event InvariantViolated(uint256 actual, uint256 required, uint256 timestamp);
    event InsufficientBudget(Pool pool, uint256 shortfall, uint256 timestamp);
    event DustAccumulated(Pool pool, uint256 dustAmount, uint256 timestamp);
    event Staked(address indexed user, uint256 amount, uint256 unlockTime, Pool indexed pool);
    event Withdrawn(address indexed user, uint256 amount, uint256 feeOrPenalty, bool early, Pool indexed pool);
    event Claimed(address indexed user, uint256 amountA, uint256 amountB, uint256 timestamp);

    /// @notice Pool A stake entrypoint for delegatecall from the core.
    /// @param user Beneficiary passed from the core (expected `msg.sender` of the user tx).
    /// @param amount Requested `transferFrom` amount on TokenA (credited amount uses balance delta).
    function executeStakeA(address user, uint256 amount) external {
        if (emergencyMode) revert EmergencyModeActive();
        if (shutdown) revert StakingExecutionErrors.ShutdownModeActive();
        if (amount == 0) revert StakingExecutionErrors.ZeroAmount();
        if (maxTransferFeeBP > BASIS_POINTS) revert StakingExecutionErrors.InvalidMaxTransferFeeBp();
        _updateGlobalA();
        _settleUserA(user);

        PoolAStakeLib.StakeAParams memory params = PoolAStakeLib.StakeAParams({
            user: user, amountRequested: amount, maxTransferFeeBP: maxTransferFeeBP, basisPoints: BASIS_POINTS
        });

        uint256 actualReceived = PoolAStakeLib.executeStakeA(poolAState, userInfoA, params);
        _assertInvariantB();
        emit Staked(user, actualReceived, 0, Pool.A);
    }

    /// @notice Pool B stake entrypoint for delegatecall from the core.
    /// @param user Beneficiary passed from the core.
    /// @param amount Requested `transferFrom` amount on TokenB.
    function executeStakeB(address user, uint256 amount) external {
        if (emergencyMode) revert EmergencyModeActive();
        if (shutdown) revert StakingExecutionErrors.ShutdownModeActive();
        if (amount == 0) revert StakingExecutionErrors.ZeroAmount();
        if (maxTransferFeeBP > BASIS_POINTS) revert StakingExecutionErrors.InvalidMaxTransferFeeBp();
        _updateGlobalB();
        _settleUserB(user);

        PoolBStakeLib.StakeBParams memory params = PoolBStakeLib.StakeBParams({
            user: user,
            amountRequested: amount,
            lockDuration: lockDuration,
            maxTransferFeeBP: maxTransferFeeBP,
            basisPoints: BASIS_POINTS
        });
        PoolBStakeLib.StakeBResult memory sb =
            PoolBStakeLib.executeStakeB(poolBState, userInfoB, unlockTimeB, stakeTimestampB, params);
        _assertInvariantB();
        emit Staked(user, sb.received, sb.newUnlockTime, Pool.B);
    }

    /// @notice Pool B withdraw entrypoint for delegatecall from the core.
    /// @param user Account whose principal is reduced.
    /// @param amount Principal to withdraw before fees/penalties.
    function executeWithdrawB(address user, uint256 amount) external {
        if (emergencyMode && !shutdown) revert EmergencyModeActive();
        _updateGlobalB();
        _settleUserB(user);

        PoolBWithdrawLib.WithdrawBParams memory params = PoolBWithdrawLib.WithdrawBParams({
            user: user,
            amount: amount,
            minEarlyExitAmountB: minEarlyExitAmountB,
            penaltyfeeBP: penaltyfeeBP,
            withdrawFeeBP: withdrawFeeBP,
            midTermFeeBP: midTermFeeBP,
            basisPoints: BASIS_POINTS
        });

        PoolBWithdrawLib.WithdrawBResult memory res =
            PoolBWithdrawLib.executeWithdrawB(poolBState, userInfoB, stakeTimestampB, unlockTimeB, params);
        unclaimedFeesB += res.feeAddedToUnclaimed;
        _assertInvariantB();
        emit Withdrawn(user, amount, res.feeOrPenaltyForEvent, res.isEarlyForEvent, Pool.B);
    }

    /// @notice Pool A withdraw entrypoint for delegatecall from the core.
    /// @param user Account whose TokenA stake is reduced.
    /// @param amount Principal to return to `user`.
    function executeWithdrawA(address user, uint256 amount) external {
        if (emergencyMode && !shutdown) revert EmergencyModeActive();
        _updateGlobalA();
        _settleUserA(user);
        PoolAStakeLib.executeWithdrawA(poolAState, userInfoA, user, amount);
        _assertInvariantB();
        emit Withdrawn(user, amount, 0, false, Pool.A);
    }

    /// @notice Pool A reward claim entrypoint for delegatecall from the core.
    /// @param user Claimant receiving TokenB payout for Pool A accrued rewards.
    function executeClaimA(address user) external {
        if (emergencyMode && !shutdown) revert EmergencyModeActive();
        // M-2: cooldown applies only after the first successful claim/compound path that set `lastClaimTime` (non-zero).
        if (lastClaimTime[user] != 0 && block.timestamp < lastClaimTime[user] + claimCooldown) {
            revert StakingExecutionErrors.UnlockTimePending(lastClaimTime[user] + claimCooldown, block.timestamp);
        }
        _updateGlobalA();
        _settleUserA(user);
        PoolSingleClaimLib.ClaimParams memory claimParamsA = PoolSingleClaimLib.ClaimParams({
            rewardToken: rewardToken,
            claimer: user,
            minClaimAmount: minClaimAmount,
            badDebtPoolA: poolAState.badDebt,
            badDebtPoolB: poolBState.badDebt
        });
        uint256 reward = PoolSingleClaimLib.executeClaim(poolAState, userInfoA[user], lastClaimTime, claimParamsA);
        _assertInvariantB();
        emit Claimed(user, reward, 0, block.timestamp);
    }

    /// @notice Pool B reward claim entrypoint for delegatecall from the core.
    /// @param user Claimant receiving TokenB payout for Pool B accrued rewards.
    function executeClaimB(address user) external {
        if (emergencyMode && !shutdown) revert EmergencyModeActive();
        // M-2: first claim exempt — same `lastClaimTime != 0` guard as `executeClaimA`.
        if (lastClaimTime[user] != 0 && block.timestamp < lastClaimTime[user] + claimCooldown) {
            revert StakingExecutionErrors.UnlockTimePending(lastClaimTime[user] + claimCooldown, block.timestamp);
        }
        _updateGlobalB();
        _settleUserB(user);
        PoolSingleClaimLib.ClaimParams memory claimParamsB = PoolSingleClaimLib.ClaimParams({
            rewardToken: rewardToken,
            claimer: user,
            minClaimAmount: minClaimAmount,
            badDebtPoolA: poolAState.badDebt,
            badDebtPoolB: poolBState.badDebt
        });
        uint256 reward = PoolSingleClaimLib.executeClaim(poolBState, userInfoB[user], lastClaimTime, claimParamsB);
        _assertInvariantB();
        emit Claimed(user, 0, reward, block.timestamp);
    }

    /// @notice Force-claim-all entrypoint for delegatecall from the core.
    /// @param user Claimant whose Pool A + B rewards are settled under shutdown / liquidity rules.
    function executeForceClaimAll(address user) external {
        if (emergencyMode && !shutdown) revert EmergencyModeActive();
        // M-2: cooldown parity with standard claim — first use still allowed when `lastClaimTime[user] == 0`.
        if (lastClaimTime[user] != 0 && block.timestamp < lastClaimTime[user] + claimCooldown) {
            revert StakingExecutionErrors.UnlockTimePending(lastClaimTime[user] + claimCooldown, block.timestamp);
        }

        _updateGlobalA();
        _updateGlobalB();
        _settleUserA(user);
        _settleUserB(user);

        ForceClaimAllLib.ForceClaimParams memory params = ForceClaimAllLib.ForceClaimParams({
            rewardToken: rewardToken,
            user: user,
            minClaimAmount: minClaimAmount,
            unclaimedFeesB: unclaimedFeesB,
            shutdown: shutdown
        });

        ForceClaimAllLib.ForceClaimResult memory fc =
            ForceClaimAllLib.executeForceClaimAll(poolAState, poolBState, userInfoA, userInfoB, lastClaimTime, params);

        _assertInvariantB();
        emit ForceClaimed(user, fc.payA, fc.payB, fc.unpaidA, fc.unpaidB, block.timestamp);
    }

    /// @notice Compound-to-Pool-B entrypoint for delegatecall from the core.
    /// @param user Beneficiary whose accrued rewards in both pools become Pool B principal.
    function executeCompoundB(address user) external {
        if (emergencyMode) revert EmergencyModeActive();
        if (shutdown) revert StakingExecutionErrors.ShutdownModeActive();
        _updateGlobalA();
        _updateGlobalB();
        // M-2: same cooldown semantics as claim — first compound allowed when `lastClaimTime` is still zero.
        if (lastClaimTime[user] != 0 && block.timestamp < lastClaimTime[user] + claimCooldown) {
            revert StakingExecutionErrors.UnlockTimePending(lastClaimTime[user] + claimCooldown, block.timestamp);
        }
        if (poolAState.badDebt > 0 || poolBState.badDebt > 0) {
            revert StakingExecutionErrors.BadDebtExists();
        }
        _settleUserA(user);
        _settleUserB(user);

        PoolBCompoundLib.CompoundBParams memory params =
            PoolBCompoundLib.CompoundBParams({user: user, lockDuration: lockDuration});
        PoolBCompoundLib.CompoundBResult memory res = PoolBCompoundLib.executeCompoundB(
            poolAState, poolBState, userInfoA, userInfoB, unlockTimeB, stakeTimestampB, lastClaimTime, params
        );

        _assertInvariantB();
        emit Compounded(user, res.rewardA, res.rewardB, res.newUserStakedB, res.newUnlockTimeB);
    }

    /// @notice Emergency Pool A principal exit for delegatecall from the core.
    /// @param user Account whose Pool A position is force-closed to zero.
    function executeEmergencyWithdrawA(address user) external {
        StakingAdminLib.EmergencyWithdrawAParams memory params =
            StakingAdminLib.EmergencyWithdrawAParams({emergencyMode: emergencyMode, shutdown: shutdown, user: user});
        uint256 stakedAmount = StakingAdminLib.executeEmergencyWithdrawA(poolAState, poolBState, userInfoA, params);
        _checkInvariantBNoRevert();
        emit EmergencyWithdrawn(user, stakedAmount, Pool.A, block.timestamp);
    }

    /// @notice Emergency Pool B principal exit for delegatecall from the core.
    /// @param user Account whose Pool B position is force-closed to zero.
    function executeEmergencyWithdrawB(address user) external {
        StakingAdminLib.EmergencyWithdrawBParams memory params =
            StakingAdminLib.EmergencyWithdrawBParams({emergencyMode: emergencyMode, shutdown: shutdown, user: user});
        uint256 stakedAmount =
            StakingAdminLib.executeEmergencyWithdrawB(poolBState, userInfoB, unlockTimeB, stakeTimestampB, params);
        _checkInvariantBNoRevert();
        emit EmergencyWithdrawn(user, stakedAmount, Pool.B, block.timestamp);
    }

    /// @dev Advances Pool A global reward index; emits `InsufficientBudget` / `DustAccumulated` when the library reports signals.
    function _updateGlobalA() internal {
        PoolAccrualLib.GlobalEmit memory ge =
            PoolAccrualLib.updateGlobal(poolAState, MAX_DELTA_TIME, PRECISION, DUST_TOLERANCE);
        if (ge.insufficient) emit InsufficientBudget(Pool.A, ge.shortfall, block.timestamp);
        if (ge.dust) emit DustAccumulated(Pool.A, ge.dustWei, block.timestamp);
    }

    /// @dev Advances Pool B global reward index.
    function _updateGlobalB() internal {
        PoolAccrualLib.GlobalEmit memory ge =
            PoolAccrualLib.updateGlobal(poolBState, MAX_DELTA_TIME, PRECISION, DUST_TOLERANCE);
        if (ge.insufficient) emit InsufficientBudget(Pool.B, ge.shortfall, block.timestamp);
        if (ge.dust) emit DustAccumulated(Pool.B, ge.dustWei, block.timestamp);
    }

    /// @dev Settles Pool A rewards for `user` against `accRewardPerToken`.
    /// @param user Address whose `userInfoA` row is updated.
    function _settleUserA(address user) internal {
        PoolAccrualLib.settleUser(poolAState, userInfoA, user, PRECISION);
    }

    /// @dev Settles Pool B rewards for `user` against `accRewardPerToken`.
    /// @param user Address whose `userInfoB` row is updated.
    function _settleUserB(address user) internal {
        PoolAccrualLib.settleUser(poolBState, userInfoB, user, PRECISION);
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

    /// @dev Reverts if TokenB invariant is violated (emits diagnostic event first).
    function _assertInvariantB() internal {
        (uint256 actual, uint256 required) = _invariantBActualRequired();
        if (actual + DUST_TOLERANCE < required) {
            emit InvariantViolated(actual, required, block.timestamp);
            revert InvariantViolation(actual, required);
        }
    }

    /// @dev Same invariant check as `_assertInvariantB` but never reverts (emergency paths).
    function _checkInvariantBNoRevert() internal {
        (uint256 actual, uint256 required) = _invariantBActualRequired();
        if (actual + DUST_TOLERANCE < required) {
            emit InvariantViolated(actual, required, block.timestamp);
        }
    }
}
