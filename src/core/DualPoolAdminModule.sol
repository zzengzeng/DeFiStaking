// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {IDualPoolAdminModule} from "../interfaces/IDualPoolAdminModule.sol";

import {DualPoolRewardEngine} from "./DualPoolRewardEngine.sol";
import {Pool, PoolInfo} from "../StakeTypes.sol";

contract DualPoolAdminModule is DualPoolRewardEngine, IDualPoolAdminModule {
    error BadDebtExists();
    error WindowActive();
    error InvalidRate();
    error UnderfundedSchedule();
    error RewardIndexCapacity();

    event RewardScheduled(
        Pool indexed pool, uint256 effectiveDuration, uint256 newRate, uint256 time, uint256 periodFinish
    );

    function setLockDuration(uint256 newLockDuration) external override {
        if (newLockDuration == 0 || newLockDuration > MAX_LOCK_DURATION) {
            revert InvalidLockDuration();
        }

        uint256 oldLockDuration = lockDuration;
        lockDuration = newLockDuration;
        emit LockDurationUpdated(oldLockDuration, newLockDuration, block.timestamp);
    }

    function setFeeRecipient(address newFeeRecipient) external override {
        if (newFeeRecipient == address(0)) revert ZeroAddress();
        if (newFeeRecipient == address(this)) revert InvalidFeeRecipient();
        address oldFeeRecipient = feeRecipient;
        feeRecipient = newFeeRecipient;
        emit FeeRecipientUpdated(oldFeeRecipient, newFeeRecipient, block.timestamp);
    }

    function setMaxTransferFeeBP(uint256 newMaxTransferFeeBP) external override {
        if (newMaxTransferFeeBP > BASIS_POINTS) revert InvalidMaxTransferFeeBP();
        uint256 old = maxTransferFeeBP;
        maxTransferFeeBP = newMaxTransferFeeBP;
        emit MaxTransferFeeBPUpdated(old, newMaxTransferFeeBP, block.timestamp);
    }

    function setMinClaimAmount(uint256 newMinClaimAmount) external override {
        if (newMinClaimAmount > MAX_MIN_CLAIM_AMOUNT) revert InvalidMinClaimAmount();
        uint256 old = minClaimAmount;
        minClaimAmount = newMinClaimAmount;
        emit MinClaimAmountUpdated(old, newMinClaimAmount, block.timestamp);
    }

    function setMaxTVLCap(Pool pool, uint256 newMaxTVLCap) external override {
        PoolInfo storage p = _pool(pool);
        uint256 old = p.maxTVLCap;
        p.maxTVLCap = newMaxTVLCap;
        emit MaxTVLCapUpdated(pool, old, newMaxTVLCap, block.timestamp);
    }

    function setMinStakeAmount(Pool pool, uint256 newMinStakeAmount) external override {
        PoolInfo storage p = _pool(pool);
        uint256 old = p.minStakeAmount;
        p.minStakeAmount = newMinStakeAmount;
        emit MinStakeAmountUpdated(pool, old, newMinStakeAmount, block.timestamp);
    }

    function setRewardDuration(Pool pool, uint256 newRewardDuration) external override {
        PoolInfo storage p = _pool(pool);
        uint256 old = p.rewardDuration;
        if (
            newRewardDuration != 0
                && (newRewardDuration < MIN_REWARD_DURATION || newRewardDuration > MAX_REWARD_DURATION)
        ) {
            revert InvalidRewardDuration();
        }
        p.rewardDuration = newRewardDuration;
        emit RewardDurationUpdated(pool, old, newRewardDuration, block.timestamp);
    }

    function setFees(uint256 penaltyBP, uint256 withdrawBP, uint256 midTermBP) external override {
        if (penaltyBP > MAX_EARLY_EXIT_PENALTY_BP) revert InvalidPenaltyFee();
        if (withdrawBP > MAX_WITHDRAW_BP) revert InvalidWithdrawFee();
        if (midTermBP > MAX_MIDTERM_BP) revert InvalidMidTermFee();
        if (minEarlyExitAmountB < _minExitForPenalty(penaltyBP)) revert InvalidPenaltyFee();
        penaltyFeeBP = penaltyBP;
        withdrawFeeBP = withdrawBP;
        midTermFeeBP = midTermBP;
        emit FeesUpdated(penaltyBP, withdrawBP, midTermBP, block.timestamp);
    }

    function setMinEarlyExitAmountB(uint256 newMinEarlyExitAmountB) external override {
        if (penaltyFeeBP > 0 && newMinEarlyExitAmountB < _minExitForPenalty(penaltyFeeBP)) {
            revert InvalidMinEarlyExitAmount();
        }
        uint256 old = minEarlyExitAmountB;
        minEarlyExitAmountB = newMinEarlyExitAmountB;
        emit MinEarlyExitAmountBUpdated(old, newMinEarlyExitAmountB, block.timestamp);
    }

    function _minExitForPenalty(uint256 penaltyBP) internal pure returns (uint256) {
        if (penaltyBP == 0) return 0;
        return (BASIS_POINTS + penaltyBP - 1) / penaltyBP;
    }

    function scheduleRewards(Pool pool, uint256 duration) external override {
        if (emergencyMode || shutdownMode) revert WrongState();

        _updateGlobalA();
        _updateGlobalB();

        if (poolA.badDebt != 0 || poolB.badDebt != 0) revert BadDebtExists();

        _assertInvariantB();

        uint256 effectiveDuration = duration == 0 ? _pool(pool).rewardDuration : duration;

        if (effectiveDuration < MIN_REWARD_DURATION || effectiveDuration > MAX_REWARD_DURATION) {
            revert InvalidRewardDuration();
        }

        uint256 time = _effectiveTime();

        PoolInfo storage p = _pool(pool);

        if (p.periodFinish > time) revert WindowActive();

        uint256 newRate = p.availableRewards / effectiveDuration;
        if (newRate == 0) revert InvalidRate();
        if (newRate > _maxRewardRate(pool)) revert InvalidRate();

        if (newRate * effectiveDuration > p.availableRewards) revert UnderfundedSchedule();

        uint256 headroom = (type(uint256).max - p.accRewardPerToken) / REWARD_PRECISION;
        if (newRate > headroom / effectiveDuration) revert RewardIndexCapacity();

        p.rewardRate = newRate;
        p.periodFinish = time + effectiveDuration;
        p.lastUpdateTime = time;

        emit RewardScheduled(pool, effectiveDuration, newRate, time, p.periodFinish);
    }
}
