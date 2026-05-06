# DualPoolUserModule
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/c3cdaa9f3e5e324db578e81e0109756c6d9d8922/src/modules/DualPoolUserModule.sol)

**Inherits:**
[DualPoolStorageLayout](/src/modules/DualPoolStorageLayout.sol/abstract.DualPoolStorageLayout.md)

**Title:**
DualPoolUserModule

Delegate **user** execution module (stake/withdraw/claim/compound/emergency); storage is the core’s via `delegatecall`.

Only valid when invoked through `DualPoolStaking._delegateTo(userModule, ...)`; never call `execute*` directly on-chain unless you intend to run against this contract’s own (wrong) storage.

**Note:**
delegatecall: All mutating paths assume `address(this)` is the core; `msg.sender` in libraries is the **user** passed through calldata, not the EOA tx.origin.


## Functions
### executeStakeA

Pool A stake entrypoint for delegatecall from the core.


```solidity
function executeStakeA(address user, uint256 amount) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|Beneficiary passed from the core (expected `msg.sender` of the user tx).|
|`amount`|`uint256`|Requested `transferFrom` amount on TokenA (credited amount uses balance delta).|


### executeStakeB

Pool B stake entrypoint for delegatecall from the core.


```solidity
function executeStakeB(address user, uint256 amount) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|Beneficiary passed from the core.|
|`amount`|`uint256`|Requested `transferFrom` amount on TokenB.|


### executeWithdrawB

Pool B withdraw entrypoint for delegatecall from the core.


```solidity
function executeWithdrawB(address user, uint256 amount) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|Account whose principal is reduced.|
|`amount`|`uint256`|Principal to withdraw before fees/penalties.|


### executeWithdrawA

Pool A withdraw entrypoint for delegatecall from the core.


```solidity
function executeWithdrawA(address user, uint256 amount) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|Account whose TokenA stake is reduced.|
|`amount`|`uint256`|Principal to return to `user`.|


### executeClaimA

Pool A reward claim entrypoint for delegatecall from the core.


```solidity
function executeClaimA(address user) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|Claimant receiving TokenB payout for Pool A accrued rewards.|


### executeClaimB

Pool B reward claim entrypoint for delegatecall from the core.


```solidity
function executeClaimB(address user) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|Claimant receiving TokenB payout for Pool B accrued rewards.|


### executeForceClaimAll

Force-claim-all entrypoint for delegatecall from the core.


```solidity
function executeForceClaimAll(address user) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|Claimant whose Pool A + B rewards are settled under shutdown / liquidity rules.|


### executeCompoundB

Compound-to-Pool-B entrypoint for delegatecall from the core.


```solidity
function executeCompoundB(address user) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|Beneficiary whose accrued rewards in both pools become Pool B principal.|


### executeEmergencyWithdrawA

Emergency Pool A principal exit for delegatecall from the core.


```solidity
function executeEmergencyWithdrawA(address user) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|Account whose Pool A position is force-closed to zero.|


### executeEmergencyWithdrawB

Emergency Pool B principal exit for delegatecall from the core.


```solidity
function executeEmergencyWithdrawB(address user) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|Account whose Pool B position is force-closed to zero.|


### _updateGlobalA

Advances Pool A global reward index; emits `InsufficientBudget` / `DustAccumulated` when the library reports signals.


```solidity
function _updateGlobalA() internal;
```

### _updateGlobalB

Advances Pool B global reward index.


```solidity
function _updateGlobalB() internal;
```

### _settleUserA

Settles Pool A rewards for `user` against `accRewardPerToken`.


```solidity
function _settleUserA(address user) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|Address whose `userInfoA` row is updated.|


### _settleUserB

Settles Pool B rewards for `user` against `accRewardPerToken`.


```solidity
function _settleUserB(address user) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|Address whose `userInfoB` row is updated.|


### _invariantRequiredPart1

Liability leg (part 1) for TokenB balance invariant: principal plus promised pending rewards.


```solidity
function _invariantRequiredPart1() internal view returns (uint256);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|Sum of Pool B staked principal and both pools’ `totalPending`.|


### _invariantRequiredPart2

Liability leg (part 2) for TokenB balance invariant: unscheduled budgets, fees, and dust buckets.


```solidity
function _invariantRequiredPart2() internal view returns (uint256);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|Sum of both pools’ `availableRewards`, `unclaimedFeesB`, and `dust`.|


### _invariantBActualRequired

Compares TokenB balance + bad debt vs required liability sum.


```solidity
function _invariantBActualRequired() internal view returns (uint256 actual, uint256 required);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`actual`|`uint256`|TokenB balance plus both pools’ `badDebt`.|
|`required`|`uint256`|`_invariantRequiredPart1() + _invariantRequiredPart2()`.|


### _assertInvariantB

Reverts if TokenB invariant is violated (emits diagnostic event first).


```solidity
function _assertInvariantB() internal;
```

### _checkInvariantBNoRevert

Same invariant check as `_assertInvariantB` but never reverts (emergency paths).


```solidity
function _checkInvariantBNoRevert() internal;
```

## Events
### Compounded

```solidity
event Compounded(
    address indexed user, uint256 amountA, uint256 amountB, uint256 newUserStakedB, uint256 newUnlockTimeB
);
```

### ForceClaimed

```solidity
event ForceClaimed(
    address indexed user, uint256 paidA, uint256 paidB, uint256 unpaidA, uint256 unpaidB, uint256 timestamp
);
```

### EmergencyWithdrawn

```solidity
event EmergencyWithdrawn(address indexed user, uint256 amount, Pool indexed pool, uint256 at);
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

### Staked

```solidity
event Staked(address indexed user, uint256 amount, uint256 unlockTime, Pool indexed pool);
```

### Withdrawn

```solidity
event Withdrawn(address indexed user, uint256 amount, uint256 feeOrPenalty, bool early, Pool indexed pool);
```

### Claimed

```solidity
event Claimed(address indexed user, uint256 amountA, uint256 amountB, uint256 timestamp);
```

## Errors
### EmergencyModeActive
Stake / compound / certain withdraw paths are blocked while emergency mode is active (see each `execute*` guard).


```solidity
error EmergencyModeActive();
```

### InvariantViolation
TokenB balance + `badDebt` no longer covers recorded liabilities within `DUST_TOLERANCE`.


```solidity
error InvariantViolation(uint256 actual, uint256 required);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`actual`|`uint256`|Observed backing side of the invariant (`balance + badDebt`).|
|`required`|`uint256`|Required liability sum from pool state fields.|

