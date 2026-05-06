# Pool
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/c3cdaa9f3e5e324db578e81e0109756c6d9d8922/src/StakeTypes.sol)

**Title:**
StakeTypes

Shared enums and structs for dual-pool staking (`DualPoolStaking`, `DualPoolStakingOld`, delegate modules, and linked libraries).

Logical pool identifier: Pool A stakes TokenA; Pool B stakes TokenB (the same asset used for reward distribution).

All structs are intentionally plain data carriers; mutators live in the core or libraries. Field units are always the relevant token’s smallest unit unless noted.


```solidity
enum Pool {
/// @notice Pool A: `stakingToken` is TokenA; rewards are denominated and paid in TokenB.
A,
/// @notice Pool B: `stakingToken` is TokenB; rewards share the same 18-decimal fixed-point math as Pool A liabilities.
B
}
```

