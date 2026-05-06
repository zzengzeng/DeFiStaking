# ForceClaimAllLib
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/c3cdaa9f3e5e324db578e81e0109756c6d9d8922/src/libraries/ForceClaimAllLib.sol)

**Title:**
ForceClaimAllLib

Linked library: `forceClaimAll` settlement across pools with partial pay, debt, and dust handling.

Computes spendable TokenB as `balance - (poolB.totalStaked + unclaimedFeesB)` then allocates sequentially to Pool A then B rewards.


## Functions
### _applyUnpaidToDebtAndDust

Applies unpaid amounts first against `badDebt` (per pool), then remainder into `dust` buckets.


```solidity
function _applyUnpaidToDebtAndDust(PoolInfo storage poolA, PoolInfo storage poolB, ForceClaimResult memory r)
    private;
```

### executeForceClaimAll

Settles both pools’ rewards for `p.user` under shutdown / liquidity rules; may pay partially.


```solidity
function executeForceClaimAll(
    PoolInfo storage poolA,
    PoolInfo storage poolB,
    mapping(address => UserInfo) storage userInfoA,
    mapping(address => UserInfo) storage userInfoB,
    mapping(address => uint256) storage lastClaimTime,
    ForceClaimParams memory p
) external returns (ForceClaimResult memory r);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolA`|`PoolInfo`|Pool A storage.|
|`poolB`|`PoolInfo`|Pool B storage.|
|`userInfoA`|`mapping(address => UserInfo)`|Pool A user mapping.|
|`userInfoB`|`mapping(address => UserInfo)`|Pool B user mapping.|
|`lastClaimTime`|`mapping(address => uint256)`|Per-user cooldown map.|
|`p`|`ForceClaimParams`|Force-claim parameters (`ForceClaimParams`).|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`r`|`ForceClaimResult`|Paid and unpaid splits after mutating pending and user rewards.|


## Structs
### ForceClaimParams
Inputs for `executeForceClaimAll`.


```solidity
struct ForceClaimParams {
    /// @notice Reward / TokenB asset used for payout.
    IERC20 rewardToken;
    /// @notice User whose both pools’ `rewards` fields are cleared.
    address user;
    /// @notice Minimum total claimable to allow force path when no bad debt and not shutdown.
    uint256 minClaimAmount;
    /// @notice Pool B fees reserved on-contract (reduces spendable remainder in liability calc).
    uint256 unclaimedFeesB;
    /// @notice When true, bypasses `BelowMinClaim` for small totals if bad debt is also zero (see revert tree).
    bool shutdown;
}
```

### ForceClaimResult
Partial payment breakdown for analytics and dust/bad-debt routing.


```solidity
struct ForceClaimResult {
    /// @notice Pool A reward component actually paid in TokenB.
    uint256 payA;
    /// @notice Pool B reward component actually paid in TokenB.
    uint256 payB;
    /// @notice Pool A reward shortfall vs full `userA.rewards` before settlement.
    uint256 unpaidA;
    /// @notice Pool B reward shortfall vs full `userB.rewards` before settlement.
    uint256 unpaidB;
}
```

