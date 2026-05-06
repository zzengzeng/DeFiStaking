# DualPoolStakingAdminOld
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/c3cdaa9f3e5e324db578e81e0109756c6d9d8922/src/DualPoolStakingAdminOld.sol)

**Inherits:**
Ownable

**Title:**
DualPoolStakingAdminOld

Governance facade: forwards `onlyOwner` calls to the `DualPoolStakingOld` core.

Mirrors `DualPoolStakingAdmin` / `DualPoolStaking`. After deployment, grant `ADMIN_ROLE` on the core to this contract (and wire `DEFAULT_ADMIN_ROLE` as needed), and set this contract’s `owner` to a `TimelockController` so parameter changes execute through a delay. Do not route `pause` / `notifyReward*` here—operators with `OPERATOR_ROLE` on the core should call those directly on the core to avoid coupling them to the timelock delay.

**Note:**
forwarding: Each external function is a thin `onlyOwner` wrapper around the same-named `DualPoolStakingOld` entrypoint.


## State Variables
### core
Immutable reference to the staking core.


```solidity
DualPoolStakingOld public immutable core
```


## Functions
### constructor

Deploys the facade and pins the core address.


```solidity
constructor(address coreAddress) Ownable(msg.sender);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`coreAddress`|`address`|Deployed `DualPoolStakingOld` address; must not be zero.|


### rebalanceBudgets

Rebalances reward budget between pools.


```solidity
function rebalanceBudgets(Pool from, Pool to, uint256 amount) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`from`|`Pool`|Source pool.|
|`to`|`Pool`|Destination pool.|
|`amount`|`uint256`|Reward token amount to move (smallest units).|


### claimFees

Sweeps accumulated Pool B fees to the current `feeRecipient` on the core.


```solidity
function claimFees() external onlyOwner;
```

### cancelTimelock

Clears an on-chain timelock row in the core’s `pendingOps` map, if present.


```solidity
function cancelTimelock(bytes32 opId) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`opId`|`bytes32`|Operation id key.|


### setFeeRecipient

Updates the Pool B withdrawal fee recipient on the core.


```solidity
function setFeeRecipient(address newRecipient) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newRecipient`|`address`|New recipient; must not be the zero address.|


### setForfeitedRecipient

Updates the forfeited / penalty-flow recipient on the core.


```solidity
function setForfeitedRecipient(address newRecipient) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newRecipient`|`address`|New recipient; must not be the zero address.|


### setMinEarlyExitAmountB

Sets the minimum early-exit principal bucket on Pool B (cross-checked vs penalty bps).


```solidity
function setMinEarlyExitAmountB(uint256 newMin) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newMin`|`uint256`|New minimum amount in token smallest units.|


### setMaxTransferFeeBP

Sets the max tolerated transfer-fee slippage (basis points) for FOT-style tokens.


```solidity
function setMaxTransferFeeBP(uint256 newMaxTransferFeeBP) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newMaxTransferFeeBP`|`uint256`|New cap; must not exceed the core’s `BASIS_POINTS`.|


### setTVLCapA

Sets Pool A TVL cap on the core.


```solidity
function setTVLCapA(uint256 cap) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`cap`|`uint256`|New cap; semantics follow the core (`PoolInfo.tvlCap`).|


### setTVLCapB

Sets Pool B TVL cap on the core.


```solidity
function setTVLCapB(uint256 cap) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`cap`|`uint256`|New cap.|


### setMinStakeAmountA

Sets Pool A minimum stake on the core.


```solidity
function setMinStakeAmountA(uint256 amount) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`amount`|`uint256`|New minimum stake.|


### setMinStakeAmountB

Sets Pool B minimum stake on the core.


```solidity
function setMinStakeAmountB(uint256 amount) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`amount`|`uint256`|New minimum stake.|


### setRewardDurationA

Sets Pool A default reward duration configuration on the core.


```solidity
function setRewardDurationA(uint256 duration) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`duration`|`uint256`|Duration in seconds.|


### setRewardDurationB

Sets Pool B default reward duration configuration on the core.


```solidity
function setRewardDurationB(uint256 duration) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`duration`|`uint256`|Duration in seconds.|


### setMinClaimAmount

Sets the minimum claimable reward threshold on the core.


```solidity
function setMinClaimAmount(uint256 amount) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`amount`|`uint256`|New threshold in reward-token smallest units.|


### setFees

Updates Pool B withdrawal-related fees (basis points) on the core.


```solidity
function setFees(uint256 newWithdrawFeeBP, uint256 newMidTermFeeBP, uint256 newPenaltyFeeBP) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newWithdrawFeeBP`|`uint256`|Withdrawal fee (bp).|
|`newMidTermFeeBP`|`uint256`|Mid-term fee (bp).|
|`newPenaltyFeeBP`|`uint256`|Early-exit penalty (bp).|


### setLockDuration

Updates Pool B lock duration on the core.


```solidity
function setLockDuration(uint256 newLockDuration) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newLockDuration`|`uint256`|Lock duration in seconds; must satisfy core bounds.|


### resolveBadDebt

Caller supplies reward tokens on the core to repay recorded bad debt.


```solidity
function resolveBadDebt(uint256 amount) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`amount`|`uint256`|Amount to apply toward repayment.|


### recoverToken

Recovers ERC20 tokens on the core when permitted by accounting rules.


```solidity
function recoverToken(address token, address to, uint256 amount) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|Token contract address.|
|`to`|`address`|Recipient.|
|`amount`|`uint256`|Amount to recover.|


### activateShutdown

Activates shutdown on the core while already in emergency mode.


```solidity
function activateShutdown() external onlyOwner;
```

### forceShutdownFinalize

Finalizes protocol shutdown on the core (see `StakingAdminLib.executeForceShutdownFinalize`).


```solidity
function forceShutdownFinalize() external onlyOwner;
```

### setAdmin

Grants or revokes `ADMIN_ROLE` on the core.


```solidity
function setAdmin(address newAdmin, bool enabled) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newAdmin`|`address`|Admin address.|
|`enabled`|`bool`|True to grant, false to revoke.|


### setOperator

Grants or revokes `OPERATOR_ROLE` on the core.


```solidity
function setOperator(address newOperator, bool enabled) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newOperator`|`address`|Operator address.|
|`enabled`|`bool`|True to grant, false to revoke.|


### unpause

Unpauses the core after the core’s unpause cooldown elapses.


```solidity
function unpause() external onlyOwner;
```

