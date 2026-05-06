# PendingOp
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/c3cdaa9f3e5e324db578e81e0109756c6d9d8922/src/StakeTypes.sol)

Optional on-chain record for a timelocked governance operation (`pendingOps[opId]` on the cores).

`executeAfter` and `paramsHash` are written by higher-level governance scripts; cancellation clears the slot.


```solidity
struct PendingOp {
/// @notice Earliest timestamp at which the op may execute (0 if unset / cleared).
uint256 executeAfter;
/// @notice Commitment hash of encoded parameters (for cancellation / audit).
bytes32 paramsHash;
}
```

