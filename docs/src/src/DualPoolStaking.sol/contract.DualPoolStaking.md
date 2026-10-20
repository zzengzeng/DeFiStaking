# DualPoolStaking
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/49679f252829d0b3ac33cfb42d46070f8f7fbdc0/src/DualPoolStaking.sol)

**Inherits:**
Ownable, AccessControl, ReentrancyGuard, Pausable

**Title:**
DualPoolStaking

Dual-pool staking and rewards **core**: user and admin **execution** is delegated to external modules via `delegatecall`.

Wire `userModule` / `adminModule` immediately after deploy. Storage layout must match `DualPoolStorageLayout` and module bytecode expectations.


## State Variables
### rewardToken
Reward token (TokenB, 18 decimals), also Pool B’s staking asset.


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


### userModule

```solidity
address public userModule
```


### adminModule

```solidity
address public adminModule
```


### maxTotalSupplyBForRewardRateCap
Deploy-time TokenB supply ceiling for reward-rate cap (see PRD `MAX_REWARD_RATE_*`).


```solidity
uint256 public maxTotalSupplyBForRewardRateCap
```


### bookedUserRewardsA
Running sum of all `userInfoA[*].rewards` (must match `DualPoolStorageLayout` slot order).


```solidity
uint256 public bookedUserRewardsA
```


### bookedUserRewardsB
Running sum of all `userInfoB[*].rewards`.


```solidity
uint256 public bookedUserRewardsB
```


## Functions
### constructor

Initializes pools, reward token, role admins, fee recipients, and ERC777 safety checks.


```solidity
constructor(address tokenA, address tokenB, uint256 maxTotalSupplyBForRewardRateCap_) Ownable(msg.sender);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`tokenA`|`address`|Pool A staking token (must differ from `tokenB`).|
|`tokenB`|`address`|Pool B staking + reward token (must be 18 decimals).|
|`maxTotalSupplyBForRewardRateCap_`|`uint256`|Non-zero supply ceiling for APR / max-rate math.|


### stakeA

Stakes TokenA into Pool A for `msg.sender` via `userModule.executeStakeA`.

Requires prior `approve` on TokenA. Amount is the requested `transferFrom` quantity; credited stake uses post-fee received balance per `PoolAStakeLib`.


```solidity
function stakeA(uint256 _amount) external nonReentrant whenNotPaused;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_amount`|`uint256`|Requested stake amount (TokenA smallest units).|


### withdrawA

Withdraws TokenA principal from Pool A for `msg.sender` via `userModule.executeWithdrawA`.


```solidity
function withdrawA(uint256 _amount) external nonReentrant whenNotPaused;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_amount`|`uint256`|Principal to withdraw (must be `> 0` and `<=` user stake).|


### claimA

Claims accrued Pool A rewards (paid in TokenB) for `msg.sender` via `userModule.executeClaimA`.

Enforces `claimCooldown`, `minClaimAmount`, and blocks claims while either pool has `badDebt` (see `PoolSingleClaimLib`).


```solidity
function claimA() external nonReentrant whenNotPaused;
```

### notifyRewardAmountA

Operator funds Pool A rewards and schedules emissions (`OPERATOR_ROLE`).


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
|`amount`|`uint256`|Reward amount pulled from `msg.sender` (actual uses balance delta for FOT safety downstream).|
|`duration`|`uint256`|Emission duration in seconds, or `0` to use `poolA().rewardDuration` (set via `setRewardDurationA` within allowed bounds).|


### stakeB

Stakes TokenB into Pool B for `msg.sender` and updates lock / weighted stake metadata.

Requires prior `approve` on TokenB. Delegates to `userModule.executeStakeB`.


```solidity
function stakeB(uint256 _amount) external nonReentrant whenNotPaused;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_amount`|`uint256`|Requested stake amount (smallest units).|


### withdrawB

Withdraws Pool B principal for `msg.sender`; may charge penalties or fees per lock state.

Delegates to `userModule.executeWithdrawB`.


```solidity
function withdrawB(uint256 _amount) external nonReentrant whenNotPaused;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_amount`|`uint256`|Principal to withdraw.|


### claimB

Claims accrued Pool B rewards (TokenB) for `msg.sender` via `userModule.executeClaimB`.

Same cooldown, min-claim, bad-debt, and liquidity rules as `claimA`, but settles against Pool B pending.


```solidity
function claimB() external nonReentrant whenNotPaused;
```

### forceClaimAll

Cross-pool emergency claim: only during `shutdown` or when either pool has `badDebt`.

Shares cooldown with `claimA`/`claimB`. May partially pay if TokenB liquidity is short. When `shutdown` or any
`badDebt`, per-pool `minClaimAmount` is relaxed (see `ForceClaimAllLib`). Healthy normal ops must use `claimA`/`claimB`.


```solidity
function forceClaimAll() external nonReentrant whenNotPaused;
```

### notifyRewardAmountB

Operator funds Pool B rewards and schedules emissions (`OPERATOR_ROLE`).


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
|`amount`|`uint256`|Reward amount pulled from `msg.sender`.|
|`duration`|`uint256`|Emission duration in seconds, or `0` to use `poolB().rewardDuration` (`setRewardDurationB`).|


### compoundB

Compounds both pools’ accrued rewards into additional Pool B principal for `msg.sender`.

Reverts on any pool `badDebt`, during `shutdown`, or when `compoundTotal == 0`. Applies `claimCooldown` like claims.


```solidity
function compoundB() external nonReentrant whenNotPaused;
```

### emergencyWithdrawA

Emergency Pool A principal exit for `msg.sender` (delegates to user module).


```solidity
function emergencyWithdrawA() external nonReentrant;
```

### emergencyWithdrawB

Emergency Pool B principal exit for `msg.sender` (delegates to user module).


```solidity
function emergencyWithdrawB() external nonReentrant;
```

### rebalanceBudgets

Moves reward budget between pools (`ADMIN_ROLE`).


```solidity
function rebalanceBudgets(Pool from, Pool to, uint256 amount) external onlyRole(ADMIN_ROLE) nonReentrant;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`from`|`Pool`|Source pool.|
|`to`|`Pool`|Destination pool.|
|`amount`|`uint256`|Reward token amount.|


