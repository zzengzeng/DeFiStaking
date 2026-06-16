# PoolAStakeLib
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/699d0d97f5ced33dab5ac0c4d8ce25e0620ec92b/src/libraries/PoolAStakeLib.sol)

**Title:**
PoolAStakeLib

Linked library: Pool A stake and withdraw execution bodies (TokenA principal, no lock map).

Stake path measures **received** TokenA via balance delta to tolerate fee-on-transfer tokens within `maxTransferFeeBP`.


## Functions
### executeWithdrawA

Withdraws Pool A principal for `user`, updating totals and transferring TokenA.

Resets `user.rewardPaid` to the current global index (rewards remain in `user.rewards` unless separately claimed).


```solidity
function executeWithdrawA(
    PoolInfo storage poolA,
    mapping(address => UserInfo) storage userInfoA,
    address user,
    uint256 amount,
    uint256 maxTransferFeeBP,
    uint256 basisPoints
) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolA`|`PoolInfo`|Pool A `PoolInfo` storage.|
|`userInfoA`|`mapping(address => UserInfo)`|Pool A per-user mapping.|
|`user`|`address`|Account whose stake is reduced.|
|`amount`|`uint256`|Principal amount to withdraw (must be `> 0` and `<= user.staked`).|
|`maxTransferFeeBP`|`uint256`|FOT outbound tax ceiling for TokenA (`0` = standard ERC20).|
|`basisPoints`|`uint256`|Basis-point denominator (`10_000`).|


### executeStakeA

Stakes Pool A for `p.user`; returns actually received amount after FOT checks.


```solidity
function executeStakeA(
    PoolInfo storage poolA,
    mapping(address => UserInfo) storage userInfoA,
    StakeAParams memory p
) external returns (uint256 received);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolA`|`PoolInfo`|Pool A `PoolInfo` storage (must use TokenA as `stakingToken`).|
|`userInfoA`|`mapping(address => UserInfo)`|Pool A per-user mapping.|
|`p`|`StakeAParams`|Packed stake parameters (`StakeAParams`).|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`received`|`uint256`|Token amount credited to the user after `transferFrom` balance delta.|


## Structs
### StakeAParams
Inputs for `executeStakeA` (fee-on-transfer tolerance parameters included).


```solidity
struct StakeAParams {
    /// @notice Beneficiary whose `userInfoA` and `poolA.totalStaked` are updated.
    address user;
    /// @notice Amount passed to `transferFrom` (may exceed post-fee received amount).
    uint256 amountRequested;
    /// @notice Maximum implied transfer fee in basis points accepted vs `amountRequested`.
    uint256 maxTransferFeeBP;
    /// @notice Denominator for basis-point checks (typically `10_000`).
    uint256 basisPoints;
    /// @notice Minimum notify duration / re-anchor window (matches core `MIN_REWARD_RATE_DURATION`).
    uint256 minRewardRateDuration;
    /// @notice Maximum reward schedule length (matches core `MAX_DURATION`).
    uint256 maxRewardDuration;
    /// @notice Max APR in basis points for rate cap (matches core `MAX_APR_BP`).
    uint256 maxAprBp;
    /// @notice Seconds per year for APR cap (matches core `SECONDS_PER_YEAR`).
    uint256 secondsPerYear;
    /// @notice Deploy-time TokenB supply ceiling for max reward rate (matches core cap).
    uint256 maxTotalSupplyBForRewardRateCap;
}
```

