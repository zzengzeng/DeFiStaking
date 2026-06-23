// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title StakingExecutionErrors
/// @notice Shared custom errors for `DualPoolStaking`, delegate modules, and linked libraries (stable selectors across deploys).
/// @dev Declared as an `interface` (errors only) so `StakingExecutionErrors.ErrorName` resolves in solc and IDE language servers without inheritance.
interface StakingExecutionErrors {
    /// @notice A zero amount was passed where a positive amount is required.
    error ZeroAmount();
    /// @notice Token balance is below the requested transfer or operation amount.
    /// @param requested Amount the caller or logic required to be available.
    /// @param available Amount actually available on the relevant ledger or balance check.
    error InsufficientBalance(uint256 requested, uint256 available);
    /// @notice Pool pending rewards cannot cover the requested claim, settlement, or compound debit.
    /// @param requested Liability movement that failed the `totalPending` (or related) check.
    /// @param available Pending bucket (or combined pools) available at the time of the check.
    error InsufficientPending(uint256 requested, uint256 available);
    /// @notice Pool B stake timestamp invariant violated for the operation (e.g. unset reference time).
    error InvalidStakeTimestamp();
    /// @notice Early-exit principal is below the configured minimum bucket for Pool B.
    /// @param requested Withdrawal principal attempting early exit.
    /// @param minAmount Configured `minEarlyExitAmountB` threshold.
    error BelowMinEarlyExit(uint256 requested, uint256 minAmount);
    /// @notice Compound requested but user has no accrued rewards to roll into stake.
    error NoRewardsToCompound();
    /// @notice Claim requested but user has nothing claimable after settlement.
    error NoRewardsToClaim();
    /// @notice Claimable amount is below `minClaimAmount` (and shutdown / bad-debt bypasses do not apply).
    /// @param claimable User’s settled claimable amount before transfer.
    /// @param minAmount Configured global minimum claim threshold.
    error BelowMinClaim(uint256 claimable, uint256 minAmount);
    /// @notice Operation forbidden while either pool carries non-zero `badDebt`.
    error BadDebtExists();
    /// @notice Stake amount is below the pool `minStakeAmount` configuration.
    error BelowMinStake();
    /// @notice Stake would exceed the pool `tvlCap` when that cap is non-zero.
    error ExceedsTVLCap();
    /// @notice Actual tokens received from the user was zero (fee-on-transfer / deflationary edge case).
    error ZeroReceived();
    /// @notice Implied transfer fee from balance delta exceeds `maxTransferFeeBP` tolerance.
    error ExcessiveTransferFee();
    /// @notice Admin configured an invalid max transfer-fee basis-point ceiling (above `BASIS_POINTS`).
    error InvalidMaxTransferFeeBp();
    /// @notice Claim cooldown or Pool B unlock timestamp not yet satisfied.
    /// @param unlockTime Earliest allowed timestamp for the gated action.
    /// @param now_ Current `block.timestamp` when the check failed.
    error UnlockTimePending(uint256 unlockTime, uint256 now_);
    /// @notice Reward notify duration outside allowed bounds for the pool schedule.
    error InvalidRewardDuration();
    /// @notice Derived reward rate exceeds APR-derived maximum for the configured supply ceiling.
    /// @param rate Newly computed `rewardRate` that exceeded the cap.
    /// @param maxRate Maximum rate allowed by `NotifyRewardLib` cap math.
    error RewardRateExceedsMax(uint256 rate, uint256 maxRate);
    /// @notice `notifyReward*` merged budget (`actual + temporal leftover + stranded carry`) yields zero wei/sec rate under integer division — budget would sit in `availableRewards` without emission.
    /// @param mergedBudgetWei Sum merged into the rate numerator before dividing by `duration`.
    /// @param durationSeconds Scheduled emission duration (denominator).
    error ZeroRewardRate(uint256 mergedBudgetWei, uint256 durationSeconds);
    /// @notice Operation requires emergency mode but it is not active.
    error NotInEmergency();
    /// @notice Operation forbidden while shutdown mode is active.
    error ShutdownModeActive();
    /// @notice Withdraw amount is zero or user has no stake to withdraw.
    error NothingToWithdraw();
    /// @notice Bad-debt repayment called when no bad debt exists on either pool.
    error NoBadDebt();
    /// @notice Rebalance source and destination pool are the same enum value.
    error SamePool();
    /// @notice Rebalance would move budget reserved for the source pool’s active `rewardRate` schedule.
    /// @param requested Amount requested to move from the source pool.
    /// @param movable Maximum movable from `availableRewards` after reserving `remaining * rewardRate`.
    error RebalanceExceedsMovableBudget(uint256 requested, uint256 movable);
    /// @notice No accumulated Pool B fees available to sweep to `feeRecipient`.
    error NoFeesToClaim();
    /// @notice Fee recipient is unset or invalid for a fee sweep.
    error NoFeeRecipient();
    /// @notice Token recovery would break core accounting invariants (would touch liability or principal).
    error TokenRecoveryRestricted();
    /// @notice Zero address passed where a non-zero address is required.
    error ZeroAddress();
    /// @notice Recipient address is operationally unsafe for the requested payout / sweep path.
    /// @param recipient Address rejected by the operation.
    error InvalidRecipient(address recipient);
    /// @notice Module pointer must reference an address with deployed bytecode (EOA / empty / destroyed).
    /// @param module Address that failed `extcodesize` check.
    error NotAContract(address module);
    /// @notice Delegate module `execute*` was invoked on the module contract itself instead of via core `delegatecall`.
    error DirectModuleCall();
    /// @notice `pause()` is forbidden while shutdown is active (would block settlement exits).
    error PauseForbiddenDuringShutdown();
    /// @notice Operation requires shutdown but protocol is not in shutdown.
    error NotShutdown();
    /// @notice Shutdown finalization attempted before grace / time rules allow.
    error GracePeriodNotMet();
    /// @notice Shutdown finalization blocked because principal remains staked before deadlock bypass.
    error StillStaked();
    /// @notice `bookedUserRewards*` aggregate exceeded `totalPending` for a pool (accounting invariant broken).
    error BookedRewardsExceedPending();
    /// @notice `forceClaimAll` is only available during shutdown or when either pool carries `badDebt`.
    error ForceClaimAllNotAvailable();
    /// @notice `pause` / `unpause` could not advance `lastUpdateTime` to the pre-pause accrual ceiling within iteration budget.
    /// @param requiredLastUpdate Earliest `lastUpdateTime` that must be reached (`min(pausedAt, periodFinish)`).
    /// @param actualLastUpdate `lastUpdateTime` after bounded catch-up attempts.
    error PauseCatchUpIncomplete(uint256 requiredLastUpdate, uint256 actualLastUpdate);

    /// @notice `crankCatchUpPool` received an out-of-range pool id (only `0` = A, `1` = B).
    error InvalidPool(uint8 poolRaw);
}

