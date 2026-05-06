# DualPoolAdminModule
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/c3cdaa9f3e5e324db578e81e0109756c6d9d8922/src/modules/DualPoolAdminModule.sol)

**Inherits:**
[DualPoolStorageLayout](/src/modules/DualPoolStorageLayout.sol/abstract.DualPoolStorageLayout.md)

**Title:**
DualPoolAdminModule

Delegate **admin/operator** execution module (`notify`, parameter setters, pause, shutdown, recovery); invoked only via `DualPoolStaking` `delegatecall`.

Mirrors `DualPoolUserModule` storage discipline: never treat this contract’s standalone storage as authoritative.

**Note:**
delegatecall: Mutations apply to the core’s storage at `address(this)` during the parent `delegatecall`.


## Functions
### executeNotifyRewardAmountA

Funds Pool A rewards from `sender` and schedules emissions (`notifyRewardAmountA` delegate path).


```solidity
function executeNotifyRewardAmountA(address sender, uint256 amount, uint256 duration) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`sender`|`address`|Payer pulled via `rewardToken.transferFrom` (the core’s `msg.sender` in the parent call).|
|`amount`|`uint256`|Requested pull amount; actual uses balance delta after transfer.|
|`duration`|`uint256`|New emission schedule length; bounded by `MIN_REWARD_RATE_DURATION` and `MAX_DURATION`.|


### executeNotifyRewardAmountB

Funds Pool B rewards from `sender` and schedules emissions (`notifyRewardAmountB` delegate path).


```solidity
function executeNotifyRewardAmountB(address sender, uint256 amount, uint256 duration) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`sender`|`address`|Payer pulled via `rewardToken.transferFrom`.|
|`amount`|`uint256`|Requested pull amount; actual uses balance delta after transfer.|
|`duration`|`uint256`|New emission schedule length; bounded by min/max duration constants.|


### executeRebalanceBudgets

Rebalances reward budgets between pools (`rebalanceBudgets` delegate path).


```solidity
function executeRebalanceBudgets(Pool from, Pool to, uint256 amount) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`from`|`Pool`|Source pool for `availableRewards` debit.|
|`to`|`Pool`|Destination pool for credit.|
|`amount`|`uint256`|Reward token wei to move.|


### executeClaimFees

Sweeps Pool B fees to `feeRecipient` (`claimFees` delegate path).


```solidity
function executeClaimFees() external;
```

### executeSetFees

Updates Pool B withdrawal-related fees (`setFees` delegate path).


```solidity
function executeSetFees(uint256 newWithdrawFeeBP, uint256 newMidTermFeeBP, uint256 newPenaltyFeeBP) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newWithdrawFeeBP`|`uint256`|Withdraw fee bps for short holding durations.|
|`newMidTermFeeBP`|`uint256`|Mid-term fee bps.|
|`newPenaltyFeeBP`|`uint256`|Early-exit penalty bps on principal.|


### executeSetFeeRecipient

Sets `feeRecipient` (`setFeeRecipient` delegate path).


```solidity
function executeSetFeeRecipient(address newRecipient) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newRecipient`|`address`|New fee sweep recipient; must not be zero.|


### executeSetForfeitedRecipient

Sets `forfeitedRecipient` (`setForfeitedRecipient` delegate path).


```solidity
function executeSetForfeitedRecipient(address newRecipient) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newRecipient`|`address`|New forfeited-flow recipient; must not be zero.|


### executeSetMinEarlyExitAmountB

Sets `minEarlyExitAmountB` (`setMinEarlyExitAmountB` delegate path).


```solidity
function executeSetMinEarlyExitAmountB(uint256 newMin) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newMin`|`uint256`|New minimum principal for early exits; cross-checked vs `penaltyfeeBP`.|


### executeSetMaxTransferFeeBP

Sets `maxTransferFeeBP` (`setMaxTransferFeeBP` delegate path).


```solidity
function executeSetMaxTransferFeeBP(uint256 newMaxTransferFeeBP) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newMaxTransferFeeBP`|`uint256`|New FOT tolerance ceiling; must be `<= BASIS_POINTS`.|


### executeSetTVLCapA

Sets Pool A `tvlCap` (`setTVLCapA` delegate path).


```solidity
function executeSetTVLCapA(uint256 cap) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`cap`|`uint256`|New TVL cap (`0` uncapped).|


