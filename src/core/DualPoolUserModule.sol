// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {DualPoolRewardEngine} from "./DualPoolRewardEngine.sol";
import {Pool, PoolInfo} from "../StakeTypes.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract DualPoolUserModule is DualPoolRewardEngine {
    using SafeERC20 for IERC20;

    function stakeA(uint256 amount) external {
        if (paused() || emergencyMode || shutdownMode) revert WrongState();
        if (amount == 0) revert ZeroAmount();

        _updateGlobalA();
        _settleUserA(msg.sender);

        IERC20 token = poolA.stakingToken;
        uint256 payerBefore = token.balanceOf(msg.sender);
        uint256 coreBefore = token.balanceOf(address(this));

        token.safeTransferFrom(msg.sender, address(this), amount);

        uint256 payerAfter = token.balanceOf(msg.sender);
        uint256 coreAfter = token.balanceOf(address(this));

        uint256 paid = payerBefore - payerAfter;
        uint256 received = coreAfter - coreBefore;

        if (paid != amount) revert PayerDeductionMismatch();
        if (received == 0 || received > amount) revert ReceivedExceedsAmount();
        if ((amount - received) * BASIS_POINTS > amount * maxTransferFeeBP) revert FeeExceedsCap();

        if (received < poolA.minStakeAmount) revert BelowMinStake();
        if (poolA.totalStaked + received > MAX_REWARD_SHARES_A) revert RewardShareLimit();
        if (poolA.maxTVLCap != 0 && poolA.totalStaked + received > poolA.maxTVLCap) revert CapExceeded();

        userInfoA[msg.sender].rewardPaid = poolA.accRewardPerToken;

        userInfoA[msg.sender].staked += received;
        poolA.totalStaked += received;

        if (token.balanceOf(address(this)) < poolA.totalStaked) revert InsufficientCoverage();

        emit Staked(msg.sender, Pool.A, received, 0);
    }

    function stakeB(uint256 amount) external {
        if (paused() || emergencyMode || shutdownMode) revert WrongState();
        if (amount == 0) revert ZeroAmount();

        _updateGlobalB();
        _settleUserB(msg.sender);

        IERC20 token = poolB.stakingToken;
        uint256 payerBefore = token.balanceOf(msg.sender);
        uint256 coreBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);

        uint256 payerAfter = token.balanceOf(msg.sender);
        uint256 coreAfter = token.balanceOf(address(this));

        uint256 paid = payerBefore - payerAfter;
        uint256 received = coreAfter - coreBefore;

        if (paid != amount) revert PayerDeductionMismatch();
        if (received == 0 || received > amount) revert ReceivedExceedsAmount();
        if ((amount - received) * BASIS_POINTS > amount * maxTransferFeeBP) revert FeeExceedsCap();

        if (received < poolB.minStakeAmount) revert BelowMinStake();
        if (received + poolB.totalStaked > MAX_REWARD_SHARES_B) revert RewardShareLimit();
        if (poolB.maxTVLCap != 0 && received + poolB.totalStaked > poolB.maxTVLCap) revert CapExceeded();

        uint256 oldStaked = userInfoB[msg.sender].staked;
        uint256 oldTs = stakeTimestampB[msg.sender];
        stakeTimestampB[msg.sender] = _updateWADP(oldStaked, oldTs, received);

        userInfoB[msg.sender].rewardPaid = poolB.accRewardPerToken;
        userInfoB[msg.sender].staked += received;
        poolB.totalStaked += received;

        unlockTimeB[msg.sender] = _updateRollingLock(unlockTimeB[msg.sender], lockDuration);

        _assertInvariantB();

        emit Staked(msg.sender, Pool.B, received, unlockTimeB[msg.sender]);
    }

    function _updateWADP(uint256 oldStaked, uint256 oldTimestamp, uint256 addedAmount)
        internal
        view
        returns (uint256 newTimestamp)
    {
        if (oldStaked == 0) return block.timestamp;
        if (addedAmount == 0) return oldTimestamp;
        if (oldTimestamp > block.timestamp) revert InvalidStakeTimestamp();
        return oldTimestamp
            + Math.mulDiv(addedAmount, (block.timestamp - oldTimestamp), oldStaked + addedAmount, Math.Rounding.Ceil);
    }

    function _updateRollingLock(uint256 _oldUnlockTime, uint256 _lockDuration)
        internal
        view
        returns (uint256 newUnlockTimeB)
    {
        uint256 fromNow = block.timestamp + _lockDuration;
        return _oldUnlockTime > fromNow ? _oldUnlockTime : fromNow;
    }
}
