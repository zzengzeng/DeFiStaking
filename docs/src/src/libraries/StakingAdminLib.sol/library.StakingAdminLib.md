# StakingAdminLib
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/49679f252829d0b3ac33cfb42d46070f8f7fbdc0/src/libraries/StakingAdminLib.sol)

**Title:**
StakingAdminLib

Linked library: admin, emergency, recovery, shutdown, and bad-debt execution bodies used via `DualPoolAdminModule` (`delegatecall` from core) or direct `external` calls from `DualPoolStakingOld`. Pool B fee sweeps live on the cores / admin module (`claimFees`) with CEI ordering.

Every `execute*` entrypoint assumes the caller has already enforced pause/emergency/role gates unless noted.


## Functions
### _requiredRewardBacking

Minimum TokenB balance required to cover principal, pending rewards, fees, and dust (used in recovery checks).


```solidity
function _requiredRewardBacking(PoolInfo storage poolA, PoolInfo storage poolB, uint256 unclaimedFeesB)
    private
    view
    returns (uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolA`|`PoolInfo`|Pool A storage.|
|`poolB`|`PoolInfo`|Pool B storage.|
|`unclaimedFeesB`|`uint256`|Reserved Pool B withdrawal fees not yet swept.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|Required TokenB backing in wei for solvent recovery checks.|


### _terminateEmission

Stops the active emission schedule so post-finalize user paths cannot accrue against swept `availableRewards`.


```solidity
function _terminateEmission(PoolInfo storage pool) private;
```

### _reservedEmissionBudget

Budget still scheduled for `[lastUpdateTime, periodFinish]` at `rewardRate`; must stay in `availableRewards`.


```solidity
function _reservedEmissionBudget(PoolInfo storage pool) private view returns (uint256);
```

### _movableRebalanceBudget

Max reward wei movable from `pool` without breaking its active or unfinished emission schedule.
Caller should run `PoolAccrualLib.updateGlobal` for both pools first so `lastUpdateTime` / `availableRewards` reflect accrual.


```solidity
function _movableRebalanceBudget(PoolInfo storage pool) private view returns (uint256);
```

### executeRebalanceBudgets

Moves `amount` of `availableRewards` from `from` pool to `to` pool (no bad debt, distinct pools).


```solidity
function executeRebalanceBudgets(
    PoolInfo storage poolA,
    PoolInfo storage poolB,
    Pool from,
    Pool to,
    uint256 amount,
    RewardReanchorLib.ReanchorCaps memory caps
) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolA`|`PoolInfo`|Pool A storage.|
|`poolB`|`PoolInfo`|Pool B storage.|
|`from`|`Pool`|Source pool enum.|
|`to`|`Pool`|Destination pool enum.|
|`amount`|`uint256`|Reward token wei to move between `availableRewards` buckets.|
|`caps`|`RewardReanchorLib.ReanchorCaps`||


### executeRecoverToken

Sweeps `p.token` to `p.to` if the amount is provably non-liability "excess" per pool accounting rules.


```solidity
function executeRecoverToken(PoolInfo storage poolA, PoolInfo storage poolB, RecoverTokenParams memory p) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolA`|`PoolInfo`|Pool A storage (TokenA principal liability).|
|`poolB`|`PoolInfo`|Pool B storage.|
|`p`|`RecoverTokenParams`|Recovery parameters (`RecoverTokenParams`).|


### executeForceShutdownFinalize

Terminal shutdown step: sweeps **non-user** reward token residue to `feeRecipient` and retains per-pool `totalPending` equal to booked user rewards.

`residual` is `availableRewards` + fee/dust buckets. If no principal remains staked, it also includes
orphan pending (`totalPending - bookedUserRewards`) because all withdraw paths settle users first. If the
deadlock bypass is used while stake remains, unsettled pending must stay in `totalPending` so remaining
stakers can later settle and claim pre-finalize rewards.


```solidity
function executeForceShutdownFinalize(
    PoolInfo storage poolA,
    PoolInfo storage poolB,
    ForceShutdownFinalizeParams memory p
) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolA`|`PoolInfo`|Pool A storage.|
|`poolB`|`PoolInfo`|Pool B storage.|
|`p`|`ForceShutdownFinalizeParams`|Shutdown finalization parameters (`ForceShutdownFinalizeParams`).|


### executeEmergencyWithdrawA

Emergency Pool A exit: returns principal and rebalances unpaid rewards into Pool B budget per rules.

Caller must run `PoolAccrualLib.updateGlobal` for both pools and `settleUser` for the exiting user (and peers if needed)
**before** this call so `userInfo.rewards` matches `accRewardPerToken` and `totalPending` is not left inconsistent.


```solidity
function executeEmergencyWithdrawA(
    PoolInfo storage poolA,
    PoolInfo storage poolB,
    mapping(address => UserInfo) storage userInfoA,
    EmergencyWithdrawAParams memory p,
    RewardReanchorLib.ReanchorCaps memory caps
) external returns (uint256 stakedAmount);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolA`|`PoolInfo`|Pool A storage.|
|`poolB`|`PoolInfo`|Pool B storage (receives rebalanced `availableRewards` from unpaid A rewards).|
|`userInfoA`|`mapping(address => UserInfo)`|Pool A user mapping.|
|`p`|`EmergencyWithdrawAParams`|Emergency parameters (`EmergencyWithdrawAParams`).|
|`caps`|`RewardReanchorLib.ReanchorCaps`||

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`stakedAmount`|`uint256`|TokenA principal returned to the user.|


### executeEmergencyWithdrawB

Emergency Pool B exit: returns principal, clears lock maps, and rebalances rewards similarly to Pool A path.

