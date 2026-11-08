// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {DualPoolStorageLayout} from "./DualPoolStorageLayout.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Pool, PoolInfo} from "../StakeTypes.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

abstract contract DualPoolRewardEngine is DualPoolStorageLayout, Pausable {
    error RewardShareLimit();
    error WrongState();
    error CatchUpIncomplete();

    error InvariantViolation(uint256 actual, uint256 required);
    error BookedRewardsExceedPending();
    error DebtExceedsPending();

    event InsufficientBudget(Pool pool, uint256 shortfall, uint256 currentTime);
    event PoolCatchUpCranked(Pool pool, uint256 lastUpdateTime, bool isCatchUp, uint256 currentTime);

    function _effectiveTime() internal view returns (uint256) {
        if (emergencyMode || shutdownMode) return terminalRewardTime;
        return paused() ? pausedAt : block.timestamp;
    }

    function _pool(Pool pool) internal view returns (PoolInfo storage) {
        return pool == Pool.A ? poolA : poolB;
    }

    function _sharesCap(Pool pool) internal pure returns (uint256) {
        return pool == Pool.A ? MAX_REWARD_SHARES_A : MAX_REWARD_SHARES_B;
    }

    function _maxRewardRate(Pool pool) internal view returns (uint256) {
        return pool == Pool.A ? maxRewardRateA : maxRewardRateB;
    }

    function _accrueSlice(Pool pool, uint256 target) internal {
        PoolInfo storage p = _pool(pool);
        if (target <= p.lastUpdateTime) return;
        if (p.totalStaked == 0) {
            p.lastUpdateTime = target;
            return;
        }
        if (p.totalStaked > _sharesCap(pool)) revert RewardShareLimit();
        uint256 deltaTime = Math.min(target - p.lastUpdateTime, MAX_DELTA_TIME);
        uint256 deltaReward = p.rewardRate * deltaTime;
        uint256 deltaAcc = Math.mulDiv(deltaReward, REWARD_PRECISION, p.totalStaked);

        if (p.availableRewards >= deltaReward) {
            uint256 pendingDelta = Math.mulDiv(p.totalStaked, deltaAcc, REWARD_PRECISION, Math.Rounding.Ceil);
            p.availableRewards -= deltaReward;
            p.totalPending += pendingDelta;
        } else {
            uint256 shortfall = deltaReward - p.availableRewards;
            p.availableRewards = 0;
            p.totalPending += deltaReward;
            p.badDebt += shortfall;
            emit InsufficientBudget(pool, shortfall, block.timestamp);
        }

        p.accRewardPerToken += deltaAcc;
        p.lastUpdateTime += deltaTime;
    }

    function _advanceGlobal(Pool pool, bool requireComplete) internal {
        PoolInfo storage p = _pool(pool);
        uint256 target = Math.min(_effectiveTime(), p.periodFinish);

        uint256 iteractions;
        while (p.lastUpdateTime < target && iteractions < MAX_CATCHUP_ITERATIONS) {
            _accrueSlice(pool, target);
            unchecked {
                ++iteractions;
            }
        }

        if (requireComplete && p.lastUpdateTime < target) {
            revert CatchUpIncomplete();
        }
    }

    function _updateGlobal(Pool pool) internal {
        _advanceGlobal(pool, true);
    }

    function _updateGlobalA() internal {
        _updateGlobal(Pool.A);
    }

    function _updateGlobalB() internal {
        _updateGlobal(Pool.B);
    }

    function _assertInvariantB() internal view {
        uint256 actual = rewardTokenB.balanceOf(address(this)) + poolA.badDebt + poolB.badDebt;
        uint256 required = poolB.totalStaked + poolA.totalPending + poolB.totalPending + poolA.availableRewards
            + poolB.availableRewards + unclaimedFeesB;

        if (actual < required) revert InvariantViolation(actual, required);
        if (poolA.bookedUserRewards > poolA.totalPending) revert BookedRewardsExceedPending();
        if (poolB.bookedUserRewards > poolB.totalPending) revert BookedRewardsExceedPending();
        if (poolA.badDebt > poolA.totalPending) revert DebtExceedsPending();
        if (poolB.badDebt > poolB.totalPending) revert DebtExceedsPending();
    }
}