### executeSetTVLCapB

Sets Pool B `tvlCap` (`setTVLCapB` delegate path).


```solidity
function executeSetTVLCapB(uint256 cap) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`cap`|`uint256`|New TVL cap (`0` uncapped).|


### executeSetMinStakeAmountA

Sets Pool A `minStakeAmount` (`setMinStakeAmountA` delegate path).


```solidity
function executeSetMinStakeAmountA(uint256 amount) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`amount`|`uint256`|New per-tx minimum stake in TokenA wei.|


### executeSetMinStakeAmountB

Sets Pool B `minStakeAmount` (`setMinStakeAmountB` delegate path).


```solidity
function executeSetMinStakeAmountB(uint256 amount) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`amount`|`uint256`|New per-tx minimum stake in TokenB wei.|


### executeSetRewardDurationA

Sets Pool A `rewardDuration` (`setRewardDurationA` delegate path).


```solidity
function executeSetRewardDurationA(uint256 duration) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`duration`|`uint256`|Default notify duration parameter for Pool A (seconds).|


### executeSetRewardDurationB

Sets Pool B `rewardDuration` (`setRewardDurationB` delegate path).


```solidity
function executeSetRewardDurationB(uint256 duration) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`duration`|`uint256`|Default notify duration parameter for Pool B (seconds).|


### executeSetMinClaimAmount

Sets `minClaimAmount` (`setMinClaimAmount` delegate path).


```solidity
function executeSetMinClaimAmount(uint256 amount) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`amount`|`uint256`|New minimum claim threshold in reward-token wei.|


### executeSetLockDuration

Sets Pool B `lockDuration` (`setLockDuration` delegate path).


```solidity
function executeSetLockDuration(uint256 newLockDuration) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newLockDuration`|`uint256`|Rolling lock seconds applied on stake/compound.|


### executeResolveBadDebt

Repays bad debt from `sender` (`resolveBadDebt` delegate path).


```solidity
function executeResolveBadDebt(address sender, uint256 amount) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`sender`|`address`|Payer whose reward tokens are pulled with `transferFrom`.|
|`amount`|`uint256`|Requested repayment amount (actual credited via balance delta in library).|


### executeRecoverToken

Recovers stray ERC20 (`recoverToken` delegate path).


```solidity
function executeRecoverToken(address token, address to, uint256 amount) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|Token address to sweep when provably non-liability.|
|`to`|`address`|Recipient.|
|`amount`|`uint256`|Amount to transfer if permitted.|


### executeActivateShutdown

Activates shutdown (`activateShutdown` delegate path).


```solidity
function executeActivateShutdown(address sender) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`sender`|`address`|Address recorded on `ShutdownActivated` (core passes `msg.sender`).|


### executeForceShutdownFinalize

Finalizes shutdown (`forceShutdownFinalize` delegate path).


```solidity
function executeForceShutdownFinalize() external;
```

### executeEnableEmergencyMode

Enables emergency mode (`enableEmergencyMode` delegate path).


```solidity
function executeEnableEmergencyMode(address sender) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`sender`|`address`|Address recorded on `EmergencyModeActivated`.|


### executeSetAdmin

Grants or revokes `ADMIN_ROLE` (`setAdmin` delegate path).


```solidity
function executeSetAdmin(address newAdmin, bool enabled) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newAdmin`|`address`|Target account.|
|`enabled`|`bool`|True to grant, false to revoke.|


### executeSetOperator

Grants or revokes `OPERATOR_ROLE` (`setOperator` delegate path).


```solidity
function executeSetOperator(address newOperator, bool enabled) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newOperator`|`address`|Target account.|
|`enabled`|`bool`|True to grant, false to revoke.|


### executePause

Pauses the core (`pause` delegate path).


