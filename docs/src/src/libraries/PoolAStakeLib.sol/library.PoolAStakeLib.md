# PoolAStakeLib
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/c3cdaa9f3e5e324db578e81e0109756c6d9d8922/src/libraries/PoolAStakeLib.sol)

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
    uint256 amount
) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolA`|`PoolInfo`|Pool A `PoolInfo` storage.|
|`userInfoA`|`mapping(address => UserInfo)`|Pool A per-user mapping.|
|`user`|`address`|Account whose stake is reduced.|
|`amount`|`uint256`|Principal amount to withdraw (must be `> 0` and `<= user.staked`).|


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
}
```

