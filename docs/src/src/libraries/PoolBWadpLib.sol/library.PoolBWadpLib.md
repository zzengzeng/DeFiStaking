# PoolBWadpLib
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/699d0d97f5ced33dab5ac0c4d8ce25e0620ec92b/src/libraries/PoolBWadpLib.sol)

**Title:**
PoolBWadpLib

Weighted-average deposit timestamp (WADP) for Pool B fee tier / holding-duration math.

Uses **ceiling** division so each update loses at most one second of upward bias instead of flooring toward older
timestamps. Floor bias made `stakeTimestampB` systematically low, inflating `holdingDuration` and pushing users into
lower withdraw-fee tiers early—especially under many small stakes where truncation compounded.


## Functions
### weightedAvgDepositTimestamp

Next weighted-average unix timestamp after adding `addedAmount` at `currentTimestamp`.


```solidity
function weightedAvgDepositTimestamp(
    uint256 oldStaked,
    uint256 oldTimestamp,
    uint256 addedAmount,
    uint256 currentTimestamp
) internal pure returns (uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`oldStaked`|`uint256`|User Pool B principal before this increment.|
|`oldTimestamp`|`uint256`|Prior WADP (`0` means treat as fresh-only path via `oldStaked == 0`).|
|`addedAmount`|`uint256`|New principal wei credited this step.|
|`currentTimestamp`|`uint256`|Reference time for the new leg (caller passes `block.timestamp`).|


