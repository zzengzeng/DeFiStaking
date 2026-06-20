# DualPoolStorageLayout
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/49679f252829d0b3ac33cfb42d46070f8f7fbdc0/src/modules/DualPoolStorageLayout.sol)

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


### MAX_CATCHUP_ITERATIONS
Max `updateGlobal` steps in one `pause` catch-up loop (`× MAX_DELTA_TIME` wall-clock span).


```solidity
uint256 public constant MAX_CATCHUP_ITERATIONS = 50
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


### userModule
`delegatecall` target for all user stake/withdraw/claim bodies (`DualPoolUserModule`).


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


### bookedUserRewardsA
Running sum of all `userInfoA[*].rewards` (mirrored on every settle / claim / compound / forfeit / emergency path).


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

Satisfies `Ownable` construction for abstract layout; core contract supplies real `Ownable(msg.sender)` in its constructor.


```solidity
constructor() Ownable(msg.sender);
```

