# DualPoolStakingOld
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/c3cdaa9f3e5e324db578e81e0109756c6d9d8922/src/DualPoolStakingOld.sol)

**Inherits:**
Ownable, AccessControl, ReentrancyGuard, Pausable

**Title:**
DualPoolStakingOld

Dual-pool staking and rewards **reference core** (non-modular): user and admin flows execute inline via `_execute*` helpers instead of `delegatecall` modules.


- Inherits OpenZeppelin `Ownable`, `AccessControl`, `ReentrancyGuard`, and `Pausable`; their storage slots precede this contract’s state variables.
- **Behavior** matches `DualPoolStaking`, but this contract does **not** `delegatecall` into `DualPoolUserModule` / `DualPoolAdminModule`.
- **Storage layout is incompatible** with `DualPoolStaking`: after `mapping(bytes32 => PendingOp) pendingOps` this contract stores
`maxTotalSupplyBForRewardRateCap` immediately, with **no** `userModule` / `adminModule` address slots. Do not use as an upgrade target for an existing `DualPoolStaking` deployment.
- Heavy logic still lives in **libraries** (`PoolAccrualLib`, etc.), shared with the modular build, to separate “split modules” from “split libraries” when comparing.

**Notes:**
- roles: `DEFAULT_ADMIN_ROLE` manages the role graph; `ADMIN_ROLE` for privileged parameter and treasury paths; `OPERATOR_ROLE` for ops (pause, `notifyReward*`).

- comparison: Versus `DualPoolStaking`: external entrypoints call `_execute*` here instead of `_delegateTo(userModule|adminModule, ...)`.


## State Variables
### rewardToken
Reward token (same as Pool B staking token, TokenB); must be 18 decimals.


```solidity
IERC20 public rewardToken
```


### PRECISION

```solidity
uint256 public constant PRECISION = 1e18
```


### MAX_DELTA_TIME

```solidity
uint256 public constant MAX_DELTA_TIME = 30 days
```


### DUST_TOLERANCE

```solidity
uint256 public constant DUST_TOLERANCE = 10 wei
```


### BASIS_POINTS

```solidity
uint256 public constant BASIS_POINTS = 10_000
```


### MAX_EARLY_EXIT_PENALTY_BP

```solidity
uint256 public constant MAX_EARLY_EXIT_PENALTY_BP = 2000
```


### MAX_WITHDRAW_BP

```solidity
uint256 public constant MAX_WITHDRAW_BP = 500
```


### MAX_MIDTERM_BP

```solidity
uint256 public constant MAX_MIDTERM_BP = 500
```


### MAX_LOCK_DURATION

```solidity
uint256 public constant MAX_LOCK_DURATION = 90 days
```


### MAX_DURATION

```solidity
uint256 public constant MAX_DURATION = 365 days
```


### MIN_REWARD_RATE_DURATION

```solidity
uint256 public constant MIN_REWARD_RATE_DURATION = 1 days
```


### SECONDS_PER_YEAR

```solidity
uint256 public constant SECONDS_PER_YEAR = 31_536_000
```


### MAX_APR_BP

```solidity
uint256 public constant MAX_APR_BP = 20_000
```


### UNPAUSE_COOLDOWN

```solidity
uint256 public constant UNPAUSE_COOLDOWN = 1 days
```


### ADMIN_ROLE

```solidity
bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE")
```


### OPERATOR_ROLE

```solidity
bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE")
```


### OP_SET_FEES

```solidity
bytes32 public constant OP_SET_FEES = keccak256("SET_FEES")
```


### OP_SET_LOCK_DURATION

```solidity
bytes32 public constant OP_SET_LOCK_DURATION = keccak256("SET_LOCK_DURATION")
```


### OP_REBALANCE_BUDGETS

```solidity
bytes32 public constant OP_REBALANCE_BUDGETS = keccak256("REBALANCE_BUDGETS")
```


### OP_SET_TVL_CAP_A

```solidity
bytes32 public constant OP_SET_TVL_CAP_A = keccak256("SET_TVL_CAP_A")
```


### OP_SET_TVL_CAP_B

```solidity
bytes32 public constant OP_SET_TVL_CAP_B = keccak256("SET_TVL_CAP_B")
```


