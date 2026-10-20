# ForceClaimAllLib
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/49679f252829d0b3ac33cfb42d46070f8f7fbdc0/src/libraries/ForceClaimAllLib.sol)

**Title:**
ForceClaimAllLib

Linked library: `forceClaimAll` settlement across pools with partial pay, debt, and dust handling.

Liquidation policy: spendable TokenB is `balance - (poolB.totalStaked + unclaimedFeesB)`, then allocated
sequentially to Pool A then Pool B rewards. It intentionally does not reserve `availableRewards` because this
path is available only during shutdown or bad debt, where unpaid user rewards take priority over future budgets.


## Functions
### _applyUnpaidToDebtAndDust

Applies unpaid amounts first against `badDebt` (per pool), then remainder into `dust` buckets.


```solidity
function _applyUnpaidToDebtAndDust(PoolInfo storage poolA, PoolInfo storage poolB, ForceClaimResult memory r)
    private;
```

### executeForceClaimAll

Settles both pools’ rewards for `p.user`; may pay partially when liquidity is short.

When **not** `shutdown` and both pools have zero `badDebt`, each pool with `rewards > 0` must be `>= minClaimAmount`
(same anti-dust rule as single-pool claims—cannot sum two sub-threshold pools via this path). Shutdown or any pool
bad debt relaxes that check so small balances can still be cleared with partial pay.


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
    /// @notice Minimum claim threshold (wei); **per-pool** when `!shutdown` and no bad debt—same semantics as `claimA`/`claimB`.
    uint256 minClaimAmount;
    /// @notice Pool B fees reserved on-contract (reduces spendable remainder in liability calc).
    uint256 unclaimedFeesB;
    /// @notice When true, bypasses `BelowMinClaim` for small totals if bad debt is also zero (see revert tree).
    bool shutdown;
    /// @notice FOT outbound tax ceiling (`0` = standard ERC20).
    uint256 maxTransferFeeBP;
    /// @notice Basis-point denominator (`10_000`).
    uint256 basisPoints;
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