Same pre-condition as `executeEmergencyWithdrawA`: global accrual + `settleUser` for the claimant must run first.


```solidity
function executeEmergencyWithdrawB(
    PoolInfo storage poolB,
    mapping(address => UserInfo) storage userInfoB,
    mapping(address => uint256) storage unlockTimeB,
    mapping(address => uint256) storage stakeTimestampB,
    EmergencyWithdrawBParams memory p,
    RewardReanchorLib.ReanchorCaps memory caps
) external returns (uint256 stakedAmount);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolB`|`PoolInfo`|Pool B storage.|
|`userInfoB`|`mapping(address => UserInfo)`|Pool B user mapping.|
|`unlockTimeB`|`mapping(address => uint256)`|Pool B unlock map (zeroed for user).|
|`stakeTimestampB`|`mapping(address => uint256)`|Pool B weighted time map (zeroed for user).|
|`p`|`EmergencyWithdrawBParams`|Emergency parameters (`EmergencyWithdrawBParams`).|
|`caps`|`RewardReanchorLib.ReanchorCaps`||

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`stakedAmount`|`uint256`|TokenB principal returned to the user.|


### executeResolveBadDebt

Pulls reward tokens from `p.from` and applies them against `badDebt` buckets, refunding surplus to Pool B `availableRewards`.


```solidity
function executeResolveBadDebt(
    PoolInfo storage poolA,
    PoolInfo storage poolB,
    ResolveBadDebtParams memory p,
    RewardReanchorLib.ReanchorCaps memory caps
) external returns (ResolveBadDebtResult memory r);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolA`|`PoolInfo`|Pool A storage.|
|`poolB`|`PoolInfo`|Pool B storage.|
|`p`|`ResolveBadDebtParams`|Pull parameters (`ResolveBadDebtParams`).|
|`caps`|`RewardReanchorLib.ReanchorCaps`||

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`r`|`ResolveBadDebtResult`|Applied repayments per pool; any remainder after both debts is added to `poolB.availableRewards`.|


## Structs
### RecoverTokenParams
Parameters for `executeRecoverToken` (token-agnostic sweep with liability checks).


```solidity
struct RecoverTokenParams {
    /// @notice Reward token (TokenB) reference for backing math.
    IERC20 rewardToken;
    /// @notice Snapshot of `unclaimedFeesB` reserved in Pool B fee ledger.
    uint256 unclaimedFeesB;
    /// @notice ERC20 being recovered (may be TokenA, TokenB, or reward token).
    IERC20 token;
    /// @notice Recipient of recovered tokens (must be non-zero).
    address to;
    /// @notice Requested sweep amount (must be `<=` computed excess).
    uint256 amount;
}
```

### ForceShutdownFinalizeParams
Parameters for terminal shutdown finalization.


```solidity
struct ForceShutdownFinalizeParams {
    /// @notice Shutdown flag snapshot; must be true.
    bool shutdown;
    /// @notice Reward token used for residual sweep.
    IERC20 rewardToken;
    /// @notice Recipient of residual reward token balance after zeroing buckets.
    address feeRecipient;
    /// @notice Timestamp when shutdown was activated.
    uint256 shutdownAt;
    /// @notice Minimum time after `shutdownAt` before finalize (unless deadlock bypass applies).
    uint256 gracePeriod;
    /// @notice Absolute horizon after which finalize may proceed even if stake remains.
    uint256 deadlockBypass;
    /// @notice `unclaimedFeesB` captured at call time for residual accounting.
    uint256 unclaimedFeesAtCall;
    /// @notice Aggregate of all Pool A `userInfo.rewards` at call time (must remain claimable after finalize).
    uint256 bookedUserRewardsA;
    /// @notice Aggregate of all Pool B `userInfo.rewards` at call time.
    uint256 bookedUserRewardsB;
}
```

### EmergencyWithdrawAParams
Parameters for Pool A emergency principal exit.


```solidity
struct EmergencyWithdrawAParams {
    /// @notice Emergency flag must be true.
    bool emergencyMode;
    /// @notice Shutdown must be false for this path.
    bool shutdown;
    /// @notice User receiving principal and partial rewards per liquidity rules.
    address user;
    /// @notice FOT outbound tax ceiling for TokenA (`0` = standard ERC20).
    uint256 maxTransferFeeBP;
    /// @notice Basis-point denominator (`10_000`).
    uint256 basisPoints;
}
```

### EmergencyWithdrawBParams
Parameters for Pool B emergency principal exit.


```solidity
struct EmergencyWithdrawBParams {
    /// @notice Emergency flag must be true.
    bool emergencyMode;
    /// @notice Shutdown must be false for this path.
    bool shutdown;
    /// @notice User receiving principal and partial rewards per liquidity rules.
    address user;
    /// @notice FOT outbound tax ceiling for TokenB (`0` = standard ERC20).
    uint256 maxTransferFeeBP;
    /// @notice Basis-point denominator (`10_000`).
    uint256 basisPoints;
}
```

### ResolveBadDebtParams
Parameters for `executeResolveBadDebt` (pull + allocate).


```solidity
struct ResolveBadDebtParams {
    /// @notice Reward token pulled from `from`.
    IERC20 rewardToken;
    /// @notice Payer supplying reward tokens.
    address from;
    /// @notice Upper bound on tokens requested from payer.
    uint256 amount;
}
```

### ResolveBadDebtResult
Amounts applied toward Pool A / Pool B bad debt during `executeResolveBadDebt`.


```solidity
struct ResolveBadDebtResult {
    /// @notice Reward wei applied to Pool A `badDebt`.
    uint256 repayA;
    /// @notice Reward wei applied to Pool B `badDebt`.
    uint256 repayB;
}
```

