# UserInfo
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/49679f252829d0b3ac33cfb42d46070f8f7fbdc0/src/StakeTypes.sol)

Per-user staking and reward checkpoint for one pool (mirrored in `userInfoA` / `userInfoB` mappings on the core).


```solidity
struct UserInfo {
/// @notice User principal staked in the pool (FOT inbound: balance-delta net credited).
uint256 staked;
/// @notice Accrued rewards not yet paid out (after settlement); claim/force-claim transfers this gross amount (FOT outbound tax borne by user).
uint256 rewards;
/// @notice Last `accRewardPerToken` applied to this user (reward debt / paid index).
uint256 rewardPaid;
}
```

