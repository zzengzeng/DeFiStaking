# PoolBWithdrawLib
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/699d0d97f5ced33dab5ac0c4d8ce25e0620ec92b/src/libraries/PoolBWithdrawLib.sol)

**Title:**
PoolBWithdrawLib

Linked library: Pool B withdraw, fees, penalties, and optional early-exit forfeiture logic.

Early exit before `unlockTimeB` forfeits accrued `userB.rewards` back to `availableRewards` and charges `penaltyfeeBP` on principal.
Outbound TokenB FOT tax is borne by the user (PRD §4.6); protocol fees stay on-contract.


## Functions
### _handleEarlyExit

Validates `minEarlyExitAmountB`, forfeits user rewards into `availableRewards`, and returns principal penalty.


```solidity
function _handleEarlyExit(PoolInfo storage poolB, UserInfo storage userB, WithdrawBParams memory p)
    private
    returns (uint256 penalty, uint256 forfeitedReward);
```

### _computeNormalFee

Tiered fee schedule: `< 90 days` uses `withdrawFeeBP`, `<= 180 days` uses `midTermFeeBP`, else `0`.


```solidity
function _computeNormalFee(uint256 holdingDuration, WithdrawBParams memory p) private pure returns (uint256 fee);
```

### executeWithdrawB

Withdraws Pool B principal for `p.user`, applying early/mid/normal fee rules and updating pool accounting.


```solidity
function executeWithdrawB(
    PoolInfo storage poolB,
    mapping(address => UserInfo) storage userInfoB,
    mapping(address => uint256) storage stakeTimestampB,
    mapping(address => uint256) storage unlockTimeB,
    WithdrawBParams memory p
) external returns (WithdrawBResult memory r);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`poolB`|`PoolInfo`|Pool B `PoolInfo` storage.|
|`userInfoB`|`mapping(address => UserInfo)`|Pool B user mapping.|
|`stakeTimestampB`|`mapping(address => uint256)`|Per-user weighted deposit time (must be non-zero for valid withdraw).|
|`unlockTimeB`|`mapping(address => uint256)`|Per-user unlock timestamp for early-exit detection.|
|`p`|`WithdrawBParams`|Withdraw parameters (`WithdrawBParams`).|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`r`|`WithdrawBResult`|Fee sweep hint, event aggregation fields, and early flag.|


## Structs
### WithdrawCalc
Intermediate fee/penalty breakdown for a single withdraw evaluation.


```solidity
struct WithdrawCalc {
    /// @notice Schedule-based withdraw fee (not early exit) in TokenB wei.
    uint256 fee;
    /// @notice Early-exit penalty on principal in TokenB wei.
    uint256 penalty;
    /// @notice True when `block.timestamp < unlockTimeB[user]`.
    bool isEarly;
}
```

### WithdrawBParams
Inputs for `executeWithdrawB`.


```solidity
struct WithdrawBParams {
    /// @notice Account whose Pool B stake is reduced.
    address user;
    /// @notice Principal amount to withdraw from `userB.staked`.
    uint256 amount;
    /// @notice Minimum principal for an early exit (anti-dust / rounding constraint).
    uint256 minEarlyExitAmountB;
    /// @notice Early-exit penalty basis points on principal.
    uint256 penaltyfeeBP;
    /// @notice Withdraw fee basis points for short holding durations.
    uint256 withdrawFeeBP;
    /// @notice Mid-term fee basis points for medium holding durations.
    uint256 midTermFeeBP;
    /// @notice Basis-point denominator (`10_000`).
    uint256 basisPoints;
    /// @notice Schedule caps for post-forfeiture `rewardRate` re-anchor.
    RewardReanchorLib.ReanchorCaps reanchorCaps;
    /// @notice FOT outbound tax ceiling (`0` = standard ERC20).
    uint256 maxTransferFeeBP;
}
```

### WithdrawBResult
Outputs for `executeWithdrawB` (caller aggregates fees into `unclaimedFeesB` if needed).


```solidity
struct WithdrawBResult {
    /// @notice Normal-path fee retained on-contract for later `claimFees` sweep.
    uint256 feeAddedToUnclaimed;
    /// @notice Sum of fee + penalty for a single analytics event field.
    uint256 feeOrPenaltyForEvent;
    /// @notice Whether the withdraw used early-exit semantics.
    bool isEarlyForEvent;
    /// @notice Pool B rewards moved from pending into `availableRewards` on early exit (`0` if not early / no rewards).
    uint256 forfeitedRewardsB;
}
```

