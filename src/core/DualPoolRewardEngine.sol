// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {DualPoolStorageLayout} from "./DualPoolStorageLayout.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Pool, PoolInfo, UserInfo} from "../StakeTypes.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

abstract contract DualPoolRewardEngine is DualPoolStorageLayout, Pausable {
    using SafeERC20 for IERC20;

    error ZeroAmount();
    error RewardShareLimit();
    error WrongState();
    error CatchUpIncomplete();

    error InvariantViolation(uint256 actual, uint256 required);
    error BookedRewardsExceedPending();
    error DebtExceedsPending();

    error PayerDeductionMismatch();
    error ReceivedExceedsAmount();
    error FeeExceedsCap();

    error BelowMinStake();
    error CapExceeded();
    error InsufficientCoverage();

    error InvalidStakeTimestamp();

    error PausedStatus();
    error EmergencyStatus();
    error InvalidAmount();
    error PrincipalDeficit(Pool pool, uint256 balance, uint256 required);

    error BadDebtExists();
    error ClaimCooldownActive(uint256 availableAt);
    error NothingToClaim();
    error BelowMinClaim();
    error InsufficientPending();
    error InsufficientBooked();
    error BelowMinEarlyExitB();

    error AlreadyShutDown();
    error UnpauseCooldownActive(uint256 unpauseAt);

    event InsufficientBudget(Pool indexed pool, uint256 shortfall, uint256 currentTime);
    event PoolCatchUpCranked(Pool indexed pool, uint256 lastUpdateTime, bool isCatchUp, uint256 currentTime);

    event Staked(address indexed sender, Pool indexed pool, uint256 received, uint256 time);
    event Withdrawn(address indexed user, Pool indexed pool, uint256 amount, uint256 feeOrPenalty, bool isEarly);

    event Claimed(address indexed user, uint256 paidA, uint256 paidB, uint256 timestamp);
    event ShutdownActivated(address indexed sender, uint256 shutdownAt, uint256 currentTime);

    event RewardForfeited(
        address indexed user,
        Pool indexed pool,
        uint256 forfeited,
        uint256 debtCancelled,
        uint256 lossAvsorbed,
        uint256 budgetReturned
    );

    event UnpausedAt(address indexed sender, uint256 frozenAt, uint256 delta, uint256 currentTime);

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
        uint256 actual = _tokenBActual();
        uint256 required = _tokenBRequired();

        if (actual < required) revert InvariantViolation(actual, required);
        if (poolA.bookedUserRewards > poolA.totalPending) revert BookedRewardsExceedPending();
        if (poolB.bookedUserRewards > poolB.totalPending) revert BookedRewardsExceedPending();
        if (poolA.badDebt > poolA.totalPending) revert DebtExceedsPending();
        if (poolB.badDebt > poolB.totalPending) revert DebtExceedsPending();
    }

    function _settleUser(Pool pool, address user) internal {
        UserInfo storage u = pool == Pool.A ? userInfoA[user] : userInfoB[user];
        PoolInfo storage p = pool == Pool.A ? poolA : poolB;

        uint256 earned = Math.mulDiv(u.staked, p.accRewardPerToken - u.rewardPaid, REWARD_PRECISION);

        if (earned > 0) {
            u.rewards += earned;
            p.bookedUserRewards += earned;
        }

        u.rewardPaid = p.accRewardPerToken;
    }

    function _settleUserA(address user) internal {
        _settleUser(Pool.A, user);
    }

    function _settleUserB(address user) internal {
        _settleUser(Pool.B, user);
    }

    function _transferGross(IERC20 token, address to, uint256 gross) internal {
        if (gross == 0) revert ZeroAmount();

        uint256 vaultBefore = token.balanceOf(address(this));
        uint256 toBefore = token.balanceOf(to);

        token.safeTransfer(to, gross);

        uint256 vaultAfter = token.balanceOf(address(this));
        uint256 toAfter = token.balanceOf(to);

        uint256 debited = vaultBefore - vaultAfter;
        if (debited != gross) {
            revert VaultDebitMismatch(gross, debited);
        }
        uint256 netReceived = toAfter - toBefore;
        if (netReceived == 0 || netReceived > gross) {
            revert InvalidNetReceived(gross, netReceived);
        }
        if ((gross - netReceived) * BASIS_POINTS > gross * maxTransferFeeBP) {
            revert FeeExceedsCap();
        }
    }

    function _tokenBRequired() internal view returns (uint256) {
        return poolB.totalStaked + poolA.totalPending + poolB.totalPending + poolA.availableRewards
            + poolB.availableRewards + unclaimedFeesB;
    }

    function _tokenBActual() internal view returns (uint256) {
        return rewardTokenB.balanceOf(address(this)) + poolA.badDebt + poolB.badDebt;
    }
}