### OP_SET_MIN_STAKE_A

```solidity
bytes32 public constant OP_SET_MIN_STAKE_A = keccak256("SET_MIN_STAKE_A")
```


### OP_SET_MIN_STAKE_B

```solidity
bytes32 public constant OP_SET_MIN_STAKE_B = keccak256("SET_MIN_STAKE_B")
```


### OP_SET_REWARD_DURATION_A

```solidity
bytes32 public constant OP_SET_REWARD_DURATION_A = keccak256("SET_REWARD_DURATION_A")
```


### OP_SET_REWARD_DURATION_B

```solidity
bytes32 public constant OP_SET_REWARD_DURATION_B = keccak256("SET_REWARD_DURATION_B")
```


### OP_SET_MIN_CLAIM_AMOUNT

```solidity
bytes32 public constant OP_SET_MIN_CLAIM_AMOUNT = keccak256("SET_MIN_CLAIM_AMOUNT")
```


### OP_RECOVER_TOKEN

```solidity
bytes32 public constant OP_RECOVER_TOKEN = keccak256("RECOVER_TOKEN")
```


### OP_CLAIM_FEES

```solidity
bytes32 public constant OP_CLAIM_FEES = keccak256("CLAIM_FEES")
```


### OP_SHUTDOWN

```solidity
bytes32 public constant OP_SHUTDOWN = keccak256("SHUTDOWN")
```


### OP_RESOLVE_BAD_DEBT

```solidity
bytes32 public constant OP_RESOLVE_BAD_DEBT = keccak256("RESOLVE_BAD_DEBT")
```


### OP_NOTIFY_REWARD_A

```solidity
bytes32 public constant OP_NOTIFY_REWARD_A = keccak256("NOTIFY_REWARD_A")
```


### OP_NOTIFY_REWARD_B

```solidity
bytes32 public constant OP_NOTIFY_REWARD_B = keccak256("NOTIFY_REWARD_B")
```


### OP_SET_FEE_RECIPIENT

```solidity
bytes32 public constant OP_SET_FEE_RECIPIENT = keccak256("SET_FEE_RECIPIENT")
```


### OP_SET_FORFEITED_RECIPIENT

```solidity
bytes32 public constant OP_SET_FORFEITED_RECIPIENT = keccak256("SET_FORFEITED_RECIPIENT")
```


### OP_SET_MIN_EARLY_EXIT_B

```solidity
bytes32 public constant OP_SET_MIN_EARLY_EXIT_B = keccak256("SET_MIN_EARLY_EXIT_B")
```


### OP_SET_MAX_TRANSFER_FEE_BP

```solidity
bytes32 public constant OP_SET_MAX_TRANSFER_FEE_BP = keccak256("SET_MAX_TRANSFER_FEE_BP")
```


### lockDuration

```solidity
uint256 public lockDuration = 7 days
```


### claimCooldown

```solidity
uint256 public claimCooldown = 1 days
```


### SHUTDOWN_DEADLOCK_BYPASS

```solidity
uint256 public constant SHUTDOWN_DEADLOCK_BYPASS = 1095 days
```


### maxTransferFeeBP

```solidity
uint256 public maxTransferFeeBP = 1000
```


### penaltyfeeBP

```solidity
uint256 public penaltyfeeBP = 1000
```


### withdrawFeeBP

```solidity
uint256 public withdrawFeeBP = 100
```


### midTermFeeBP

```solidity
uint256 public midTermFeeBP = 50
```


### minEarlyExitAmountB

```solidity
uint256 public minEarlyExitAmountB = 10
```


### unclaimedFeesB

```solidity
uint256 public unclaimedFeesB
```


### emergencyActivatedAt

```solidity
uint256 public emergencyActivatedAt
```


### minClaimAmount

```solidity
uint256 public minClaimAmount
```


### MAX_MIN_CLAIM_AMOUNT

```solidity
uint256 public constant MAX_MIN_CLAIM_AMOUNT = 1e17 wei
```


### shutdownAt

```solidity
uint256 public shutdownAt
```


### pausedAt

```solidity
uint256 public pausedAt
```


### unpauseAt

```solidity
uint256 public unpauseAt
```


