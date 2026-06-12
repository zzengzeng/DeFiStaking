// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pool, PoolInfo, PendingOp} from "../StakeTypes.sol";
import {PoolAccrualLib} from "../libraries/PoolAccrualLib.sol";
import {NotifyRewardLib} from "../libraries/NotifyRewardLib.sol";
import {RewardReanchorLib} from "../libraries/RewardReanchorLib.sol";
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
    event FeesUpdated(uint256 penaltyBP, uint256 withdrawBP, uint256 midTermBP, uint256 timestamp);
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
    event ShutdownActivated(address indexed by, uint256 timestamp);
    event ProtocolShutdownComplete(uint256 timestamp);
    event EmergencyModeActivated(address indexed by, uint256 timestamp);
    event Paused(address indexed by, uint256 timestamp);
    event Unpaused(address indexed by, uint256 timestamp);
    event TimelockCancelled(bytes32 indexed opId, bytes32 indexed paramsHash, uint256 cancelledAt);

    /// @notice Funds Pool A rewards from `sender` and schedules emissions (`notifyRewardAmountA` delegate path).
    /// @dev Reverts `ExcessiveTransferFee` if balance delta vs `amount` exceeds `maxTransferFeeBP` (same rule as `stakeB` on TokenB).
    /// @param sender Payer pulled via `rewardToken.transferFrom` (the core’s `msg.sender` in the parent call).
    /// @param amount Requested pull amount; actual uses balance delta after transfer.
    /// @param duration Emission length in seconds, or `0` to use `poolAState.rewardDuration` (must be pre-set in bounds).
    function executeNotifyRewardAmountA(address sender, uint256 amount, uint256 duration) external {
        if (emergencyMode) revert EmergencyModeActive();
        if (shutdown) revert StakingExecutionErrors.ShutdownModeActive();
        if (amount == 0) revert StakingExecutionErrors.ZeroAmount();
        if (maxTransferFeeBP > BASIS_POINTS) revert StakingExecutionErrors.InvalidMaxTransferFeeBp();
        uint256 effectiveDuration = _effectiveNotifyDuration(poolAState, duration);

        _updateGlobalA();
        uint256 balBefore = rewardToken.balanceOf(address(this));
        rewardToken.safeTransferFrom(sender, address(this), amount);
        uint256 actualAmount = rewardToken.balanceOf(address(this)) - balBefore;
        if (actualAmount * BASIS_POINTS < amount * (BASIS_POINTS - maxTransferFeeBP)) {
            revert StakingExecutionErrors.ExcessiveTransferFee();
        }
        NotifyRewardLib.NotifyResult memory nr = NotifyRewardLib.applyNotifyAccounting(
            poolAState,
            actualAmount,
            effectiveDuration,
            MAX_APR_BP,
            BASIS_POINTS,
            SECONDS_PER_YEAR,
            maxTotalSupplyBForRewardRateCap
        );
        _assertInvariantB();
        emit RewardNotified(Pool.A, nr.actualAmount, effectiveDuration, nr.newRate);
    }

    /// @notice Funds Pool B rewards from `sender` and schedules emissions (`notifyRewardAmountB` delegate path).
    /// @dev Same FOT / `maxTransferFeeBP` slippage check as `executeNotifyRewardAmountA` and `stakeB`.
    /// @param sender Payer pulled via `rewardToken.transferFrom`.
    /// @param amount Requested pull amount; actual uses balance delta after transfer.
    /// @param duration Emission length in seconds, or `0` to use `poolBState.rewardDuration` (must be pre-set in bounds).
    function executeNotifyRewardAmountB(address sender, uint256 amount, uint256 duration) external {
        if (emergencyMode) revert EmergencyModeActive();
        if (shutdown) revert StakingExecutionErrors.ShutdownModeActive();
        if (amount == 0) revert StakingExecutionErrors.ZeroAmount();
        if (maxTransferFeeBP > BASIS_POINTS) revert StakingExecutionErrors.InvalidMaxTransferFeeBp();
        uint256 effectiveDuration = _effectiveNotifyDuration(poolBState, duration);

        _updateGlobalB();
        uint256 balBefore = rewardToken.balanceOf(address(this));
        rewardToken.safeTransferFrom(sender, address(this), amount);
        uint256 actualAmount = rewardToken.balanceOf(address(this)) - balBefore;
        if (actualAmount * BASIS_POINTS < amount * (BASIS_POINTS - maxTransferFeeBP)) {
            revert StakingExecutionErrors.ExcessiveTransferFee();
        }
        NotifyRewardLib.NotifyResult memory nr = NotifyRewardLib.applyNotifyAccounting(
            poolBState,
            actualAmount,
            effectiveDuration,
            MAX_APR_BP,
            BASIS_POINTS,
            SECONDS_PER_YEAR,
            maxTotalSupplyBForRewardRateCap
        );
        _assertInvariantB();
        emit RewardNotified(Pool.B, nr.actualAmount, effectiveDuration, nr.newRate);
    }

    /// @notice Rebalances reward budgets between pools (`rebalanceBudgets` delegate path).
    /// @dev Runs `_updateGlobal*` first so movable budget excludes `remaining * rewardRate` still owed by the source schedule.
    /// @param from Source pool for `availableRewards` debit.
    /// @param to Destination pool for credit.
    /// @param amount Reward token wei to move.
    function executeRebalanceBudgets(Pool from, Pool to, uint256 amount) external {
        _updateGlobalA();
        _updateGlobalB();
        StakingAdminLib.executeRebalanceBudgets(poolAState, poolBState, from, to, amount, _reanchorCaps());
        _assertInvariantB();
        emit BudgetRebalanced(from, to, amount, block.timestamp);
    }

    /// @notice Sweeps Pool B fees to `feeRecipient` (`claimFees` delegate path).
    /// @dev CEI: clears `unclaimedFeesB` and emits before `rewardToken` transfer so state does not depend on recipient hooks.
    function executeClaimFees() external {
        uint256 fees = unclaimedFeesB;
        if (fees == 0) {
            revert StakingExecutionErrors.NoFeesToClaim();
        }
        if (feeRecipient == address(0)) {
            revert StakingExecutionErrors.NoFeeRecipient();
        }
        unclaimedFeesB = 0;
        emit FeesClaimed(feeRecipient, fees, block.timestamp);
        rewardToken.safeTransfer(feeRecipient, fees);
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
    /// @param duration Default notify duration when `notifyRewardAmountA(..., 0)` is used; `0` clears the default; otherwise must be within `[MIN_REWARD_RATE_DURATION, MAX_DURATION]`.
    function executeSetRewardDurationA(uint256 duration) external {
        _applyRewardDuration(poolAState, Pool.A, duration);
    }

    /// @notice Sets Pool B `rewardDuration` (`setRewardDurationB` delegate path).
    /// @param duration Default notify duration when `notifyRewardAmountB(..., 0)` is used; `0` clears; otherwise in `[MIN_REWARD_RATE_DURATION, MAX_DURATION]`.
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
            StakingAdminLib.executeResolveBadDebt(poolAState, poolBState, params, _reanchorCaps());
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
        _updateGlobalA();
        _updateGlobalB();
        uint256 uf = unclaimedFeesB;
        StakingAdminLib.ForceShutdownFinalizeParams memory params = StakingAdminLib.ForceShutdownFinalizeParams({
            shutdown: shutdown,
            rewardToken: rewardToken,
            feeRecipient: feeRecipient,
            shutdownAt: shutdownAt,
            gracePeriod: 365 days,
            deadlockBypass: SHUTDOWN_DEADLOCK_BYPASS,
            unclaimedFeesAtCall: uf,
            bookedUserRewardsA: bookedUserRewardsA,
            bookedUserRewardsB: bookedUserRewardsB
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
        _catchUpGlobalA();
        _catchUpGlobalB();
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
        _requirePauseCatchUpComplete(poolAState, pausedAt);
        _requirePauseCatchUpComplete(poolBState, pausedAt);
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
        if (duration != 0 && (duration < MIN_REWARD_RATE_DURATION || duration > MAX_DURATION)) {
            revert StakingExecutionErrors.InvalidRewardDuration();
        }
        uint256 oldDuration = pool.rewardDuration;
        pool.rewardDuration = duration;
        emit RewardDurationUpdated(p, oldDuration, duration, block.timestamp);
    }

    /// @dev `duration == 0` selects `pool.rewardDuration` for operator convenience; must fall within notify bounds.
    function _effectiveNotifyDuration(PoolInfo storage pool, uint256 duration) private view returns (uint256 t) {
        t = duration == 0 ? pool.rewardDuration : duration;
        if (t < MIN_REWARD_RATE_DURATION || t > MAX_DURATION) {
            revert StakingExecutionErrors.InvalidRewardDuration();
        }
    }

    /// @dev Accrual ceiling for pause catch-up: rewards only through `min(now, periodFinish)`.
    function _accrualCatchUpCap(PoolInfo storage pool) private view returns (uint256 cap) {
        cap = block.timestamp;
        if (pool.periodFinish < cap) cap = pool.periodFinish;
    }

    /// @dev Loops `updateGlobal` until `lastUpdateTime` reaches `_accrualCatchUpCap` (bounded by `MAX_CATCHUP_ITERATIONS`).
    function _catchUpGlobal(PoolInfo storage pool, Pool p) private {
        uint256 cap = _accrualCatchUpCap(pool);
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
        if (pool.lastUpdateTime < cap) {
            revert StakingExecutionErrors.PauseCatchUpIncomplete(cap, pool.lastUpdateTime);
        }
    }

    function _catchUpGlobalA() internal {
        _catchUpGlobal(poolAState, Pool.A);
    }

    function _catchUpGlobalB() internal {
        _catchUpGlobal(poolBState, Pool.B);
    }

    /// @dev Belt-and-suspenders guard for legacy paused state before `unpause` schedule shift.
    function _requirePauseCatchUpComplete(PoolInfo storage pool, uint256 pausedAt_) private view {
        if (pool.periodFinish == 0) return;
        uint256 cap = pausedAt_ < pool.periodFinish ? pausedAt_ : pool.periodFinish;
        if (pool.lastUpdateTime < cap) {
            revert StakingExecutionErrors.PauseCatchUpIncomplete(cap, pool.lastUpdateTime);
        }
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
