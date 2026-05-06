# PoolSingleClaimLib
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/c3cdaa9f3e5e324db578e81e0109756c6d9d8922/src/libraries/PoolSingleClaimLib.sol)

**Title:**
PoolSingleClaimLib

Linked library: single-pool reward claim with min-claim, bad-debt, and on-hand liquidity checks.

Pays out the core `rewardToken` (TokenB); requires `balanceOf(this) >= reward` after pending accounting.


## Functions
### executeClaim

Pays `userInfo.rewards` to `p.claimer` in reward token if all checks pass; updates pending and cooldown.


```solidity
function executeClaim(
    PoolInfo storage pool,
    UserInfo storage userInfo,
    mapping(address => uint256) storage lastClaimTime,
    ClaimParams memory p
) external returns (uint256 reward);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`pool`|`PoolInfo`|Pool being claimed against (A or B).|
|`userInfo`|`UserInfo`|User ledger row for that pool.|
|`lastClaimTime`|`mapping(address => uint256)`|Per-user cooldown map (keyed by `p.claimer`).|
|`p`|`ClaimParams`|Claim parameters (`ClaimParams`).|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`reward`|`uint256`|Amount transferred out (equals pre-call `userInfo.rewards`).|


## Structs
### ClaimParams
Static parameters for `executeClaim` (global config + cross-pool bad-debt guard).


```solidity
struct ClaimParams {
    /// @notice ERC20 used for payout (TokenB).
    IERC20 rewardToken;
    /// @notice Address receiving the transfer (also used as `lastClaimTime` key).
    address claimer;
    /// @notice Minimum `userInfo.rewards` for a successful claim (unless bypassed at a higher layer).
    uint256 minClaimAmount;
    /// @notice Pool A `badDebt` snapshot; both must be zero to allow claim.
    uint256 badDebtPoolA;
    /// @notice Pool B `badDebt` snapshot; both must be zero to allow claim.
    uint256 badDebtPoolB;
}
```