### claimFees

Sweeps accumulated Pool B fees to `feeRecipient` (`ADMIN_ROLE`).


```solidity
function claimFees() external onlyRole(ADMIN_ROLE) nonReentrant;
```

### _assertNoERC777HooksRegistered

Ensures this contract address has no ERC777 recipient/sender hooks registered on ERC-1820.


```solidity
function _assertNoERC777HooksRegistered() internal view;
```

### _assertTokenHasNoERC777Hooks

Rejects ERC777-style hooks on a deploy-time token (ERC-1820 `TokensRecipient` / `TokensSender`).
Constructor calls this for `tokenA` (Pool A stake) and `tokenB` (Pool B stake + rewards) to block transfer callbacks that could bypass CEI.


```solidity
function _assertTokenHasNoERC777Hooks(address token) internal view;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`token`|`address`|Token address probed on ERC-1820 when the registry is deployed on-chain.|


### setUserModule

Points `userModule` to a new implementation (`DEFAULT_ADMIN_ROLE`).

Production: this role must not remain on an EOA; hold it on a Timelock-owned `DualPoolStakingAdmin` (or the timelock itself) so upgrades go through `schedule` / `execute`.


```solidity
function setUserModule(address newModule) external onlyRole(DEFAULT_ADMIN_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newModule`|`address`|Non-zero module address.|


### setAdminModule

Points `adminModule` to a new implementation (`DEFAULT_ADMIN_ROLE`).

See `setUserModule` NatSpec: delegatecall targets are fully trusted; gate `DEFAULT_ADMIN_ROLE` behind timelocked governance.


```solidity
function setAdminModule(address newModule) external onlyRole(DEFAULT_ADMIN_ROLE);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newModule`|`address`|Non-zero module address.|


### _delegateTo

`delegatecall`s `module` with `data`, bubbling revert data on failure (module executes with core storage context).


```solidity
function _delegateTo(address module, bytes memory data) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`module`|`address`|Module address (`userModule` or `adminModule`); must be configured non-zero before use.|
|`data`|`bytes`|ABI-encoded call data for the module entrypoint (`execute*` family).|


### setFeeRecipient

Updates Pool B fee recipient (`ADMIN_ROLE`).


```solidity
function setFeeRecipient(address newRecipient) external onlyRole(ADMIN_ROLE) nonReentrant;
```

### setMinEarlyExitAmountB

Updates `minEarlyExitAmountB` (`ADMIN_ROLE`).


```solidity
function setMinEarlyExitAmountB(uint256 newMin) external onlyRole(ADMIN_ROLE) nonReentrant;
```

### setMaxTransferFeeBP

Updates `maxTransferFeeBP` (`ADMIN_ROLE`).


```solidity
function setMaxTransferFeeBP(uint256 newMaxTransferFeeBP) external onlyRole(ADMIN_ROLE) nonReentrant;
```

### setTVLCapA

Sets Pool A TVL cap (`ADMIN_ROLE`).


```solidity
function setTVLCapA(uint256 _cap) external onlyRole(ADMIN_ROLE);
```

### setTVLCapB

Sets Pool B TVL cap (`ADMIN_ROLE`).


```solidity
function setTVLCapB(uint256 _cap) external onlyRole(ADMIN_ROLE);
```

### setMinStakeAmountA

Sets Pool A minimum stake (`ADMIN_ROLE`).


```solidity
function setMinStakeAmountA(uint256 _amount) external onlyRole(ADMIN_ROLE);
```

### setMinStakeAmountB

Sets Pool B minimum stake (`ADMIN_ROLE`).


```solidity
function setMinStakeAmountB(uint256 _amount) external onlyRole(ADMIN_ROLE);
```

### setRewardDurationA

Sets Pool A default emission length for `notifyRewardAmountA(amount, 0)` (`ADMIN_ROLE`).


```solidity
function setRewardDurationA(uint256 _duration) external onlyRole(ADMIN_ROLE) nonReentrant;
```

### setRewardDurationB

Sets Pool B default emission length for `notifyRewardAmountB(amount, 0)` (`ADMIN_ROLE`).


```solidity
function setRewardDurationB(uint256 _duration) external onlyRole(ADMIN_ROLE) nonReentrant;
```

### setMinClaimAmount

Sets `minClaimAmount` (`ADMIN_ROLE`).


```solidity
function setMinClaimAmount(uint256 _amount) external onlyRole(ADMIN_ROLE) nonReentrant;
```

### setFees

Updates Pool B fee parameters (`ADMIN_ROLE`).


```solidity
function setFees(uint256 newWithdrawFeeBP, uint256 newMidTermFeeBP, uint256 newPenaltyFeeBP)
    external
    onlyRole(ADMIN_ROLE)
    nonReentrant;
```

### setLockDuration

Updates Pool B `lockDuration` (`ADMIN_ROLE`).


```solidity
function setLockDuration(uint256 newLockDuration) external onlyRole(ADMIN_ROLE) nonReentrant;
```

### resolveBadDebt

Repays bad debt with reward tokens pulled from `payer` (`ADMIN_ROLE`).

Production: `DualPoolStakingAdmin` passes `msg.sender` (Timelock) as `payer`; do not use Core `msg.sender` (the facade).


```solidity
function resolveBadDebt(address payer, uint256 amount) external onlyRole(ADMIN_ROLE) nonReentrant;
```

### recoverToken

Recovers non-liability ERC20 balances (`ADMIN_ROLE`).


```solidity
function recoverToken(address token, address to, uint256 amount) external onlyRole(ADMIN_ROLE) nonReentrant;
```

### activateShutdown

Activates shutdown while in emergency (`ADMIN_ROLE`).


```solidity
function activateShutdown() external onlyRole(ADMIN_ROLE) nonReentrant;
```

### forceShutdownFinalize

Finalizes shutdown (`ADMIN_ROLE`).


```solidity
function forceShutdownFinalize() external onlyRole(ADMIN_ROLE) nonReentrant;
```

### enableEmergencyMode

Enables emergency mode (`OPERATOR_ROLE`).


```solidity
function enableEmergencyMode() external onlyRole(OPERATOR_ROLE);
```

### setAdmin

Grants or revokes `ADMIN_ROLE` (`DEFAULT_ADMIN_ROLE`).


```solidity
function setAdmin(address newAdmin, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE);
```

### setOperator

Grants or revokes `OPERATOR_ROLE` (`DEFAULT_ADMIN_ROLE`).


```solidity
function setOperator(address newOperator, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE);
```

### pause

Pauses user-facing flows (`OPERATOR_ROLE`).


```solidity
function pause() external onlyRole(OPERATOR_ROLE) whenNotPaused;
```

### unpause

Unpauses after cooldown (`ADMIN_ROLE`).


```solidity
function unpause() external onlyRole(ADMIN_ROLE) whenPaused;
```

### poolA

Returns Pool A aggregate `PoolInfo` snapshot.


```solidity
function poolA() external view returns (PoolInfo memory);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`PoolInfo`|Memory copy of `poolAState` (TokenA pool accounting).|


### poolB

Returns Pool B aggregate `PoolInfo` snapshot.


```solidity
function poolB() external view returns (PoolInfo memory);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`PoolInfo`|Memory copy of `poolBState` (TokenB pool accounting).|


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
event EmergencyWithdrawn(
    address indexed user, uint256 principal, uint256 rewardsForfeited, Pool indexed pool, uint256 withdrawnAt
);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`user`|`address`||
|`principal`|`uint256`|Token principal returned to the user (Pool A: TokenA wei; Pool B: TokenB wei).|
|`rewardsForfeited`|`uint256`|User accrued rewards cleared on that pool before rebalance to Pool B budget (`userInfo*.rewards` snapshot).|
|`pool`|`Pool`||
|`withdrawnAt`|`uint256`||

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
event FeesUpdated(uint256 penaltyBP, uint256 withdrawBP, uint256 midTermBP, uint256 timestamp);
```

### FeeRecipientUpdated

```solidity
event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient, uint256 timestamp);
```

### ShutdownActivated

```solidity
event ShutdownActivated(address indexed by, uint256 timestamp);
```

### ProtocolShutdownComplete

```solidity
event ProtocolShutdownComplete(uint256 timestamp);
```

### EmergencyModeActivated

```solidity
event EmergencyModeActivated(address indexed by, uint256 timestamp);
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
event Paused(address indexed by, uint256 timestamp);
```

### Unpaused

```solidity
event Unpaused(address indexed by, uint256 timestamp);
```

### RewardNotified

```solidity
event RewardNotified(Pool indexed pool, uint256 amount, uint256 duration, uint256 rate);
```

### UserModuleUpdated

```solidity
event UserModuleUpdated(address indexed oldModule, address indexed newModule, uint256 timestamp);
```

### AdminModuleUpdated

```solidity
event AdminModuleUpdated(address indexed oldModule, address indexed newModule, uint256 timestamp);
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
Accounting invariant (TokenB balance vs liabilities) violated.


```solidity
error InvariantViolation(uint256 actual, uint256 required);
```

**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`actual`|`uint256`|Observed backing (`balance + badDebt`) side.|
|`required`|`uint256`|Sum of liabilities derived from pool state.|

### EmergencyModeActive
Operation blocked while emergency mode is active (unless explicitly allowed elsewhere).


```solidity
error EmergencyModeActive();
```

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

### AdminFunctionMoved
Reserved marker if an admin entrypoint is relocated (unused).


```solidity
error AdminFunctionMoved();
```