### feeRecipient

```solidity
address public feeRecipient
```


### forfeitedRecipient

```solidity
address public forfeitedRecipient
```


### ERC1820_REGISTRY_ADDR

```solidity
address private constant ERC1820_REGISTRY_ADDR = 0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24
```


### ERC777_RECIPIENT_HASH

```solidity
bytes32 private constant ERC777_RECIPIENT_HASH = keccak256("ERC777TokensRecipient")
```


### ERC777_SENDER_HASH

```solidity
bytes32 private constant ERC777_SENDER_HASH = keccak256("ERC777TokensSender")
```


### emergencyMode

```solidity
bool public emergencyMode
```


### shutdown

```solidity
bool public shutdown
```


### poolAState

```solidity
PoolInfo internal poolAState
```


### poolBState

```solidity
PoolInfo internal poolBState
```


### userInfoA

```solidity
mapping(address => UserInfo) public userInfoA
```


### userInfoB

```solidity
mapping(address => UserInfo) public userInfoB
```


### unlockTimeB

```solidity
mapping(address => uint256) public unlockTimeB
```


### stakeTimestampB

```solidity
mapping(address => uint256) public stakeTimestampB
```


### lastClaimTime

```solidity
mapping(address => uint256) public lastClaimTime
```


### pendingOps

```solidity
mapping(bytes32 => PendingOp) public pendingOps
```


### maxTotalSupplyBForRewardRateCap
Deploy-time ceiling on TokenB supply used to cap derived reward rates (not live `totalSupply()`).


```solidity
uint256 public maxTotalSupplyBForRewardRateCap
```


## Functions
### constructor

Initializes both pools, reward asset, and roles; validates TokenB decimals and ERC777 hooks.


```solidity
constructor(address tokenA, address tokenB, uint256 maxTotalSupplyBForRewardRateCap_) Ownable(msg.sender);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`tokenA`|`address`|Pool A staking token (TokenA).|
|`tokenB`|`address`|Pool B staking and reward token (TokenB); must be 18 decimals.|
|`maxTotalSupplyBForRewardRateCap_`|`uint256`|Non-zero supply ceiling for APR / rate-cap math.|


### stakeA

Stakes `tokenA` into Pool A for `msg.sender`.

Requires prior `approve` on TokenA. Calls `_executeStakeA` inline (refactor build uses `userModule.executeStakeA` via `delegatecall`).


```solidity
function stakeA(uint256 _amount) external nonReentrant whenNotPaused;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_amount`|`uint256`|Requested stake amount in TokenA’s smallest unit; credited amount may be lower for fee-on-transfer tokens.|


### withdrawA

Withdraws staked TokenA from Pool A for `msg.sender`.


```solidity
function withdrawA(uint256 _amount) external nonReentrant whenNotPaused;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_amount`|`uint256`|Amount of principal to withdraw.|


### claimA

Claims accrued Pool A rewards (paid in TokenB) for `msg.sender`.

Enforces `claimCooldown`; behavior under emergency without shutdown matches linked libraries.


```solidity
function claimA() external nonReentrant whenNotPaused;
```

### notifyRewardAmountA

Operator funds Pool A rewards and schedules a new emission period.


```solidity
function notifyRewardAmountA(uint256 amount, uint256 duration)
    external
    onlyRole(OPERATOR_ROLE)
    nonReentrant
    whenNotPaused;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`amount`|`uint256`|Requested reward amount pulled from `msg.sender` (actual uses balance delta for FOT-safe accounting).|
|`duration`|`uint256`|Distribution window in seconds; must be within `[MIN_REWARD_RATE_DURATION, MAX_DURATION]`.|


### stakeB

Stakes TokenB into Pool B for `msg.sender` and refreshes lock / timing state.


```solidity
function stakeB(uint256 _amount) external nonReentrant whenNotPaused;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_amount`|`uint256`|Requested stake amount.|


### withdrawB

Withdraws staked TokenB from Pool B; may charge penalties or fees depending on lock state.


```solidity
function withdrawB(uint256 _amount) external nonReentrant whenNotPaused;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_amount`|`uint256`|Principal amount to withdraw.|


### claimB

