# PoolInfo
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/c3cdaa9f3e5e324db578e81e0109756c6d9d8922/src/StakeTypes.sol)

On-chain accounting snapshot for one pool (staking asset, issuance state, caps).

Field semantics align with `PoolAccrualLib`, stake/withdraw libs, and admin notify paths.


```solidity
struct PoolInfo {
/// @notice ERC20 staked in this pool (TokenA for A, TokenB for B).
IERC20 stakingToken;
/// @notice Total principal currently staked in the pool.
uint256 totalStaked;
/// @notice Rewards emitted per second toward stakers during the active period.
uint256 rewardRate;
/// @notice Last timestamp global index was advanced to.
uint256 lastUpdateTime;
/// @notice Cumulative reward per staked token (scaled by `PRECISION` on the core).
uint256 accRewardPerToken;
/// @notice Reward budget not yet scheduled into pending liabilities.
uint256 availableRewards;
/// @notice End timestamp of the current reward period (0 if none).
uint256 periodFinish;
/// @notice Shortfall tallied when budget cannot cover accrual (bad debt).
uint256 badDebt;
/// @notice Rewards promised to stakers but not yet claimed (pending bucket).
uint256 totalPending;
/// @notice Sub-wei remainder bucket recycled when above dust tolerance.
uint256 dust;
/// @notice Optional TVL cap for the pool (`totalStaked` ceiling); `0` is treated as uncapped by stake libraries and the cores.
uint256 tvlCap;
/// @notice Minimum stake per transaction for the pool.
uint256 minStakeAmount;
/// @notice Default reward duration parameter used by notify / admin flows.
uint256 rewardDuration;
}
```