```solidity
function executePause(address sender) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`sender`|`address`|Address recorded on `Paused` after global accrual snapshots.|


### executeUnpause

Unpauses the core (`unpause` delegate path).


```solidity
function executeUnpause(address sender) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`sender`|`address`|Address recorded on `Unpaused` after schedule extension.|


### executeCancelTimelock

Clears `pendingOps[opId]` (`cancelTimelock` delegate path).


```solidity
function executeCancelTimelock(bytes32 opId) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`opId`|`bytes32`|Timelock key to delete.|


### _applyTVLCap

Writes `tvlCap` and emits `TVLCapUpdated`.


```solidity
function _applyTVLCap(PoolInfo storage pool, Pool p, uint256 cap) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`pool`|`PoolInfo`|Pool storage to update.|
|`p`|`Pool`|Pool enum for the event payload.|
|`cap`|`uint256`|New cap value (`0` means uncapped for stake libs).|


### _applyMinStake

Writes `minStakeAmount` and emits `MinStakeAmountUpdated`.


```solidity
function _applyMinStake(PoolInfo storage pool, Pool p, uint256 amount) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`pool`|`PoolInfo`|Pool storage to update.|
|`p`|`Pool`|Pool enum for the event payload.|
|`amount`|`uint256`|New minimum stake per transaction.|


### _applyRewardDuration

Writes `rewardDuration` and emits `RewardDurationUpdated`.


```solidity
function _applyRewardDuration(PoolInfo storage pool, Pool p, uint256 duration) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`pool`|`PoolInfo`|Pool storage to update.|
|`p`|`Pool`|Pool enum for the event payload.|
|`duration`|`uint256`|New default notify duration (seconds).|


### _updateGlobalA

Advances Pool A global reward index.


```solidity
function _updateGlobalA() internal;
```

### _updateGlobalB

Advances Pool B global reward index.


```solidity
function _updateGlobalB() internal;
```

### _invariantRequiredPart1

Invariant liability leg (part 1): principal plus promised pending rewards.


```solidity
function _invariantRequiredPart1() internal view returns (uint256);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|Sum of Pool B staked principal and both pools’ `totalPending`.|


### _invariantRequiredPart2

Invariant liability leg (part 2): unscheduled budgets, fees, and dust buckets.


```solidity
function _invariantRequiredPart2() internal view returns (uint256);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|Sum of both pools’ `availableRewards`, `unclaimedFeesB`, and `dust`.|


### _invariantBActualRequired

TokenB balance + bad debt vs required liability sum.


