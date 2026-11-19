// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {DualPoolRewardEngine} from "./DualPoolRewardEngine.sol";
import {Pool, PoolInfo, UserInfo} from "../StakeTypes.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IDualPoolUserModule} from "../interfaces/IDualPoolUserModule.sol";

contract DualPoolUserModule is DualPoolRewardEngine, IDualPoolUserModule {
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

    function withdrawA(uint256 amount) external {
        if (emergencyMode && !shutdownMode) revert EmergencyStatus();
        if (!shutdownMode && paused()) revert PausedStatus();

        if (amount == 0 || amount > userInfoA[msg.sender].staked) revert InvalidAmount();

        _updateGlobalA();
        _settleUserA(msg.sender);

        uint256 balance = poolA.stakingToken.balanceOf(address(this));
        if (balance < poolA.totalStaked) {
            revert PrincipalDeficit(Pool.A, balance, poolA.totalStaked);
        }

        userInfoA[msg.sender].staked -= amount;
        poolA.totalStaked -= amount;

        _transferGross(poolA.stakingToken, msg.sender, amount);

        emit Withdrawn(msg.sender, Pool.A, amount, 0, false);
    }

    function withdrawB(uint256 amount) external {
        if (emergencyMode && !shutdownMode) revert EmergencyStatus();
        if (!shutdownMode && paused()) revert PausedStatus();

        if (amount == 0 || amount > userInfoB[msg.sender].staked) revert InvalidAmount();

        _updateGlobalB();
        _settleUserB(msg.sender);

        PoolInfo storage poolInfo = _pool(Pool.B);
        UserInfo storage userInfo = userInfoB[msg.sender];

        uint256 feeOrPenalty;
        bool isEarly = block.timestamp < unlockTimeB[msg.sender];

        if (isEarly) {
            // early exit
            if (amount < minEarlyExitAmountB) revert BelowMinEarlyExitB();
            _forfeitRewards(Pool.B, msg.sender);
            feeOrPenalty = amount * penaltyFeeBP / BASIS_POINTS;
            poolInfo.availableRewards += feeOrPenalty;
        } else {
            uint256 stakeTs = stakeTimestampB[msg.sender];
            if (stakeTs == 0 || stakeTs > block.timestamp) {
                revert InvalidStakeTimestamp();
            }
            feeOrPenalty = amount * _feeBP(stakeTs) / BASIS_POINTS;
            if (feeOrPenalty > 0) unclaimedFeesB += feeOrPenalty;
        }

        uint256 net = amount - feeOrPenalty;

        userInfo.rewardPaid = poolInfo.accRewardPerToken;

        _requirePrincipalCoverageB(poolInfo.totalStaked);

        userInfo.staked -= amount;
        poolInfo.totalStaked -= amount;

        if (userInfo.staked == 0) {
            unlockTimeB[msg.sender] = 0;
            stakeTimestampB[msg.sender] = 0;
        }
        _transferGross(rewardTokenB, msg.sender, net);

        _requirePrincipalCoverageB(poolInfo.totalStaked);

        _assertInvariantB();

        emit Withdrawn(msg.sender, Pool.B, amount, feeOrPenalty, isEarly);
    }

    function _requirePrincipalCoverageB(uint256 required) internal view {
        uint256 balance = rewardTokenB.balanceOf(address(this));
        if (balance < required) revert PrincipalDeficit(Pool.B, balance, required);
    }

    function _feeBP(uint256 stakeTs) internal view returns (uint256) {
        uint256 holding = block.timestamp - stakeTs;
        if (holding < FEE_TIER_1) return withdrawFeeBP;
        if (holding < FEE_TIER_2) return midTermFeeBP;
        return 0;
    }

    function _forfeitRewards(Pool pool, address user) internal {
        UserInfo storage userInfo = pool == Pool.A ? userInfoA[user] : userInfoB[user];
        uint256 forfeited = userInfo.rewards;
        if (forfeited == 0) return;

        PoolInfo storage poolInfo = _pool(pool);
        if (poolInfo.totalPending < forfeited) revert InsufficientPending();
        if (poolInfo.bookedUserRewards < forfeited) revert InsufficientBooked();

        uint256 requiredTokenB = _tokenBRequired();
        uint256 actualTokenB = _tokenBActual();

        uint256 physicalDeficit = requiredTokenB > actualTokenB ? requiredTokenB - actualTokenB : 0;
        uint256 debtCancelled = Math.min(forfeited, poolInfo.badDebt);
        uint256 released = forfeited - debtCancelled;
        uint256 lossAbsorbed = Math.min(released, physicalDeficit);
        uint256 budgetReturned = released - lossAbsorbed;

        userInfo.rewards = 0;
        poolInfo.totalPending -= forfeited;
        poolInfo.bookedUserRewards -= forfeited;
        poolInfo.badDebt -= debtCancelled;

        if (budgetReturned > 0) {
            poolB.availableRewards += budgetReturned;
        }

        emit RewardForfeited(user, pool, forfeited, debtCancelled, lossAbsorbed, budgetReturned);
    }

    function _claim(Pool pool) internal {
        if (emergencyMode && !shutdownMode) revert EmergencyStatus();
        if (!shutdownMode && paused()) revert PausedStatus();

        uint256 last = lastClaimTime[msg.sender];
        if (last != 0 && block.timestamp < last + CLAIM_COOLDOWN) {
            revert ClaimCooldownActive(last + CLAIM_COOLDOWN);
        }

        _updateGlobalA();
        _updateGlobalB();
        _settleUser(pool, msg.sender);

        PoolInfo storage pInfo = _pool(pool);
        UserInfo storage uInfo = pool == Pool.A ? userInfoA[msg.sender] : userInfoB[msg.sender];
        if (poolA.badDebt != 0 || poolB.badDebt != 0) revert BadDebtExists();

        uint256 reward = uInfo.rewards;
        if (reward == 0) revert NothingToClaim();
        if (!shutdownMode && reward < minClaimAmount) revert BelowMinClaim();

        if (pInfo.totalPending < reward) revert InsufficientPending();
        if (pInfo.bookedUserRewards < reward) revert InsufficientBooked();

        uInfo.rewards = 0;
        pInfo.totalPending -= reward;
        pInfo.bookedUserRewards -= reward;
        lastClaimTime[msg.sender] = block.timestamp;

        _transferGross(rewardTokenB, msg.sender, reward);

        _assertInvariantB();

        uint256 paidA = pool == Pool.A ? reward : 0;
        uint256 paidB = pool == Pool.B ? reward : 0;
        emit Claimed(msg.sender, paidA, paidB, block.timestamp);
    }

    function claimA() external {
        _claim(Pool.A);
    }

    function claimB() external {
        _claim(Pool.B);
    }
}
