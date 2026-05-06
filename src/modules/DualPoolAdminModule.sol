// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pool, PoolInfo, PendingOp} from "../StakeTypes.sol";
import {PoolAccrualLib} from "../libraries/PoolAccrualLib.sol";
import {NotifyRewardLib} from "../libraries/NotifyRewardLib.sol";
import {StakingAdminLib} from "../libraries/StakingAdminLib.sol";
import {StakingExecutionErrors} from "../StakingExecutionErrors.sol";
import {DualPoolStorageLayout} from "./DualPoolStorageLayout.sol";

/// @title DualPoolAdminModule
/// @notice Delegate **admin/operator** execution module (`notify`, parameter setters, pause, shutdown, recovery); invoked only via `DualPoolStaking` `delegatecall`.
/// @dev Mirrors `DualPoolUserModule` storage discipline: never treat this contract’s standalone storage as authoritative.
/// @custom:delegatecall Mutations apply to the core’s storage at `address(this)` during the parent `delegatecall`.
contract DualPoolAdminModule is DualPoolStorageLayout {
    using SafeERC20 for IERC20;

    /// @notice TokenB backing invariant failed after an admin mutation (same selector family as the user module for tooling consistency).
    /// @param actual Observed backing (`balance + badDebt`).
    /// @param required Liability sum from pool state.
    error InvariantViolation(uint256 actual, uint256 required);
    /// @notice Fee bps inputs exceed `MAX_WITHDRAW_BP`, `MAX_MIDTERM_BP`, or `MAX_EARLY_EXIT_PENALTY_BP`.
    error InvalidFeeBps();
    /// @notice `minEarlyExitAmountB` would be inconsistent with `penaltyfeeBP` / `newPenaltyFeeBP` constraints.
    /// @param minRequired Derived minimum allowed value.
    /// @param currentValue Value that failed the check.
    error MinEarlyExitAmountTooLow(uint256 minRequired, uint256 currentValue);
    /// @notice Reward notify and several other admin paths are blocked while emergency mode is active.
    error EmergencyModeActive();
    /// @notice Attempted `minClaimAmount` above `MAX_MIN_CLAIM_AMOUNT`.
    error ExceedsMaxMinClaimAmount();
    /// @notice `lockDuration` update outside allowed bounds.
    error InvalidLockDuration();
    /// @notice `activateShutdown` called when shutdown already set.
    error ShutdownActive();
    /// @notice `executeUnpause` before `unpauseAt`.
    /// @param unpauseAt Required earliest unpause time.
    /// @param currentTime Current timestamp.
    error UnpauseCooldownPending(uint256 unpauseAt, uint256 currentTime);
    /// @notice `executeCancelTimelock` referenced a missing `opId`.
    /// @param opId Unknown timelock key.
    error TimelockNotFound(bytes32 opId);

    event RewardNotified(Pool indexed pool, uint256 amount, uint256 duration, uint256 rate);
    event BudgetRebalanced(Pool indexed from, Pool indexed to, uint256 amount, uint256 timestamp);
    event FeesClaimed(address indexed recipient, uint256 amount, uint256 timestamp);
    event FeesUpdated(uint256 penaltyBP, uint256 withdrawBP, uint256 midTermBP, uint256 at);
    event InvariantViolated(uint256 actual, uint256 required, uint256 timestamp);
    event InsufficientBudget(Pool pool, uint256 shortfall, uint256 timestamp);
    event DustAccumulated(Pool pool, uint256 dustAmount, uint256 timestamp);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient, uint256 timestamp);
    event ForfeitedRecipientUpdated(address indexed oldRecipient, address indexed newRecipient, uint256 timestamp);
    event TVLCapUpdated(Pool indexed pool, uint256 oldCap, uint256 newCap, uint256 timestamp);
    event MinStakeAmountUpdated(Pool indexed pool, uint256 oldValue, uint256 newValue, uint256 timestamp);
    event RewardDurationUpdated(Pool indexed pool, uint256 oldValue, uint256 newValue, uint256 timestamp);
    event MinClaimAmountUpdated(uint256 oldValue, uint256 newValue, uint256 timestamp);
    event LockDurationUpdated(uint256 oldDuration, uint256 newDuration, uint256 timestamp);
    event BadDebtResolved(Pool indexed pool, uint256 amount, uint256 timestamp);
    event BadDebtResolvedTotal(uint256 totalRepaid, uint256 timestamp);
    event TokenRecovered(address indexed token, uint256 amount, address indexed to);
    event ShutdownActivated(address indexed by, uint256 at);
    event ProtocolShutdownComplete(uint256 at);
    event EmergencyModeActivated(address indexed by, uint256 at);
    event Paused(address indexed by, uint256 at);
    event Unpaused(address indexed by, uint256 at);
    event TimelockCancelled(bytes32 indexed opId, bytes32 indexed paramsHash, uint256 cancelledAt);

    /// @notice Funds Pool A rewards from `sender` and schedules emissions (`notifyRewardAmountA` delegate path).
    /// @param sender Payer pulled via `rewardToken.transferFrom` (the core’s `msg.sender` in the parent call).
    /// @param amount Requested pull amount; actual uses balance delta after transfer.
    /// @param duration New emission schedule length; bounded by `MIN_REWARD_RATE_DURATION` and `MAX_DURATION`.
    function executeNotifyRewardAmountA(address sender, uint256 amount, uint256 duration) external {
        if (emergencyMode) revert EmergencyModeActive();
        if (shutdown) revert StakingExecutionErrors.ShutdownModeActive();
        if (amount == 0) revert StakingExecutionErrors.ZeroAmount();
        if (duration < MIN_REWARD_RATE_DURATION || duration > MAX_DURATION) {
            revert StakingExecutionErrors.InvalidRewardDuration();
        }

        _updateGlobalA();
        uint256 balBefore = rewardToken.balanceOf(address(this));
        rewardToken.safeTransferFrom(sender, address(this), amount);
        uint256 actualAmount = rewardToken.balanceOf(address(this)) - balBefore;
        NotifyRewardLib.NotifyResult memory nr = NotifyRewardLib.applyNotifyAccounting(
            poolAState,
            actualAmount,
            duration,
            MAX_APR_BP,
            BASIS_POINTS,
            SECONDS_PER_YEAR,
            maxTotalSupplyBForRewardRateCap
        );
        _assertInvariantB();
        emit RewardNotified(Pool.A, nr.actualAmount, duration, nr.newRate);
    }

    /// @notice Funds Pool B rewards from `sender` and schedules emissions (`notifyRewardAmountB` delegate path).
    /// @param sender Payer pulled via `rewardToken.transferFrom`.
    /// @param amount Requested pull amount; actual uses balance delta after transfer.
    /// @param duration New emission schedule length; bounded by min/max duration constants.
    function executeNotifyRewardAmountB(address sender, uint256 amount, uint256 duration) external {
        if (emergencyMode) revert EmergencyModeActive();
        if (shutdown) revert StakingExecutionErrors.ShutdownModeActive();
        if (amount == 0) revert StakingExecutionErrors.ZeroAmount();
        if (duration < MIN_REWARD_RATE_DURATION || duration > MAX_DURATION) {
            revert StakingExecutionErrors.InvalidRewardDuration();
        }

        _updateGlobalB();
        uint256 balBefore = rewardToken.balanceOf(address(this));
        rewardToken.safeTransferFrom(sender, address(this), amount);
        uint256 actualAmount = rewardToken.balanceOf(address(this)) - balBefore;
        NotifyRewardLib.NotifyResult memory nr = NotifyRewardLib.applyNotifyAccounting(
            poolBState,
            actualAmount,
            duration,
            MAX_APR_BP,
            BASIS_POINTS,
            SECONDS_PER_YEAR,
            maxTotalSupplyBForRewardRateCap
        );
        _assertInvariantB();
        emit RewardNotified(Pool.B, nr.actualAmount, duration, nr.newRate);
    }

    /// @notice Rebalances reward budgets between pools (`rebalanceBudgets` delegate path).
    /// @param from Source pool for `availableRewards` debit.
    /// @param to Destination pool for credit.
    /// @param amount Reward token wei to move.
    function executeRebalanceBudgets(Pool from, Pool to, uint256 amount) external {
        StakingAdminLib.executeRebalanceBudgets(poolAState, poolBState, from, to, amount);
        _assertInvariantB();
        emit BudgetRebalanced(from, to, amount, block.timestamp);
    }

    /// @notice Sweeps Pool B fees to `feeRecipient` (`claimFees` delegate path).
    function executeClaimFees() external {
        uint256 fees = unclaimedFeesB;
        StakingAdminLib.executeClaimFees(rewardToken, feeRecipient, fees);
        unclaimedFeesB = 0;
        emit FeesClaimed(feeRecipient, fees, block.timestamp);
    }

    /// @notice Updates Pool B withdrawal-related fees (`setFees` delegate path).
    /// @param newWithdrawFeeBP Withdraw fee bps for short holding durations.
    /// @param newMidTermFeeBP Mid-term fee bps.
    /// @param newPenaltyFeeBP Early-exit penalty bps on principal.
    function executeSetFees(uint256 newWithdrawFeeBP, uint256 newMidTermFeeBP, uint256 newPenaltyFeeBP) external {
        if (
            newWithdrawFeeBP > MAX_WITHDRAW_BP || newMidTermFeeBP > MAX_MIDTERM_BP
                || newPenaltyFeeBP > MAX_EARLY_EXIT_PENALTY_BP
        ) {
            revert InvalidFeeBps();
        }
        if (newPenaltyFeeBP > 0) {
            uint256 minRequired = (BASIS_POINTS + newPenaltyFeeBP - 1) / newPenaltyFeeBP;
            if (minEarlyExitAmountB < minRequired) revert MinEarlyExitAmountTooLow(minRequired, minEarlyExitAmountB);
        }
        withdrawFeeBP = newWithdrawFeeBP;
        midTermFeeBP = newMidTermFeeBP;
        penaltyfeeBP = newPenaltyFeeBP;
        emit FeesUpdated(newPenaltyFeeBP, newWithdrawFeeBP, newMidTermFeeBP, block.timestamp);
    }

    /// @notice Sets `feeRecipient` (`setFeeRecipient` delegate path).
    /// @param newRecipient New fee sweep recipient; must not be zero.
    function executeSetFeeRecipient(address newRecipient) external {
        if (newRecipient == address(0)) revert StakingExecutionErrors.ZeroAddress();
        address oldRecipient = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(oldRecipient, newRecipient, block.timestamp);
    }

    /// @notice Sets `forfeitedRecipient` (`setForfeitedRecipient` delegate path).
    /// @param newRecipient New forfeited-flow recipient; must not be zero.
    function executeSetForfeitedRecipient(address newRecipient) external {
        if (newRecipient == address(0)) revert StakingExecutionErrors.ZeroAddress();
        address oldRecipient = forfeitedRecipient;
        forfeitedRecipient = newRecipient;
        emit ForfeitedRecipientUpdated(oldRecipient, newRecipient, block.timestamp);
    }

    /// @notice Sets `minEarlyExitAmountB` (`setMinEarlyExitAmountB` delegate path).
    /// @param newMin New minimum principal for early exits; cross-checked vs `penaltyfeeBP`.
    function executeSetMinEarlyExitAmountB(uint256 newMin) external {
        if (newMin == 0) revert StakingExecutionErrors.ZeroAmount();
        if (penaltyfeeBP > 0) {
            uint256 minRequired = (BASIS_POINTS + penaltyfeeBP - 1) / penaltyfeeBP;
            if (newMin < minRequired) revert MinEarlyExitAmountTooLow(minRequired, newMin);
        }
        minEarlyExitAmountB = newMin;
    }

    /// @notice Sets `maxTransferFeeBP` (`setMaxTransferFeeBP` delegate path).
    /// @param newMaxTransferFeeBP New FOT tolerance ceiling; must be `<= BASIS_POINTS`.
    function executeSetMaxTransferFeeBP(uint256 newMaxTransferFeeBP) external {
        if (newMaxTransferFeeBP > BASIS_POINTS) revert StakingExecutionErrors.InvalidMaxTransferFeeBp();
        maxTransferFeeBP = newMaxTransferFeeBP;
    }

    /// @notice Sets Pool A `tvlCap` (`setTVLCapA` delegate path).
    /// @param cap New TVL cap (`0` uncapped).
    function executeSetTVLCapA(uint256 cap) external {
        _applyTVLCap(poolAState, Pool.A, cap);
    }

    /// @notice Sets Pool B `tvlCap` (`setTVLCapB` delegate path).
    /// @param cap New TVL cap (`0` uncapped).
    function executeSetTVLCapB(uint256 cap) external {
        _applyTVLCap(poolBState, Pool.B, cap);
    }

    /// @notice Sets Pool A `minStakeAmount` (`setMinStakeAmountA` delegate path).
    /// @param amount New per-tx minimum stake in TokenA wei.
    function executeSetMinStakeAmountA(uint256 amount) external {
        _applyMinStake(poolAState, Pool.A, amount);
    }

    /// @notice Sets Pool B `minStakeAmount` (`setMinStakeAmountB` delegate path).
    /// @param amount New per-tx minimum stake in TokenB wei.
    function executeSetMinStakeAmountB(uint256 amount) external {
        _applyMinStake(poolBState, Pool.B, amount);
    }

    /// @notice Sets Pool A `rewardDuration` (`setRewardDurationA` delegate path).
    /// @param duration Default notify duration parameter for Pool A (seconds).
    function executeSetRewardDurationA(uint256 duration) external {
        _applyRewardDuration(poolAState, Pool.A, duration);
    }

    /// @notice Sets Pool B `rewardDuration` (`setRewardDurationB` delegate path).
    /// @param duration Default notify duration parameter for Pool B (seconds).
    function executeSetRewardDurationB(uint256 duration) external {
        _applyRewardDuration(poolBState, Pool.B, duration);
    }

    /// @notice Sets `minClaimAmount` (`setMinClaimAmount` delegate path).
    /// @param amount New minimum claim threshold in reward-token wei.
    function executeSetMinClaimAmount(uint256 amount) external {
        if (amount > MAX_MIN_CLAIM_AMOUNT) revert ExceedsMaxMinClaimAmount();
        uint256 oldAmount = minClaimAmount;
        minClaimAmount = amount;
        emit MinClaimAmountUpdated(oldAmount, amount, block.timestamp);
    }

    /// @notice Sets Pool B `lockDuration` (`setLockDuration` delegate path).
    /// @param newLockDuration Rolling lock seconds applied on stake/compound.
    function executeSetLockDuration(uint256 newLockDuration) external {
        if (newLockDuration > MAX_LOCK_DURATION || newLockDuration == 0) revert InvalidLockDuration();
        uint256 oldLockDuration = lockDuration;
        lockDuration = newLockDuration;
        emit LockDurationUpdated(oldLockDuration, newLockDuration, block.timestamp);
    }

    /// @notice Repays bad debt from `sender` (`resolveBadDebt` delegate path).
    /// @param sender Payer whose reward tokens are pulled with `transferFrom`.
    /// @param amount Requested repayment amount (actual credited via balance delta in library).
    function executeResolveBadDebt(address sender, uint256 amount) external {
        StakingAdminLib.ResolveBadDebtParams memory params =
            StakingAdminLib.ResolveBadDebtParams({rewardToken: rewardToken, from: sender, amount: amount});
        StakingAdminLib.ResolveBadDebtResult memory res =
            StakingAdminLib.executeResolveBadDebt(poolAState, poolBState, params);
        if (res.repayA > 0) emit BadDebtResolved(Pool.A, res.repayA, block.timestamp);
        if (res.repayB > 0) emit BadDebtResolved(Pool.B, res.repayB, block.timestamp);
        if (res.repayA + res.repayB > 0) emit BadDebtResolvedTotal(res.repayA + res.repayB, block.timestamp);
        _assertInvariantB();
    }

    /// @notice Recovers stray ERC20 (`recoverToken` delegate path).
    /// @param token Token address to sweep when provably non-liability.
    /// @param to Recipient.
    /// @param amount Amount to transfer if permitted.
    function executeRecoverToken(address token, address to, uint256 amount) external {
        StakingAdminLib.RecoverTokenParams memory params = StakingAdminLib.RecoverTokenParams({
            rewardToken: rewardToken, unclaimedFeesB: unclaimedFeesB, token: IERC20(token), to: to, amount: amount
        });
        StakingAdminLib.executeRecoverToken(poolAState, poolBState, params);
        emit TokenRecovered(token, amount, to);
    }

    /// @notice Activates shutdown (`activateShutdown` delegate path).
    /// @param sender Address recorded on `ShutdownActivated` (core passes `msg.sender`).
    function executeActivateShutdown(address sender) external {
        if (!emergencyMode) revert StakingExecutionErrors.NotInEmergency();
        if (shutdown) revert ShutdownActive();
        shutdown = true;
        shutdownAt = block.timestamp;
        emit ShutdownActivated(sender, block.timestamp);
    }

    /// @notice Finalizes shutdown (`forceShutdownFinalize` delegate path).
    function executeForceShutdownFinalize() external {
        uint256 uf = unclaimedFeesB;
        StakingAdminLib.ForceShutdownFinalizeParams memory params = StakingAdminLib.ForceShutdownFinalizeParams({
            shutdown: shutdown,
            rewardToken: rewardToken,
            feeRecipient: feeRecipient,
            shutdownAt: shutdownAt,
            gracePeriod: 365 days,
            deadlockBypass: SHUTDOWN_DEADLOCK_BYPASS,
            unclaimedFeesAtCall: uf
        });
        StakingAdminLib.executeForceShutdownFinalize(poolAState, poolBState, params);
        unclaimedFeesB = 0;
        emit ProtocolShutdownComplete(block.timestamp);
    }

    /// @notice Enables emergency mode (`enableEmergencyMode` delegate path).
    /// @param sender Address recorded on `EmergencyModeActivated`.
    function executeEnableEmergencyMode(address sender) external {
        if (emergencyMode) revert EmergencyModeActive();
        emergencyMode = true;
        emergencyActivatedAt = block.timestamp;
        emit EmergencyModeActivated(sender, block.timestamp);
    }

    /// @notice Grants or revokes `ADMIN_ROLE` (`setAdmin` delegate path).
    /// @param newAdmin Target account.
    /// @param enabled True to grant, false to revoke.
    function executeSetAdmin(address newAdmin, bool enabled) external {
        if (newAdmin == address(0)) revert StakingExecutionErrors.ZeroAddress();
        if (enabled) _grantRole(ADMIN_ROLE, newAdmin);
        else _revokeRole(ADMIN_ROLE, newAdmin);
    }

    /// @notice Grants or revokes `OPERATOR_ROLE` (`setOperator` delegate path).
    /// @param newOperator Target account.
    /// @param enabled True to grant, false to revoke.
    function executeSetOperator(address newOperator, bool enabled) external {
        if (newOperator == address(0)) revert StakingExecutionErrors.ZeroAddress();
        if (enabled) _grantRole(OPERATOR_ROLE, newOperator);
        else _revokeRole(OPERATOR_ROLE, newOperator);
    }

    /// @notice Pauses the core (`pause` delegate path).
    /// @param sender Address recorded on `Paused` after global accrual snapshots.
    function executePause(address sender) external {
        _updateGlobalA();
        _updateGlobalB();
        pausedAt = block.timestamp;
        unpauseAt = block.timestamp + UNPAUSE_COOLDOWN;
        _pause();
        emit Paused(sender, block.timestamp);
    }

    /// @notice Unpauses the core (`unpause` delegate path).
    /// @param sender Address recorded on `Unpaused` after schedule extension.
    function executeUnpause(address sender) external {
        if (block.timestamp < unpauseAt) {
            revert UnpauseCooldownPending(unpauseAt, block.timestamp);
        }
        uint256 delta = block.timestamp - pausedAt;
        if (poolAState.periodFinish > 0) poolAState.periodFinish += delta;
        if (poolBState.periodFinish > 0) poolBState.periodFinish += delta;
        poolAState.lastUpdateTime = block.timestamp;
        poolBState.lastUpdateTime = block.timestamp;
        pausedAt = 0;
        unpauseAt = 0;
        _unpause();
        emit Unpaused(sender, block.timestamp);
    }

    /// @notice Clears `pendingOps[opId]` (`cancelTimelock` delegate path).
    /// @param opId Timelock key to delete.
    function executeCancelTimelock(bytes32 opId) external {
        PendingOp memory op = pendingOps[opId];
        if (op.executeAfter == 0) {
            revert TimelockNotFound(opId);
        }
        delete pendingOps[opId];
        emit TimelockCancelled(opId, op.paramsHash, block.timestamp);
    }

    /// @dev Writes `tvlCap` and emits `TVLCapUpdated`.
    /// @param pool Pool storage to update.
    /// @param p Pool enum for the event payload.
    /// @param cap New cap value (`0` means uncapped for stake libs).
    function _applyTVLCap(PoolInfo storage pool, Pool p, uint256 cap) internal {
        uint256 oldCap = pool.tvlCap;
        pool.tvlCap = cap;
        emit TVLCapUpdated(p, oldCap, cap, block.timestamp);
    }

    /// @dev Writes `minStakeAmount` and emits `MinStakeAmountUpdated`.
    /// @param pool Pool storage to update.
    /// @param p Pool enum for the event payload.
    /// @param amount New minimum stake per transaction.
    function _applyMinStake(PoolInfo storage pool, Pool p, uint256 amount) internal {
        uint256 oldAmount = pool.minStakeAmount;
        pool.minStakeAmount = amount;
        emit MinStakeAmountUpdated(p, oldAmount, amount, block.timestamp);
    }

    /// @dev Writes `rewardDuration` and emits `RewardDurationUpdated`.
    /// @param pool Pool storage to update.
    /// @param p Pool enum for the event payload.
    /// @param duration New default notify duration (seconds).
    function _applyRewardDuration(PoolInfo storage pool, Pool p, uint256 duration) internal {
        uint256 oldDuration = pool.rewardDuration;
        pool.rewardDuration = duration;
        emit RewardDurationUpdated(p, oldDuration, duration, block.timestamp);
    }

    /// @dev Advances Pool A global reward index.
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

    /// @dev Invariant liability leg (part 1): principal plus promised pending rewards.
    /// @return Sum of Pool B staked principal and both pools’ `totalPending`.
    function _invariantRequiredPart1() internal view returns (uint256) {
        return poolBState.totalStaked + poolAState.totalPending + poolBState.totalPending;
    }

    /// @dev Invariant liability leg (part 2): unscheduled budgets, fees, and dust buckets.
    /// @return Sum of both pools’ `availableRewards`, `unclaimedFeesB`, and `dust`.
    function _invariantRequiredPart2() internal view returns (uint256) {
        return
            poolAState.availableRewards + poolBState.availableRewards + unclaimedFeesB + poolAState.dust
                + poolBState.dust;
    }

    /// @dev TokenB balance + bad debt vs required liability sum.
    /// @return actual TokenB balance plus both pools’ `badDebt`.
    /// @return required `_invariantRequiredPart1() + _invariantRequiredPart2()`.
    function _invariantBActualRequired() internal view returns (uint256 actual, uint256 required) {
        uint256 balanceB = rewardToken.balanceOf(address(this));
        actual = balanceB + poolAState.badDebt + poolBState.badDebt;
        required = _invariantRequiredPart1() + _invariantRequiredPart2();
    }

    /// @dev Reverts if TokenB invariant fails (emits `InvariantViolated` first).
    function _assertInvariantB() internal {
        (uint256 actual, uint256 required) = _invariantBActualRequired();
        if (actual + DUST_TOLERANCE < required) {
            emit InvariantViolated(actual, required, block.timestamp);
            revert InvariantViolation(actual, required);
        }
    }
}
