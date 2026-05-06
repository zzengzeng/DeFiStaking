# UserInfo
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/c3cdaa9f3e5e324db578e81e0109756c6d9d8922/src/StakeTypes.sol)

Per-user staking and reward checkpoint for one pool (mirrored in `userInfoA` / `userInfoB` mappings on the core).


```solidity
struct UserInfo {
/// @notice User principal staked in the pool.
uint256 staked;
/// @notice Accrued rewards not yet paid out (after settlement).
uint256 rewards;
/// @notice Last `accRewardPerToken` applied to this user (reward debt / paid index).
uint256 rewardPaid;
}
```

