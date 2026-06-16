# DualPoolStakingAdmin
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/699d0d97f5ced33dab5ac0c4d8ce25e0620ec92b/src/DualPoolStakingAdmin.sol)

**Title:**
DualPoolStakingAdmin

Governance facade: forwards timelocked calls to the `DualPoolStaking` core.

Grant this contract `ADMIN_ROLE` and `DEFAULT_ADMIN_ROLE` on the core. Parameter changes must be sent by
`timelockGovernance` (typically 48h `TimelockController`); module / role super-paths must be sent by
`timelockSuper` (typically 72h). Do **not** route `pause` / `notifyReward*` here—those remain `OPERATOR_ROLE`
on the core (zero delay).


## State Variables
### core
Immutable reference to the staking core.


```solidity
DualPoolStaking public immutable core
```


### timelockGovernance
Timelock allowed to call parameter / treasury / protocol admin functions (e.g. 48h delay).


```solidity
address public immutable timelockGovernance
```


### timelockSuper
Timelock allowed to call super paths (`setUserModule`, `setAdminModule`, `setAdmin`, `setOperator`).


```solidity
address public immutable timelockSuper
```


## Functions
### onlyGovernanceTimelock


```solidity
modifier onlyGovernanceTimelock() ;
```

### onlySuperTimelock


```solidity
modifier onlySuperTimelock() ;
```

### constructor

Deploys the facade and pins core + timelock addresses.


```solidity
constructor(address coreAddress, address timelockGovernance_, address timelockSuper_) ;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`coreAddress`|`address`|Deployed `DualPoolStaking` address.|
|`timelockGovernance_`|`address`|Timelock for routine governance (e.g. 48h `minDelay`).|
|`timelockSuper_`|`address`|Timelock for super paths (e.g. 72h `minDelay`).|


### rebalanceBudgets


```solidity
function rebalanceBudgets(Pool from, Pool to, uint256 amount) external onlyGovernanceTimelock;
```

### claimFees


```solidity
function claimFees() external onlyGovernanceTimelock;
```

### setFeeRecipient


```solidity
function setFeeRecipient(address newRecipient) external onlyGovernanceTimelock;
```

### setForfeitedRecipient


```solidity
function setForfeitedRecipient(address newRecipient) external onlyGovernanceTimelock;
```

### setMinEarlyExitAmountB


```solidity
function setMinEarlyExitAmountB(uint256 newMin) external onlyGovernanceTimelock;
```

### setMaxTransferFeeBP


```solidity
function setMaxTransferFeeBP(uint256 newMaxTransferFeeBP) external onlyGovernanceTimelock;
```

### setTVLCapA


```solidity
function setTVLCapA(uint256 cap) external onlyGovernanceTimelock;
```

### setTVLCapB


```solidity
function setTVLCapB(uint256 cap) external onlyGovernanceTimelock;
```

### setMinStakeAmountA


```solidity
function setMinStakeAmountA(uint256 amount) external onlyGovernanceTimelock;
```

### setMinStakeAmountB


```solidity
function setMinStakeAmountB(uint256 amount) external onlyGovernanceTimelock;
```

### setRewardDurationA


```solidity
function setRewardDurationA(uint256 duration) external onlyGovernanceTimelock;
```

### setRewardDurationB


```solidity
function setRewardDurationB(uint256 duration) external onlyGovernanceTimelock;
```

### setMinClaimAmount


```solidity
function setMinClaimAmount(uint256 amount) external onlyGovernanceTimelock;
```

### setFees


```solidity
function setFees(uint256 newWithdrawFeeBP, uint256 newMidTermFeeBP, uint256 newPenaltyFeeBP)
    external
    onlyGovernanceTimelock;
```

### setLockDuration


```solidity
function setLockDuration(uint256 newLockDuration) external onlyGovernanceTimelock;
```

### resolveBadDebt


```solidity
function resolveBadDebt(uint256 amount) external onlyGovernanceTimelock;
```

### recoverToken


```solidity
function recoverToken(address token, address to, uint256 amount) external onlyGovernanceTimelock;
```

### activateShutdown


```solidity
function activateShutdown() external onlyGovernanceTimelock;
```

### forceShutdownFinalize


```solidity
function forceShutdownFinalize() external onlyGovernanceTimelock;
```

### setUserModule


```solidity
function setUserModule(address newModule) external onlySuperTimelock;
```

### setAdminModule


```solidity
function setAdminModule(address newModule) external onlySuperTimelock;
```

### setAdmin


```solidity
function setAdmin(address newAdmin, bool enabled) external onlySuperTimelock;
```

### setOperator


```solidity
function setOperator(address newOperator, bool enabled) external onlySuperTimelock;
```

### unpause


```solidity
function unpause() external onlyGovernanceTimelock;
```

## Errors
### ZeroCore

```solidity
error ZeroCore();
```

### ZeroTimelockGovernance

```solidity
error ZeroTimelockGovernance();
```

### ZeroTimelockSuper

```solidity
error ZeroTimelockSuper();
```

### UnauthorizedGovernanceTimelock

```solidity
error UnauthorizedGovernanceTimelock(address caller);
```

### UnauthorizedSuperTimelock

```solidity
error UnauthorizedSuperTimelock(address caller);
```

