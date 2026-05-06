# PoolAccrualLib
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/c3cdaa9f3e5e324db578e81e0109756c6d9d8922/src/libraries/PoolAccrualLib.sol)

**Title:**
PoolAccrualLib

Linked library: global reward index updates and per-user reward settlement for one `PoolInfo`.

Declared `external` for separate bytecode; core or modules `delegatecall` into deployment copies. All math assumes `pool.totalStaked > 0` when advancing the index (guarded in `updateGlobal`).


## Functions
### settleUser

Accrues pending rewards for `user` against `pool.accRewardPerToken` using `precision` scaling.

If `user.staked == 0`, syncs `rewardPaid` to the current index without minting rewards.

Intent (M-3): PRD pseudocode sometimes defers `userRewardPaid` to the outer “Fail-safe” step; this implementation
**always** sets `rewardPaid := acc` here so every entrypoint shares one canonical snapshot after `_updateGlobal`,
avoiding double-count gaps when `earned == 0` from rounding and reducing duplicated SSTORE at call sites.


```solidity
function settleUser(
    PoolInfo storage pool,
    mapping(address => UserInfo) storage users,
    address user,
    uint256 precision
) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`pool`|`PoolInfo`|Pool storage whose `accRewardPerToken` is the index source.|
|`users`|`mapping(address => UserInfo)`|Per-address `UserInfo` mapping for the same pool.|
|`user`|`address`|Address to settle.|
|`precision`|`uint256`|Fixed-point scale (core uses `1e18`).|


### updateGlobal

Advances global reward index up to `min(block.timestamp, periodFinish)` and updates pending, bad debt, and dust buckets.

Uses `mulmod` remainder to increment `dust`; recycles dust into `availableRewards` once `dust >= dustTolerance`.


```solidity
function updateGlobal(PoolInfo storage pool, uint256 maxDeltaTime, uint256 precision, uint256 dustTolerance)
    external
    returns (GlobalEmit memory ge);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`pool`|`PoolInfo`|Pool storage to mutate (`rewardRate`, `lastUpdateTime`, `accRewardPerToken`, buckets).|
|`maxDeltaTime`|`uint256`|Upper bound on elapsed seconds applied in one call (overflow / fairness guard).|
|`precision`|`uint256`|Fixed-point scale for index math (matches `settleUser`).|
|`dustTolerance`|`uint256`|Minimum dust balance before sweeping dust back into `availableRewards`.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`ge`|`GlobalEmit`|Optional emission hints for shortfall and dust handling.|


## Structs
### GlobalEmit
Optional signals from `updateGlobal` for the caller to emit as diagnostic events.

`insufficient` / `shortfall` describe a budget shortfall vs `deltaReward`; `dust` / `dustWei` describe sub-threshold recycling.


```solidity
struct GlobalEmit {
    /// @notice True when `availableRewards` could not fully fund the accrued `deltaReward` for this step.
    bool insufficient;
    /// @notice Magnitude of reward liability that could not be funded from `availableRewards` (added to `badDebt`).
    uint256 shortfall;
    /// @notice True when truncated per-stake dust was non-zero but below `dustTolerance` (caller may emit once).
    bool dust;
    /// @notice Truncated dust amount in wei added to `pool.dust` for this step (when `dust` is true).
    uint256 dustWei;
}
```

