// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {PoolInfo, UserInfo} from "../StakeTypes.sol";
import {StakingExecutionErrors} from "../StakingExecutionErrors.sol";

/// @title PoolAStakeLib
/// @notice Linked library: Pool A stake and withdraw execution bodies (TokenA principal, no lock map).
/// @dev Stake path measures **received** TokenA via balance delta to tolerate fee-on-transfer tokens within `maxTransferFeeBP`.
library PoolAStakeLib {
    using SafeERC20 for IERC20;

    /// @notice Inputs for `executeStakeA` (fee-on-transfer tolerance parameters included).
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

    /// @notice Withdraws Pool A principal for `user`, updating totals and transferring TokenA.
    /// @dev Resets `user.rewardPaid` to the current global index (rewards remain in `user.rewards` unless separately claimed).
    /// @param poolA Pool A `PoolInfo` storage.
    /// @param userInfoA Pool A per-user mapping.
    /// @param user Account whose stake is reduced.
    /// @param amount Principal amount to withdraw (must be `> 0` and `<= user.staked`).
    function executeWithdrawA(
        PoolInfo storage poolA,
        mapping(address => UserInfo) storage userInfoA,
        address user,
        uint256 amount
    ) external {
        UserInfo storage userA = userInfoA[user];
        if (amount == 0) {
            revert StakingExecutionErrors.ZeroAmount();
        }
        if (userA.staked < amount) {
            revert StakingExecutionErrors.InsufficientBalance(amount, userA.staked);
        }

        userA.staked -= amount;
        userA.rewardPaid = poolA.accRewardPerToken;
        poolA.totalStaked -= amount;
        poolA.stakingToken.safeTransfer(user, amount);
    }

    /// @notice Stakes Pool A for `p.user`; returns actually received amount after FOT checks.
    /// @param poolA Pool A `PoolInfo` storage (must use TokenA as `stakingToken`).
    /// @param userInfoA Pool A per-user mapping.
    /// @param p Packed stake parameters (`StakeAParams`).
    /// @return received Token amount credited to the user after `transferFrom` balance delta.
    function executeStakeA(
        PoolInfo storage poolA,
        mapping(address => UserInfo) storage userInfoA,
        StakeAParams memory p
    ) external returns (uint256 received) {
        bool isFirstDeposit = (poolA.totalStaked == 0);
        UserInfo storage userA = userInfoA[p.user];
        uint256 balBefore = poolA.stakingToken.balanceOf(address(this));
        poolA.stakingToken.safeTransferFrom(p.user, address(this), p.amountRequested);
        received = poolA.stakingToken.balanceOf(address(this)) - balBefore;

        if (received == 0) {
            revert StakingExecutionErrors.ZeroReceived();
        }
        if (received * p.basisPoints < p.amountRequested * (p.basisPoints - p.maxTransferFeeBP)) {
            revert StakingExecutionErrors.ExcessiveTransferFee();
        }
        if (received < poolA.minStakeAmount) {
            revert StakingExecutionErrors.BelowMinStake();
        }
        if (poolA.tvlCap != 0 && poolA.totalStaked + received > poolA.tvlCap) {
            revert StakingExecutionErrors.ExceedsTVLCap();
        }

        userA.staked += received;
        userA.rewardPaid = poolA.accRewardPerToken;
        poolA.totalStaked += received;

        uint256 remainingTime = poolA.periodFinish > block.timestamp ? poolA.periodFinish - block.timestamp : 0;
        if (isFirstDeposit && poolA.totalStaked > 0 && remainingTime > 0) {
            poolA.rewardRate = poolA.availableRewards / remainingTime;
        }
    }
}
