# DualPoolStorageLayout
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/c3cdaa9f3e5e324db578e81e0109756c6d9d8922/src/modules/DualPoolStorageLayout.sol)

**Inherits:**
Ownable, AccessControl, ReentrancyGuard, Pausable

**Title:**
DualPoolStorageLayout

Abstract base holding **exact** storage field order shared by `DualPoolStaking` and delegatecall modules.

`DualPoolUserModule` / `DualPoolAdminModule` inherit this so `delegatecall` reads/writes the core’s slots. **Do not reorder, rename, or insert** fields without updating `DualPoolStaking` and migration notes.

**Note:**
layout: The core contract duplicates this ordering for its own bytecode; any drift breaks `delegatecall` until both sides are migrated together.


## State Variables
### rewardToken
Reward token (TokenB, 18 decimals): same asset used to pay Pool A rewards and as Pool B stake/reward unit.


```solidity
IERC20 public rewardToken
```


### PRECISION
Fixed-point scale for `accRewardPerToken` and user reward settlement (`PoolAccrualLib`).


```solidity
uint256 public constant PRECISION = 1e18
```


### MAX_DELTA_TIME
Upper bound on a single `updateGlobal` time step to bound reward accrual in one call.


```solidity
uint256 public constant MAX_DELTA_TIME = 30 days
```


### DUST_TOLERANCE
Sub-wei dust bucket recycling threshold in `PoolAccrualLib` (matches core `DUST_TOLERANCE`).


```solidity
uint256 public constant DUST_TOLERANCE = 10 wei
```


### BASIS_POINTS
Denominator for all basis-point fee and cap parameters (`10_000` = 100%).


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
Rolling Pool B lock duration applied on each stake/compound (seconds).


```solidity
uint256 public lockDuration = 7 days
```


### claimCooldown
Minimum seconds between user claim / compound / force-claim actions per address.


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
Pool B withdrawal fees accumulated on-contract until swept by admin (`claimFees`).


```solidity
uint256 public unclaimedFeesB
```


### emergencyActivatedAt
Timestamp when emergency mode was activated (`0` if never).


```solidity
uint256 public emergencyActivatedAt
```


### minClaimAmount
Minimum settled reward amount required for a normal single-pool claim.


```solidity
uint256 public minClaimAmount
```


### MAX_MIN_CLAIM_AMOUNT

```solidity
uint256 public constant MAX_MIN_CLAIM_AMOUNT = 1e17 wei
```


### shutdownAt
Timestamp when shutdown was activated (`0` if not shutdown).


```solidity
uint256 public shutdownAt
```


### pausedAt
Timestamp when `pause()` was last invoked (`0` if not paused).


```solidity
uint256 public pausedAt
```


### unpauseAt
Earliest timestamp `unpause()` may succeed after a pause.


```solidity
uint256 public unpauseAt
```


### feeRecipient
Recipient of swept Pool B withdrawal fees.


```solidity
address public feeRecipient
```


### forfeitedRecipient
Recipient configured for forfeited-reward / penalty routing (see PRD).


```solidity
address public forfeitedRecipient
```


### ERC1820_REGISTRY_ADDR

```solidity
address internal constant ERC1820_REGISTRY_ADDR = 0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24
```


### ERC777_RECIPIENT_HASH

```solidity
bytes32 internal constant ERC777_RECIPIENT_HASH = keccak256("ERC777TokensRecipient")
```


### ERC777_SENDER_HASH

```solidity
bytes32 internal constant ERC777_SENDER_HASH = keccak256("ERC777TokensSender")
```


### emergencyMode
Global emergency flag (restricts user paths; enables emergency withdrawals).


```solidity
bool public emergencyMode
```


### shutdown
Global shutdown flag (terminal / settlement semantics per admin paths).


```solidity
bool public shutdown
```


### poolAState
Aggregate Pool A accounting (`PoolInfo`); exposed via core `poolA()` only on the modular core.


```solidity
PoolInfo internal poolAState
```


### poolBState
Aggregate Pool B accounting (`PoolInfo`).


```solidity
PoolInfo internal poolBState
```


### userInfoA
Per-address Pool A user ledger.


```solidity
mapping(address => UserInfo) public userInfoA
```


### userInfoB
Per-address Pool B user ledger.


```solidity
mapping(address => UserInfo) public userInfoB
```


### unlockTimeB
Pool B per-user unlock timestamp for penalty vs fee routing.


```solidity
mapping(address => uint256) public unlockTimeB
```


### stakeTimestampB
Pool B per-user weighted-average deposit time for holding-duration fees.


```solidity
mapping(address => uint256) public stakeTimestampB
```


### lastClaimTime
Last timestamp a user invoked claim / compound / force-claim (cooldown enforcement).


```solidity
mapping(address => uint256) public lastClaimTime
```


### pendingOps
Optional timelock metadata keyed by governance operation id.


```solidity
mapping(bytes32 => PendingOp) public pendingOps
```


### userModule
`delegatecall` target for all user stake/withdraw/claim bodies (`DualPoolUserModule`).

Must mirror `DualPoolStaking` slot order after `pendingOps` (delegatecall layout).


```solidity
address public userModule
```


### adminModule
`delegatecall` target for admin/operator notify and parameter mutations (`DualPoolAdminModule`).


```solidity
address public adminModule
```


### maxTotalSupplyBForRewardRateCap
Immutable cap for `MAX_REWARD_RATE_*` derivation (PRD: deploy-time supply ceiling, not live `totalSupply()`).


```solidity
uint256 public maxTotalSupplyBForRewardRateCap
```


## Functions
### constructor

Satisfies `Ownable` construction for abstract layout; core contract supplies real `Ownable(msg.sender)` in its constructor.


```solidity
constructor() Ownable(msg.sender);
```