```solidity
function _invariantBActualRequired() internal view returns (uint256 actual, uint256 required);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`actual`|`uint256`|TokenB balance plus both pools’ `badDebt`.|
|`required`|`uint256`|`_invariantRequiredPart1() + _invariantRequiredPart2()`.|


### _assertInvariantB

Reverts if TokenB invariant fails (emits `InvariantViolated` first).


```solidity
function _assertInvariantB() internal;
```

## Events
### RewardNotified

```solidity
event RewardNotified(Pool indexed pool, uint256 amount, uint256 duration, uint256 rate);
```

### BudgetRebalanced

```solidity
event BudgetRebalanced(Pool indexed from, Pool indexed to, uint256 amount, uint256 timestamp);
```

### FeesClaimed

```solidity
event FeesClaimed(address indexed recipient, uint256 amount, uint256 timestamp);
```

### FeesUpdated

```solidity
event FeesUpdated(uint256 penaltyBP, uint256 withdrawBP, uint256 midTermBP, uint256 at);
```

### InvariantViolated

```solidity
event InvariantViolated(uint256 actual, uint256 required, uint256 timestamp);
```

### InsufficientBudget

```solidity
event InsufficientBudget(Pool pool, uint256 shortfall, uint256 timestamp);
```

### DustAccumulated

```solidity
event DustAccumulated(Pool pool, uint256 dustAmount, uint256 timestamp);
```

### FeeRecipientUpdated

```solidity
event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient, uint256 timestamp);
```

### ForfeitedRecipientUpdated

```solidity
event ForfeitedRecipientUpdated(address indexed oldRecipient, address indexed newRecipient, uint256 timestamp);
```

### TVLCapUpdated

```solidity
event TVLCapUpdated(Pool indexed pool, uint256 oldCap, uint256 newCap, uint256 timestamp);
```

### MinStakeAmountUpdated

```solidity
event MinStakeAmountUpdated(Pool indexed pool, uint256 oldValue, uint256 newValue, uint256 timestamp);
```

### RewardDurationUpdated

```solidity
event RewardDurationUpdated(Pool indexed pool, uint256 oldValue, uint256 newValue, uint256 timestamp);
```

### MinClaimAmountUpdated

```solidity
event MinClaimAmountUpdated(uint256 oldValue, uint256 newValue, uint256 timestamp);
```

### LockDurationUpdated

```solidity
event LockDurationUpdated(uint256 oldDuration, uint256 newDuration, uint256 timestamp);
```

### BadDebtResolved

```solidity
event BadDebtResolved(Pool indexed pool, uint256 amount, uint256 timestamp);
```

### BadDebtResolvedTotal

```solidity
event BadDebtResolvedTotal(uint256 totalRepaid, uint256 timestamp);
```

### TokenRecovered

```solidity
event TokenRecovered(address indexed token, uint256 amount, address indexed to);
```

### ShutdownActivated

```solidity
event ShutdownActivated(address indexed by, uint256 at);
```

### ProtocolShutdownComplete

```solidity
event ProtocolShutdownComplete(uint256 at);
```

### EmergencyModeActivated

```solidity
event EmergencyModeActivated(address indexed by, uint256 at);
```

### Paused

```solidity
event Paused(address indexed by, uint256 at);
```

### Unpaused

```solidity
event Unpaused(address indexed by, uint256 at);
```

### TimelockCancelled

```solidity
event TimelockCancelled(bytes32 indexed opId, bytes32 indexed paramsHash, uint256 cancelledAt);
```

## Errors
### InvariantViolation
TokenB backing invariant failed after an admin mutation (same selector family as the user module for tooling consistency).


```solidity
error InvariantViolation(uint256 actual, uint256 required);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`actual`|`uint256`|Observed backing (`balance + badDebt`).|
|`required`|`uint256`|Liability sum from pool state.|

### InvalidFeeBps
Fee bps inputs exceed `MAX_WITHDRAW_BP`, `MAX_MIDTERM_BP`, or `MAX_EARLY_EXIT_PENALTY_BP`.


```solidity
error InvalidFeeBps();
```

### MinEarlyExitAmountTooLow
`minEarlyExitAmountB` would be inconsistent with `penaltyfeeBP` / `newPenaltyFeeBP` constraints.


```solidity
error MinEarlyExitAmountTooLow(uint256 minRequired, uint256 currentValue);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`minRequired`|`uint256`|Derived minimum allowed value.|
|`currentValue`|`uint256`|Value that failed the check.|

### EmergencyModeActive
Reward notify and several other admin paths are blocked while emergency mode is active.


```solidity
error EmergencyModeActive();
```

### ExceedsMaxMinClaimAmount
Attempted `minClaimAmount` above `MAX_MIN_CLAIM_AMOUNT`.


```solidity
error ExceedsMaxMinClaimAmount();
```

### InvalidLockDuration
`lockDuration` update outside allowed bounds.


```solidity
error InvalidLockDuration();
```

### ShutdownActive
`activateShutdown` called when shutdown already set.


```solidity
error ShutdownActive();
```

### UnpauseCooldownPending
`executeUnpause` before `unpauseAt`.


```solidity
error UnpauseCooldownPending(uint256 unpauseAt, uint256 currentTime);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`unpauseAt`|`uint256`|Required earliest unpause time.|
|`currentTime`|`uint256`|Current timestamp.|

### TimelockNotFound
`executeCancelTimelock` referenced a missing `opId`.


```solidity
error TimelockNotFound(bytes32 opId);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`opId`|`bytes32`|Unknown timelock key.|