Claims accrued Pool B rewards (TokenB) for `msg.sender`.


```solidity
function claimB() external nonReentrant whenNotPaused;
```

### forceClaimAll

Force-settles both pools’ claimable rewards under bad-debt or shutdown rules (payment may be partial).

Same semantics as `ForceClaimAllLib`; still subject to claim cooldown.


```solidity
function forceClaimAll() external nonReentrant whenNotPaused;
```

### notifyRewardAmountB

Operator funds Pool B rewards and schedules a new emission period.


```solidity
function notifyRewardAmountB(uint256 amount, uint256 duration)
    external
    onlyRole(OPERATOR_ROLE)
    nonReentrant
    whenNotPaused;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`amount`|`uint256`|Requested reward amount from `msg.sender`.|
|`duration`|`uint256`|Distribution window in seconds.|


### compoundB

Compounds both pools’ accrued rewards into additional Pool B stake for `msg.sender`.

Reverts if bad debt exists or shutdown is active; enforces cooldown and token approvals per library rules.


```solidity
function compoundB() external nonReentrant whenNotPaused;
```

### emergencyWithdrawA

Emergency-style full withdrawal of Pool A principal for `msg.sender` (see `StakingAdminLib`).


```solidity
function emergencyWithdrawA() external nonReentrant;
```

### emergencyWithdrawB

Emergency-style full withdrawal of Pool B principal for `msg.sender`.


```solidity
function emergencyWithdrawB() external nonReentrant;
```

### cancelTimelock

Clears an on-chain timelock metadata row in `pendingOps`, if present.


```solidity
function cancelTimelock(bytes32 opId) external onlyRole(ADMIN_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`opId`|`bytes32`|Operation identifier key.|


### rebalanceBudgets

Moves reward budget between Pool A and Pool B available buckets.


```solidity
function rebalanceBudgets(Pool from, Pool to, uint256 amount) external onlyRole(ADMIN_ROLE) nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`from`|`Pool`|Source pool enum.|
|`to`|`Pool`|Destination pool enum.|
|`amount`|`uint256`|Reward token amount to move.|


### claimFees

Sweeps accumulated Pool B withdrawal fees to `feeRecipient` and zeros `unclaimedFeesB`.


```solidity
function claimFees() external onlyRole(ADMIN_ROLE) nonReentrant;
```

### setFeeRecipient

Updates the recipient address for Pool B withdrawal fees.


```solidity
function setFeeRecipient(address newRecipient) external onlyRole(ADMIN_ROLE) nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newRecipient`|`address`|New fee recipient; must not be the zero address.|


### setForfeitedRecipient

Updates the recipient for forfeited / penalty-related flows on Pool B.


```solidity
function setForfeitedRecipient(address newRecipient) external onlyRole(ADMIN_ROLE) nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newRecipient`|`address`|New recipient; must not be the zero address.|


### setMinEarlyExitAmountB

Sets the minimum principal bucket for Pool B early-exit rounding / fee logic.


```solidity
function setMinEarlyExitAmountB(uint256 newMin) external onlyRole(ADMIN_ROLE) nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newMin`|`uint256`|New minimum amount; must satisfy constraints vs `penaltyfeeBP` (see linked libraries).|


### setMaxTransferFeeBP

Sets the maximum tolerated transfer-fee slippage (basis points) for FOT-style tokens.


```solidity
function setMaxTransferFeeBP(uint256 newMaxTransferFeeBP) external onlyRole(ADMIN_ROLE) nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newMaxTransferFeeBP`|`uint256`|New cap; must not exceed `BASIS_POINTS`.|


### setTVLCapA

Sets Pool A TVL cap (`tvlCap` in `PoolInfo`).


```solidity
function setTVLCapA(uint256 _cap) external onlyRole(ADMIN_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_cap`|`uint256`|New cap value.|


### setTVLCapB

Sets Pool B TVL cap (`tvlCap` in `PoolInfo`).


```solidity
function setTVLCapB(uint256 _cap) external onlyRole(ADMIN_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_cap`|`uint256`|New cap value.|


### setMinStakeAmountA

Sets Pool A minimum stake amount.


```solidity
function setMinStakeAmountA(uint256 _amount) external onlyRole(ADMIN_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_amount`|`uint256`|New minimum stake.|


### setMinStakeAmountB

Sets Pool B minimum stake amount.


```solidity
function setMinStakeAmountB(uint256 _amount) external onlyRole(ADMIN_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_amount`|`uint256`|New minimum stake.|


### setRewardDurationA

Sets Pool A default `rewardDuration` configuration field.


```solidity
function setRewardDurationA(uint256 _duration) external onlyRole(ADMIN_ROLE) nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_duration`|`uint256`|Duration in seconds.|


### setRewardDurationB

Sets Pool B default `rewardDuration` configuration field.


```solidity
function setRewardDurationB(uint256 _duration) external onlyRole(ADMIN_ROLE) nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_duration`|`uint256`|Duration in seconds.|


### setMinClaimAmount

Sets the minimum reward amount required for a successful claim.


```solidity
function setMinClaimAmount(uint256 _amount) external onlyRole(ADMIN_ROLE) nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_amount`|`uint256`|New threshold; must not exceed `MAX_MIN_CLAIM_AMOUNT`.|


### setFees

Updates Pool B withdrawal-related fee parameters (basis points).


```solidity
function setFees(uint256 newWithdrawFeeBP, uint256 newMidTermFeeBP, uint256 newPenaltyFeeBP)
    external
    onlyRole(ADMIN_ROLE)
    nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newWithdrawFeeBP`|`uint256`|Withdrawal fee (bp).|
|`newMidTermFeeBP`|`uint256`|Mid-term fee (bp).|
|`newPenaltyFeeBP`|`uint256`|Early-exit penalty (bp).|


### setLockDuration

Updates Pool B lock duration used for unlock / penalty logic.


```solidity
function setLockDuration(uint256 newLockDuration) external onlyRole(ADMIN_ROLE) nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newLockDuration`|`uint256`|Lock duration in seconds; must be in `(0, MAX_LOCK_DURATION]`.|


### resolveBadDebt

Caller transfers reward tokens to repay recorded bad debt across pools per library rules.


```solidity
function resolveBadDebt(uint256 amount) external onlyRole(ADMIN_ROLE) nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`amount`|`uint256`|Amount to apply toward repayment.|


### recoverToken

Recovers ERC20 tokens that are not required to cover accounting liabilities (mis-sent tokens).


```solidity
function recoverToken(address token, address to, uint256 amount) external onlyRole(ADMIN_ROLE) nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|Token contract to sweep.|
|`to`|`address`|Recipient of recovered tokens.|
|`amount`|`uint256`|Amount to transfer out if permitted.|


### activateShutdown

Activates shutdown while already in emergency mode.


```solidity
function activateShutdown() external onlyRole(ADMIN_ROLE) nonReentrant;
```

### forceShutdownFinalize

Finalizes protocol shutdown (fee sweep and terminal state); see `StakingAdminLib.executeForceShutdownFinalize`.


```solidity
function forceShutdownFinalize() external onlyRole(ADMIN_ROLE);
```

### enableEmergencyMode

Enables emergency mode (restricts normal user paths, enables emergency flows).


```solidity
function enableEmergencyMode() external onlyRole(OPERATOR_ROLE);
```

### setAdmin

Grants or revokes `ADMIN_ROLE` on this contract.


```solidity
function setAdmin(address newAdmin, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newAdmin`|`address`|Address receiving or losing the role.|
|`enabled`|`bool`|True to grant, false to revoke.|


### setOperator

Grants or revokes `OPERATOR_ROLE` on this contract.


```solidity
function setOperator(address newOperator, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newOperator`|`address`|Address receiving or losing the role.|
|`enabled`|`bool`|True to grant, false to revoke.|


### pause

Pauses the contract; `unpause` extends active reward `periodFinish` by the paused duration.


```solidity
function pause() external onlyRole(OPERATOR_ROLE) whenNotPaused;
```

### unpause

Unpauses after cooldown and shifts ongoing reward schedules forward by pause length.


```solidity
function unpause() external onlyRole(ADMIN_ROLE) whenPaused;
```

### poolA

Returns a memory snapshot of Pool A aggregate accounting (`PoolInfo`).


```solidity
function poolA() external view returns (PoolInfo memory state);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`state`|`PoolInfo`|Copy of `poolAState`.|


### poolB

Returns a memory snapshot of Pool B aggregate accounting (`PoolInfo`).


```solidity
function poolB() external view returns (PoolInfo memory state);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`state`|`PoolInfo`|Copy of `poolBState`.|


### _assertNoERC777HooksRegistered

Constructor-time check: this contract must not register ERC777 recipient/sender hooks on ERC1820.


```solidity
function _assertNoERC777HooksRegistered() internal view;
```

### _assertStakingTokenAHasNoERC777Hooks

PRD: rejects ERC777 hook registration on the Pool A staking token to reduce reentrancy / callback surface.


```solidity
function _assertStakingTokenAHasNoERC777Hooks(address tokenA) internal view;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`tokenA`|`address`|Pool A staking token address.|


### _executeStakeA

Pool A stake body; same logic as `DualPoolUserModule.executeStakeA` under modular `delegatecall`.


```solidity
function _executeStakeA(address user, uint256 amount) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|Beneficiary (typically `msg.sender`).|
|`amount`|`uint256`|Requested stake amount.|


### _executeStakeB

Pool B stake body; same logic as `DualPoolUserModule.executeStakeB`.


```solidity
function _executeStakeB(address user, uint256 amount) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|Beneficiary.|
|`amount`|`uint256`|Requested stake amount.|


### _executeWithdrawB

Pool B withdraw + fee accounting; same logic as `DualPoolUserModule.executeWithdrawB`.


```solidity
function _executeWithdrawB(address user, uint256 amount) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|Withdrawing user.|
|`amount`|`uint256`|Principal to withdraw.|


### _executeWithdrawA

Pool A withdraw; same logic as `DualPoolUserModule.executeWithdrawA`.


```solidity
function _executeWithdrawA(address user, uint256 amount) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|Withdrawing user.|
|`amount`|`uint256`|Amount to withdraw.|


### _executeClaimA

Pool A claim; same logic as `DualPoolUserModule.executeClaimA`.


```solidity
function _executeClaimA(address user) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|Claiming user.|


### _executeClaimB

Pool B claim; same logic as `DualPoolUserModule.executeClaimB`.


```solidity
function _executeClaimB(address user) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|Claiming user.|


### _executeForceClaimAll

Force-claim-all path; same logic as `DualPoolUserModule.executeForceClaimAll`.


```solidity
function _executeForceClaimAll(address user) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|User being settled.|


### _executeCompoundB

Compound path; same logic as `DualPoolUserModule.executeCompoundB`.


```solidity
function _executeCompoundB(address user) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|User compounding rewards into Pool B stake.|


### _executeEmergencyWithdrawA

Pool A emergency withdraw; same logic as `DualPoolUserModule.executeEmergencyWithdrawA`.


```solidity
function _executeEmergencyWithdrawA(address user) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|User exiting principal.|


### _executeEmergencyWithdrawB

Pool B emergency withdraw; same logic as `DualPoolUserModule.executeEmergencyWithdrawB`.


```solidity
function _executeEmergencyWithdrawB(address user) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|User exiting principal.|


### _executeNotifyRewardAmountA

Pool A reward notify; same logic as `DualPoolAdminModule.executeNotifyRewardAmountA`.


```solidity
function _executeNotifyRewardAmountA(address sender, uint256 amount, uint256 duration) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`sender`|`address`|Payer pulling reward tokens in (the `msg.sender` of `notifyRewardAmountA`).|
|`amount`|`uint256`|Requested funding amount.|
|`duration`|`uint256`|Reward period duration.|


### _executeNotifyRewardAmountB

Pool B reward notify; same logic as `DualPoolAdminModule.executeNotifyRewardAmountB`.


```solidity
function _executeNotifyRewardAmountB(address sender, uint256 amount, uint256 duration) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`sender`|`address`|Payer funding rewards.|
|`amount`|`uint256`|Requested funding amount.|
|`duration`|`uint256`|Reward period duration.|


### _applyTVLCap

Writes `tvlCap` and emits `TVLCapUpdated`.


```solidity
function _applyTVLCap(PoolInfo storage pool, Pool p, uint256 cap) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`pool`|`PoolInfo`|Pool storage slot to update.|
|`p`|`Pool`|Pool enum for indexed events.|
|`cap`|`uint256`|New cap value.|


### _applyMinStake

Writes `minStakeAmount` and emits `MinStakeAmountUpdated`.


```solidity
function _applyMinStake(PoolInfo storage pool, Pool p, uint256 amount) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`pool`|`PoolInfo`|Pool storage slot to update.|
|`p`|`Pool`|Pool enum for indexed events.|
|`amount`|`uint256`|New minimum stake.|


### _applyRewardDuration

Writes `rewardDuration` config and emits `RewardDurationUpdated`.


```solidity
function _applyRewardDuration(PoolInfo storage pool, Pool p, uint256 duration) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`pool`|`PoolInfo`|Pool storage slot to update.|
|`p`|`Pool`|Pool enum for indexed events.|
|`duration`|`uint256`|New duration in seconds.|


### _updateGlobalA

Updates Pool A global reward index; emits shortfall / dust signals when applicable.


```solidity
function _updateGlobalA() internal;
```

### _updateGlobalB

Updates Pool B global reward index; emits shortfall / dust signals when applicable.


```solidity
function _updateGlobalB() internal;
```

### _settleUserA

Accrues Pool A global index into the user’s `UserInfo` fields.


```solidity
function _settleUserA(address user) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|User address.|


### _settleUserB

Accrues Pool B global index into the user’s `UserInfo` fields.


```solidity
function _settleUserB(address user) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`|User address.|


### _invariantRequiredPart1

Invariant liability leg (part 1): Pool B principal + both pools’ pending reward liabilities.


```solidity
function _invariantRequiredPart1() internal view returns (uint256 sum);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`sum`|`uint256`|Sum of commitment-side components.|


### _invariantRequiredPart2

Invariant liability leg (part 2): available rewards, unclaimed fees, and dust buckets.


```solidity
function _invariantRequiredPart2() internal view returns (uint256 sum);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`sum`|`uint256`|Sum of asset-side components that must be covered by TokenB balance + bad debt.|


### _invariantBActualRequired

TokenB balance plus bad-debt tallies should cover total commitments; used for the Pool-B-style accounting invariant.


```solidity
function _invariantBActualRequired() internal view returns (uint256 actual, uint256 required);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`actual`|`uint256`|On-chain TokenB balance plus recorded bad debt.|
|`required`|`uint256`|Required liability sum from parts (1) and (2).|


### _assertInvariantB

Reverts if invariant fails; emits `InvariantViolated` before reverting (matches modular build behavior).


```solidity
function _assertInvariantB() internal;
```

### _checkInvariantBNoRevert

Same computation as `_assertInvariantB`, but never reverts—only logs via `InvariantViolated` on breach (emergency paths).


```solidity
function _checkInvariantBNoRevert() internal;
```

## Events
### Staked

```solidity
event Staked(address indexed user, uint256 amount, uint256 newUnlockTime, Pool indexed pool);
```

### Withdrawn

```solidity
event Withdrawn(address indexed user, uint256 amount, uint256 feeOrPenalty, bool isEarly, Pool indexed pool);
```

### Claimed

```solidity
event Claimed(address indexed user, uint256 paidA, uint256 paidB, uint256 timestamp);
```

### ForceClaimed

```solidity
event ForceClaimed(
    address indexed user, uint256 paidA, uint256 paidB, uint256 unpaidA, uint256 unpaidB, uint256 timestamp
);
```

### Compounded

```solidity
event Compounded(
    address indexed user, uint256 amountA, uint256 amountB, uint256 newUserStakedB, uint256 newUnlockTimeB
);
```

### InsufficientBudget

```solidity
event InsufficientBudget(Pool pool, uint256 shortfall, uint256 timestamp);
```

### DustAccumulated

```solidity
event DustAccumulated(Pool pool, uint256 dustAmount, uint256 timestamp);
```

### EmergencyWithdrawn

```solidity
event EmergencyWithdrawn(address indexed user, uint256 amount, Pool indexed pool, uint256 at);
```

### BudgetRebalanced

```solidity
event BudgetRebalanced(Pool indexed from, Pool indexed to, uint256 amount, uint256 timestamp);
```

### FeesClaimed

```solidity
event FeesClaimed(address indexed recipient, uint256 amount, uint256 timestamp);
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

### FeesUpdated

```solidity
event FeesUpdated(uint256 penaltyBP, uint256 withdrawBP, uint256 midTermBP, uint256 at);
```

### FeeRecipientUpdated

```solidity
event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient, uint256 timestamp);
```

### ForfeitedRecipientUpdated

```solidity
event ForfeitedRecipientUpdated(address indexed oldRecipient, address indexed newRecipient, uint256 timestamp);
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

### InvariantViolated

```solidity
event InvariantViolated(uint256 actual, uint256 required, uint256 timestamp);
```

### Paused

```solidity
event Paused(address indexed by, uint256 at);
```

### Unpaused

```solidity
event Unpaused(address indexed by, uint256 at);
```

### RewardNotified

```solidity
event RewardNotified(Pool indexed pool, uint256 amount, uint256 duration, uint256 rate);
```

### TimelockCancelled

```solidity
event TimelockCancelled(bytes32 indexed opId, bytes32 indexed paramsHash, uint256 cancelledAt);
```

## Errors
### SameStakingTokens
Pool A and Pool B staking tokens must differ.


```solidity
error SameStakingTokens();
```

### InvalidRewardTokenDecimals
TokenB must expose 18 decimals for fixed-point reward math.


```solidity
error InvalidRewardTokenDecimals();
```

### InvariantViolation
TokenB balance + `badDebt` no longer covers recorded liabilities within tolerance.


```solidity
error InvariantViolation(uint256 actual, uint256 required);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`actual`|`uint256`|Observed backing side of the invariant.|
|`required`|`uint256`|Required liability sum from pool state.|

### EmergencyModeActive
Operation blocked because emergency mode is already active where a fresh activation was expected.


```solidity
error EmergencyModeActive();
```

### TimelockCreated
Reserved timelock scheduling hook (unused in current bytecode paths).


```solidity
error TimelockCreated(bytes32 opId, uint256 executeAfter);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`opId`|`bytes32`|Operation id that would have been scheduled.|
|`executeAfter`|`uint256`|Timestamp after which execution would be allowed.|

### ZeroDuration
Reserved zero-duration error (unused in current paths).


```solidity
error ZeroDuration();
```

### ERC777HookImplementerDetected
ERC777 ERC-1820 implementer detected where hooks are forbidden.


```solidity
error ERC777HookImplementerDetected(address implementer);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`implementer`|`address`|Non-zero hook implementer returned by the registry.|

### InvalidFeeBps
Fee basis-point configuration exceeds configured maxima or internal consistency checks.


```solidity
error InvalidFeeBps();
```

### MinEarlyExitAmountTooLow
`minEarlyExitAmountB` is below the minimum implied by the penalty bps configuration.


```solidity
error MinEarlyExitAmountTooLow(uint256 minRequired, uint256 currentValue);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`minRequired`|`uint256`|Derived minimum allowed principal bucket.|
|`currentValue`|`uint256`|Current configured value that failed validation.|

### ExceedsMaxMinClaimAmount
`minClaimAmount` exceeds `MAX_MIN_CLAIM_AMOUNT`.


```solidity
error ExceedsMaxMinClaimAmount();
```

### InvalidLockDuration
`lockDuration` is outside `(0, MAX_LOCK_DURATION]`.


```solidity
error InvalidLockDuration();
```

### ShutdownActive
Operation blocked because shutdown is already active.


```solidity
error ShutdownActive();
```

### UnpauseCooldownPending
`unpause` called before `unpauseAt` cooldown elapses.


```solidity
error UnpauseCooldownPending(uint256 unpauseAt, uint256 currentTime);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`unpauseAt`|`uint256`|Earliest allowed unpause timestamp.|
|`currentTime`|`uint256`|`block.timestamp` at revert.|

### TimelockNotFound
`cancelTimelock` referenced an unknown or already-cleared `opId`.


```solidity
error TimelockNotFound(bytes32 opId);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`opId`|`bytes32`|Missing timelock key.|

