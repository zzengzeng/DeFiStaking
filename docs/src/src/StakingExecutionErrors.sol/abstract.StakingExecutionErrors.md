# StakingExecutionErrors
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/c3cdaa9f3e5e324db578e81e0109756c6d9d8922/src/StakingExecutionErrors.sol)

**Title:**
StakingExecutionErrors

Shared custom errors for `DualPoolStaking`, `DualPoolStakingOld`, delegate modules, and linked libraries (stable selectors across deploys).

Implemented as an `abstract contract` (not `interface`) so tooling below Solidity 0.8.19 still surfaces `error` members reliably when inherited.


## Errors
### ZeroAmount
A zero amount was passed where a positive amount is required.


```solidity
error ZeroAmount();
```

### InsufficientBalance
Token balance is below the requested transfer or operation amount.


```solidity
error InsufficientBalance(uint256 requested, uint256 available);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`requested`|`uint256`|Amount the caller or logic required to be available.|
|`available`|`uint256`|Amount actually available on the relevant ledger or balance check.|

### InsufficientPending
Pool pending rewards cannot cover the requested claim, settlement, or compound debit.


```solidity
error InsufficientPending(uint256 requested, uint256 available);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`requested`|`uint256`|Liability movement that failed the `totalPending` (or related) check.|
|`available`|`uint256`|Pending bucket (or combined pools) available at the time of the check.|

### InvalidStakeTimestamp
Pool B stake timestamp invariant violated for the operation (e.g. unset reference time).


```solidity
error InvalidStakeTimestamp();
```

### BelowMinEarlyExit
Early-exit principal is below the configured minimum bucket for Pool B.


```solidity
error BelowMinEarlyExit(uint256 requested, uint256 minAmount);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`requested`|`uint256`|Withdrawal principal attempting early exit.|
|`minAmount`|`uint256`|Configured `minEarlyExitAmountB` threshold.|

### NoRewardsToCompound
Compound requested but user has no accrued rewards to roll into stake.


```solidity
error NoRewardsToCompound();
```

### NoRewardsToClaim
Claim requested but user has nothing claimable after settlement.


```solidity
error NoRewardsToClaim();
```

### BelowMinClaim
Claimable amount is below `minClaimAmount` (and shutdown / bad-debt bypasses do not apply).


```solidity
error BelowMinClaim(uint256 claimable, uint256 minAmount);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`claimable`|`uint256`|User’s settled claimable amount before transfer.|
|`minAmount`|`uint256`|Configured global minimum claim threshold.|

### BadDebtExists
Operation forbidden while either pool carries non-zero `badDebt`.


```solidity
error BadDebtExists();
```

### BelowMinStake
Stake amount is below the pool `minStakeAmount` configuration.


```solidity
error BelowMinStake();
```

### ExceedsTVLCap
Stake would exceed the pool `tvlCap` when that cap is non-zero.


```solidity
error ExceedsTVLCap();
```

### ZeroReceived
Actual tokens received from the user was zero (fee-on-transfer / deflationary edge case).


```solidity
error ZeroReceived();
```

### ExcessiveTransferFee
Implied transfer fee from balance delta exceeds `maxTransferFeeBP` tolerance.


```solidity
error ExcessiveTransferFee();
```

### InvalidMaxTransferFeeBp
Admin configured an invalid max transfer-fee basis-point ceiling (above `BASIS_POINTS`).


```solidity
error InvalidMaxTransferFeeBp();
```

### UnlockTimePending
Claim cooldown or Pool B unlock timestamp not yet satisfied.


```solidity
error UnlockTimePending(uint256 unlockTime, uint256 now_);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`unlockTime`|`uint256`|Earliest allowed timestamp for the gated action.|
|`now_`|`uint256`|Current `block.timestamp` when the check failed.|

### InvalidRewardDuration
Reward notify duration outside allowed bounds for the pool schedule.


```solidity
error InvalidRewardDuration();
```

### RewardRateExceedsMax
Derived reward rate exceeds APR-derived maximum for the configured supply ceiling.


```solidity
error RewardRateExceedsMax(uint256 rate, uint256 maxRate);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`rate`|`uint256`|Newly computed `rewardRate` that exceeded the cap.|
|`maxRate`|`uint256`|Maximum rate allowed by `NotifyRewardLib` cap math.|

### NotInEmergency
Operation requires emergency mode but it is not active.


```solidity
error NotInEmergency();
```

### ShutdownModeActive
Operation forbidden while shutdown mode is active.


```solidity
error ShutdownModeActive();
```

### NothingToWithdraw
Withdraw amount is zero or user has no stake to withdraw.


```solidity
error NothingToWithdraw();
```

### NoBadDebt
Bad-debt repayment called when no bad debt exists on either pool.


```solidity
error NoBadDebt();
```

### SamePool
Rebalance source and destination pool are the same enum value.


```solidity
error SamePool();
```

### NoFeesToClaim
No accumulated Pool B fees available to sweep to `feeRecipient`.


```solidity
error NoFeesToClaim();
```

### NoFeeRecipient
Fee recipient is unset or invalid for a fee sweep.


```solidity
error NoFeeRecipient();
```

### TokenRecoveryRestricted
Token recovery would break core accounting invariants (would touch liability or principal).


```solidity
error TokenRecoveryRestricted();
```

### ZeroAddress
Zero address passed where a non-zero address is required.


```solidity
error ZeroAddress();
```

### NotShutdown
Operation requires shutdown but protocol is not in shutdown.


```solidity
error NotShutdown();
```

### GracePeriodNotMet
Shutdown finalization attempted before grace / time rules allow.


```solidity
error GracePeriodNotMet();
```

### StillStaked
Shutdown finalization blocked because principal remains staked before deadlock bypass.


```solidity
error StillStaked();
```

