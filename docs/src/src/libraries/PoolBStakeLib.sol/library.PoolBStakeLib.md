# PoolBStakeLib
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/c3cdaa9f3e5e324db578e81e0109756c6d9d8922/src/libraries/PoolBStakeLib.sol)

**Title:**
PoolBStakeLib

Linked library: Pool B stake after global accrual has been updated (`executeStakeB`).

Updates rolling `unlockTimeB` and weighted-average `stakeTimestampB` used by withdraw fee / penalty logic.


## Functions
### _updateRollingLock

`max(oldUnlock, now + lockDuration)` — later unlock wins to avoid shortening an existing lock.


```solidity
function _updateRollingLock(uint256 oldUnlockTime, uint256 _lockDuration) private view returns (uint256);
```

### _updateWADP

Weighted-average “deposit time” used as Pool B holding-duration reference on non-early withdrawals.


```solidity
function _updateWADP(uint256 oldStaked, uint256 oldTimestamp, uint256 addedAmount) private view returns (uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`oldStaked`|`uint256`|User stake before this deposit.|
|`oldTimestamp`|`uint256`|Prior weighted timestamp (`0`/`unset` treated as fresh stake path).|
|`addedAmount`|`uint256`|New principal credited this call.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|New weighted timestamp in seconds (unix time scale).|


### _pullAndValidateStake

Pulls TokenB via `transferFrom` and enforces FOT bounds, `minStakeAmount`, and `tvlCap`.


```solidity
function _pullAndValidateStake(PoolInfo storage poolB, StakeBParams memory p) private returns (uint256 received);
```

### executeStakeB

Pulls TokenB stake for `p.user`, updates TVL, weighted stake timestamp, and rolling unlock.


```solidity
function executeStakeB(
    PoolInfo storage poolB,
    mapping(address => UserInfo) storage userInfoB,
    mapping(address => uint256) storage unlockTimeB,
    mapping(address => uint256) storage stakeTimestampB,
    StakeBParams memory p
) external returns (StakeBResult memory r);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolB`|`PoolInfo`|Pool B `PoolInfo` (TokenB as `stakingToken`).|
|`userInfoB`|`mapping(address => UserInfo)`|Pool B user mapping.|
|`unlockTimeB`|`mapping(address => uint256)`|Per-user rolling unlock map.|
|`stakeTimestampB`|`mapping(address => uint256)`|Per-user weighted-average deposit time map.|
|`p`|`StakeBParams`|Stake parameters (`StakeBParams`).|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`r`|`StakeBResult`|Received amount and post-update unlock time.|


## Structs
### StakeBParams
Arguments for `executeStakeB`.


```solidity
struct StakeBParams {
    /// @notice Beneficiary whose Pool B ledger and lock maps are updated.
    address user;
    /// @notice Amount passed to `transferFrom` on TokenB.
    uint256 amountRequested;
    /// @notice Seconds to extend rolling unlock from `max(now, oldUnlock)`.
    uint256 lockDuration;
    /// @notice Maximum implied FOT fee in basis points vs `amountRequested`.
    uint256 maxTransferFeeBP;
    /// @notice Basis-point denominator (typically `10_000`).
    uint256 basisPoints;
}
```

### StakeBResult
Return data: received principal and updated unlock timestamp.


```solidity
struct StakeBResult {
    /// @notice TokenB amount credited after balance-delta validation.
    uint256 received;
    /// @notice User’s `unlockTimeB` after applying rolling lock rules.
    uint256 newUnlockTime;
}
```

