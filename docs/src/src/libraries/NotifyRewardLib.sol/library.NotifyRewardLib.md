# NotifyRewardLib
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/c3cdaa9f3e5e324db578e81e0109756c6d9d8922/src/libraries/NotifyRewardLib.sol)

**Title:**
NotifyRewardLib

Linked library: reward rate and pool accounting updates for `notifyRewardAmount*`.

Token pulls must occur in the **core** contract before `delegatecall` into the admin module that calls this library, so ERC20 `transferFrom` sees the core as `msg.sender` where applicable.


## Functions
### applyNotifyAccounting

Applies a new reward schedule: merges leftover emissions, sets `rewardRate`, extends `periodFinish`, and credits `availableRewards`.


```solidity
function applyNotifyAccounting(
    PoolInfo storage pool,
    uint256 actualAmount,
    uint256 duration,
    uint256 maxAprBp,
    uint256 basisPoints,
    uint256 secondsPerYear,
    uint256 maxTotalSupplyBForRewardRateCap
) external returns (NotifyResult memory r);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`pool`|`PoolInfo`|Pool storage to mutate.|
|`actualAmount`|`uint256`|Reward tokens already received by the core (balance delta).|
|`duration`|`uint256`|New emission duration in seconds.|
|`maxAprBp`|`uint256`|Maximum APR in basis points for rate-cap math.|
|`basisPoints`|`uint256`|`10_000` for bp conversions.|
|`secondsPerYear`|`uint256`|Seconds per year for APR cap derivation.|
|`maxTotalSupplyBForRewardRateCap`|`uint256`|Supply ceiling used in max-rate formula.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`r`|`NotifyResult`|Result carrying `actualAmount` and `newRate` after checks.|


## Structs
### NotifyResult
Outputs from `applyNotifyAccounting` (actual funded amount and new rate).


```solidity
struct NotifyResult {
    /// @notice Reward tokens observed as received (balance delta) passed through to schedule math.
    uint256 actualAmount;
    /// @notice Post-merge emission rate `(actualAmount + leftover) / duration`.
    uint256 newRate;
}
```

