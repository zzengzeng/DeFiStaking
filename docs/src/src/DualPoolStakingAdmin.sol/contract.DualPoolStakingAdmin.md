# DualPoolStakingAdmin
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/c3cdaa9f3e5e324db578e81e0109756c6d9d8922/src/DualPoolStakingAdmin.sol)

**Inherits:**
Ownable

**Title:**
DualPoolStakingAdmin

Governance facade: forwards `onlyOwner` calls to the `DualPoolStaking` core for timelocked parameter changes.

Grant this contract `ADMIN_ROLE` on the core. Set `owner` to OpenZeppelin `TimelockController` so changes go through `schedule` → `execute`. Do **not** route `pause` / `notifyReward*` here—those remain `OPERATOR_ROLE` on the core (zero delay) to avoid coupling hot ops to the timelock delay.

**Note:**
forwarding: Each external function is a thin `onlyOwner` wrapper around the same-named `DualPoolStaking` entrypoint.


## State Variables
### core
Immutable reference to the staking core.


```solidity
DualPoolStaking public immutable core
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
|`coreAddress`|`address`|Deployed `DualPoolStaking` address; must not be zero.|


### rebalanceBudgets

Rebalances reward budget between pools on the core.


```solidity
function rebalanceBudgets(Pool from, Pool to, uint256 amount) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`from`|`Pool`|Source pool.|
|`to`|`Pool`|Destination pool.|
|`amount`|`uint256`|Reward token amount to move.|


### claimFees

Sweeps accumulated Pool B fees on the core to the configured recipient.


```solidity
function claimFees() external onlyOwner;
```

### cancelTimelock

Clears a `pendingOps` timelock row on the core, if present.


```solidity
function cancelTimelock(bytes32 opId) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`opId`|`bytes32`|Operation identifier.|


### setFeeRecipient

Updates Pool B withdrawal fee recipient on the core.


```solidity
function setFeeRecipient(address newRecipient) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newRecipient`|`address`|New recipient; must not be zero address.|


### setForfeitedRecipient

Updates forfeited / penalty-flow recipient on the core.


```solidity
function setForfeitedRecipient(address newRecipient) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newRecipient`|`address`|New recipient; must not be zero address.|


### setMinEarlyExitAmountB

Sets minimum early-exit principal bucket for Pool B on the core.


```solidity
function setMinEarlyExitAmountB(uint256 newMin) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newMin`|`uint256`|New minimum amount.|


### setMaxTransferFeeBP

Sets max tolerated FOT transfer-fee slippage (basis points) on the core.


```solidity
function setMaxTransferFeeBP(uint256 newMaxTransferFeeBP) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newMaxTransferFeeBP`|`uint256`|New ceiling.|


### setTVLCapA

Sets Pool A TVL cap on the core.


```solidity
function setTVLCapA(uint256 cap) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`cap`|`uint256`|New cap value.|


### setTVLCapB

Sets Pool B TVL cap on the core.


```solidity
function setTVLCapB(uint256 cap) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`cap`|`uint256`|New cap value.|


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

Sets Pool A default reward duration config on the core.


```solidity
function setRewardDurationA(uint256 duration) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`duration`|`uint256`|Duration in seconds.|


### setRewardDurationB

Sets Pool B default reward duration config on the core.


```solidity
function setRewardDurationB(uint256 duration) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`duration`|`uint256`|Duration in seconds.|


### setMinClaimAmount

Sets minimum claimable reward threshold on the core.


```solidity
function setMinClaimAmount(uint256 amount) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`amount`|`uint256`|New threshold.|


### setFees

Updates Pool B fee parameters (basis points) on the core.


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
|`newLockDuration`|`uint256`|Lock duration in seconds.|


### resolveBadDebt

Caller funds bad-debt repayment on the core.


```solidity
function resolveBadDebt(uint256 amount) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`amount`|`uint256`|Repayment amount.|


### recoverToken

Recovers ERC20 tokens on the core when accounting rules allow.


```solidity
function recoverToken(address token, address to, uint256 amount) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|Token to sweep.|
|`to`|`address`|Recipient.|
|`amount`|`uint256`|Amount to recover.|


### activateShutdown

Activates shutdown on the core (requires emergency mode per core rules).


```solidity
function activateShutdown() external onlyOwner;
```

### forceShutdownFinalize

Finalizes protocol shutdown on the core.


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

Unpauses the core after cooldown (extends reward schedules per core logic).


```solidity
function unpause() external onlyOwner;
```

