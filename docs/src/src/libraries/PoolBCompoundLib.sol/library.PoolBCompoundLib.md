# PoolBCompoundLib
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/c3cdaa9f3e5e324db578e81e0109756c6d9d8922/src/libraries/PoolBCompoundLib.sol)

**Title:**
PoolBCompoundLib

Linked library: compound accrued rewards from both pools into Pool B stake (no external token pull).

Debits `totalPending` on both pools and increases `userB.staked` / `poolB.totalStaked` by the sum of settled rewards.


## Functions
### _updateRollingLock

Same rolling-lock rule as `PoolBStakeLib._updateRollingLock`.


```solidity
function _updateRollingLock(uint256 oldUnlockTime, uint256 _lockDuration) private view returns (uint256);
```

### _updateWADP

Same weighted-average timestamp rule as `PoolBStakeLib._updateWADP`.


```solidity
function _updateWADP(uint256 oldStaked, uint256 oldTimestamp, uint256 addedAmount) private view returns (uint256);
```

### _applyCompoundIntoPoolB

Mutates Pool B stake, TVL, lock maps, and optionally recomputes `rewardRate` when Pool B was empty.


```solidity
function _applyCompoundIntoPoolB(
    PoolInfo storage poolB,
    UserInfo storage userB,
    mapping(address => uint256) storage unlockTimeB,
    mapping(address => uint256) storage stakeTimestampB,
    address user,
    uint256 lockDuration,
    uint256 compoundTotal
) private returns (uint256 newUserStakedB, uint256 newUnlockTimeB);
```

### executeCompoundB

Converts settled rewards in Pool A and B for `p.user` into additional Pool B principal.


```solidity
function executeCompoundB(
    PoolInfo storage poolA,
    PoolInfo storage poolB,
    mapping(address => UserInfo) storage userInfoA,
    mapping(address => UserInfo) storage userInfoB,
    mapping(address => uint256) storage unlockTimeB,
    mapping(address => uint256) storage stakeTimestampB,
    mapping(address => uint256) storage lastClaimTime,
    CompoundBParams memory p
) external returns (CompoundBResult memory r);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolA`|`PoolInfo`|Pool A storage (pending debited by `rewardA`).|
|`poolB`|`PoolInfo`|Pool B storage (pending debited by `rewardB`; stake increased by sum).|
|`userInfoA`|`mapping(address => UserInfo)`|Pool A user mapping.|
|`userInfoB`|`mapping(address => UserInfo)`|Pool B user mapping.|
|`unlockTimeB`|`mapping(address => uint256)`|Pool B unlock map.|
|`stakeTimestampB`|`mapping(address => uint256)`|Pool B weighted deposit time map.|
|`lastClaimTime`|`mapping(address => uint256)`|Global per-user cooldown map.|
|`p`|`CompoundBParams`|Compound parameters (`CompoundBParams`).|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`r`|`CompoundBResult`|Amounts rolled and post-state stake / unlock snapshot.|


## Structs
### CompoundBParams
Inputs for `executeCompoundB`.


```solidity
struct CompoundBParams {
    /// @notice User whose rewards are converted to Pool B principal.
    address user;
    /// @notice Rolling lock duration applied after compounding (same semantics as stake).
    uint256 lockDuration;
}
```

### CompoundBResult
Result of a compound operation for events and UI.


```solidity
struct CompoundBResult {
    /// @notice Pool A reward component rolled into stake (wei).
    uint256 rewardA;
    /// @notice Pool B reward component rolled into stake (wei).
    uint256 rewardB;
    /// @notice User’s total Pool B stake after compounding.
    uint256 newUserStakedB;
    /// @notice User’s `unlockTimeB` after applying rolling lock.
    uint256 newUnlockTimeB;
}
```

