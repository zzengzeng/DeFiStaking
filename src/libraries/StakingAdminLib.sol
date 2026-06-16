// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {Pool, PoolInfo, UserInfo} from "../StakeTypes.sol";
import {FOTTransferLib} from "./FOTTransferLib.sol";
import {RewardReanchorLib} from "./RewardReanchorLib.sol";
import {StakingExecutionErrors} from "../StakingExecutionErrors.sol";

/// @title StakingAdminLib
/// @notice Linked library: admin, emergency, recovery, shutdown, and bad-debt execution bodies used via `DualPoolAdminModule` (`delegatecall` from core) or direct `external` calls from `DualPoolStakingOld`. Pool B fee sweeps live on the cores / admin module (`claimFees`) with CEI ordering.
/// @dev Every `execute*` entrypoint assumes the caller has already enforced pause/emergency/role gates unless noted.
library StakingAdminLib {
    using SafeERC20 for IERC20;

    /// @notice Parameters for `executeRecoverToken` (token-agnostic sweep with liability checks).
    struct RecoverTokenParams {
        /// @notice Reward token (TokenB) reference for backing math.
        IERC20 rewardToken;
        /// @notice Snapshot of `unclaimedFeesB` reserved in Pool B fee ledger.
        uint256 unclaimedFeesB;
        /// @notice ERC20 being recovered (may be TokenA, TokenB, or reward token).
        IERC20 token;
        /// @notice Recipient of recovered tokens (must be non-zero).
        address to;
        /// @notice Requested sweep amount (must be `<=` computed excess).
        uint256 amount;
    }

    /// @notice Parameters for terminal shutdown finalization.
    struct ForceShutdownFinalizeParams {
        /// @notice Shutdown flag snapshot; must be true.
        bool shutdown;
        /// @notice Reward token used for residual sweep.
        IERC20 rewardToken;
        /// @notice Recipient of residual reward token balance after zeroing buckets.
        address feeRecipient;
        /// @notice Timestamp when shutdown was activated.
        uint256 shutdownAt;
        /// @notice Minimum time after `shutdownAt` before finalize (unless deadlock bypass applies).
        uint256 gracePeriod;
        /// @notice Absolute horizon after which finalize may proceed even if stake remains.
        uint256 deadlockBypass;
        /// @notice `unclaimedFeesB` captured at call time for residual accounting.
        uint256 unclaimedFeesAtCall;
        /// @notice Aggregate of all Pool A `userInfo.rewards` at call time (must remain claimable after finalize).
        uint256 bookedUserRewardsA;
        /// @notice Aggregate of all Pool B `userInfo.rewards` at call time.
        uint256 bookedUserRewardsB;
    }

    /// @notice Parameters for Pool A emergency principal exit.
    struct EmergencyWithdrawAParams {
        /// @notice Emergency flag must be true.
        bool emergencyMode;
        /// @notice Shutdown must be false for this path.
        bool shutdown;
        /// @notice User receiving principal and partial rewards per liquidity rules.
        address user;
        /// @notice FOT outbound tax ceiling for TokenA (`0` = standard ERC20).
        uint256 maxTransferFeeBP;
        /// @notice Basis-point denominator (`10_000`).
        uint256 basisPoints;
    }

    /// @notice Parameters for Pool B emergency principal exit.
    struct EmergencyWithdrawBParams {
        /// @notice Emergency flag must be true.
        bool emergencyMode;
        /// @notice Shutdown must be false for this path.
        bool shutdown;
        /// @notice User receiving principal and partial rewards per liquidity rules.
        address user;
        /// @notice FOT outbound tax ceiling for TokenB (`0` = standard ERC20).
        uint256 maxTransferFeeBP;
        /// @notice Basis-point denominator (`10_000`).
        uint256 basisPoints;
    }

    /// @notice Parameters for `executeResolveBadDebt` (pull + allocate).
    struct ResolveBadDebtParams {
        /// @notice Reward token pulled from `from`.
        IERC20 rewardToken;
        /// @notice Payer supplying reward tokens.
        address from;
        /// @notice Upper bound on tokens requested from payer.
        uint256 amount;
    }

    /// @dev Minimum TokenB balance required to cover principal, pending rewards, fees, and dust (used in recovery checks).
    /// @param poolA Pool A storage.
    /// @param poolB Pool B storage.
    /// @param unclaimedFeesB Reserved Pool B withdrawal fees not yet swept.
    /// @return Required TokenB backing in wei for solvent recovery checks.
    function _requiredRewardBacking(PoolInfo storage poolA, PoolInfo storage poolB, uint256 unclaimedFeesB)
        private
        view
        returns (uint256)
    {
        uint256 principalAndPending = poolB.totalStaked + poolA.totalPending + poolB.totalPending;
        uint256 rewardsAndDust =
            poolA.availableRewards + poolB.availableRewards + unclaimedFeesB + poolA.dust + poolB.dust;
        return principalAndPending + rewardsAndDust;
    }

    /// @dev Stops the active emission schedule so post-finalize user paths cannot accrue against swept `availableRewards`.
    function _terminateEmission(PoolInfo storage pool) private {
        pool.rewardRate = 0;
        pool.periodFinish = block.timestamp;
        pool.lastUpdateTime = block.timestamp;
    }

    /// @dev Budget still scheduled for `[lastUpdateTime, periodFinish]` at `rewardRate`; must stay in `availableRewards`.
    function _reservedEmissionBudget(PoolInfo storage pool) private view returns (uint256) {
        if (pool.periodFinish <= pool.lastUpdateTime) return 0;
        return (pool.periodFinish - pool.lastUpdateTime) * pool.rewardRate;
    }

    /// @dev Max reward wei movable from `pool` without breaking its active or unfinished emission schedule.
    ///      Caller should run `PoolAccrualLib.updateGlobal` for both pools first so `lastUpdateTime` / `availableRewards` reflect accrual.
    function _movableRebalanceBudget(PoolInfo storage pool) private view returns (uint256) {
        uint256 reserved = _reservedEmissionBudget(pool);
        return pool.availableRewards > reserved ? pool.availableRewards - reserved : 0;
    }

    /// @notice Moves `amount` of `availableRewards` from `from` pool to `to` pool (no bad debt, distinct pools).
    /// @param poolA Pool A storage.
    /// @param poolB Pool B storage.
    /// @param from Source pool enum.
    /// @param to Destination pool enum.
    /// @param amount Reward token wei to move between `availableRewards` buckets.
    function executeRebalanceBudgets(
        PoolInfo storage poolA,
        PoolInfo storage poolB,
        Pool from,
        Pool to,
        uint256 amount,
        RewardReanchorLib.ReanchorCaps memory caps
    ) external {
        if (poolA.badDebt > 0 || poolB.badDebt > 0) {
            revert StakingExecutionErrors.BadDebtExists();
        }
        if (from == to) {
            revert StakingExecutionErrors.SamePool();
        }

        PoolInfo storage poolFrom = from == Pool.A ? poolA : poolB;
        PoolInfo storage poolTo = to == Pool.A ? poolA : poolB;

        if (poolFrom.availableRewards < amount) {
            revert StakingExecutionErrors.InsufficientBalance(amount, poolFrom.availableRewards);
        }

        uint256 movable = _movableRebalanceBudget(poolFrom);
        if (amount > movable) {
            revert StakingExecutionErrors.RebalanceExceedsMovableBudget(amount, movable);
        }

        poolFrom.availableRewards -= amount;
        poolTo.availableRewards += amount;
        RewardReanchorLib.reanchorOnBudgetInjection(poolTo, caps);
    }

    /// @notice Sweeps `p.token` to `p.to` if the amount is provably non-liability "excess" per pool accounting rules.
    /// @param poolA Pool A storage (TokenA principal liability).
    /// @param poolB Pool B storage.
    /// @param p Recovery parameters (`RecoverTokenParams`).
    function executeRecoverToken(PoolInfo storage poolA, PoolInfo storage poolB, RecoverTokenParams memory p) external {
        if (p.to == address(0)) {
            revert StakingExecutionErrors.ZeroAddress();
        }

        address t = address(p.token);
        if (t == address(poolA.stakingToken)) {
            uint256 balanceA = poolA.stakingToken.balanceOf(address(this));
            if (balanceA <= poolA.totalStaked) {
                revert StakingExecutionErrors.TokenRecoveryRestricted();
            }
            uint256 excessA = balanceA - poolA.totalStaked;
            if (p.amount > excessA) {
                revert StakingExecutionErrors.TokenRecoveryRestricted();
            }
        } else if (t == address(p.rewardToken) || t == address(poolB.stakingToken)) {
            if (poolA.badDebt > 0 || poolB.badDebt > 0) {
                revert StakingExecutionErrors.BadDebtExists();
            }
            uint256 required = _requiredRewardBacking(poolA, poolB, p.unclaimedFeesB);
            uint256 balanceB = p.rewardToken.balanceOf(address(this));
            if (balanceB <= required) {
                revert StakingExecutionErrors.TokenRecoveryRestricted();
            }
            uint256 excessB = balanceB - required;
            if (p.amount > excessB) {
                revert StakingExecutionErrors.TokenRecoveryRestricted();
            }
        }

        p.token.safeTransfer(p.to, p.amount);
    }

    /// @notice Terminal shutdown step: sweeps **non-user** reward token residue to `feeRecipient` and retains per-pool `totalPending` equal to booked user rewards.
    /// @param poolA Pool A storage.
    /// @param poolB Pool B storage.
    /// @param p Shutdown finalization parameters (`ForceShutdownFinalizeParams`).
    /// @dev `residual` is `availableRewards` + fee/dust buckets. If no principal remains staked, it also includes
    ///      orphan pending (`totalPending - bookedUserRewards`) because all withdraw paths settle users first. If the
    ///      deadlock bypass is used while stake remains, unsettled pending must stay in `totalPending` so remaining
    ///      stakers can later settle and claim pre-finalize rewards.
    function executeForceShutdownFinalize(
        PoolInfo storage poolA,
        PoolInfo storage poolB,
        ForceShutdownFinalizeParams memory p
    ) external {
        if (!p.shutdown) {
            revert StakingExecutionErrors.NotShutdown();
        }
        if (block.timestamp < p.shutdownAt + p.gracePeriod) {
            revert StakingExecutionErrors.GracePeriodNotMet();
        }
        if (block.timestamp < p.shutdownAt + p.deadlockBypass && (poolA.totalStaked != 0 || poolB.totalStaked != 0)) {
            revert StakingExecutionErrors.StillStaked();
        }

        _terminateEmission(poolA);
        _terminateEmission(poolB);

        bool hasRemainingStake = poolA.totalStaked != 0 || poolB.totalStaked != 0;
        uint256 bookedA = p.bookedUserRewardsA;
        uint256 bookedB = p.bookedUserRewardsB;
        if (bookedA > poolA.totalPending || bookedB > poolB.totalPending) {
            revert StakingExecutionErrors.BookedRewardsExceedPending();
        }
        uint256 orphanA = poolA.totalPending - bookedA;
        uint256 orphanB = poolB.totalPending - bookedB;

        uint256 residual =
            poolA.availableRewards + poolB.availableRewards + p.unclaimedFeesAtCall + poolA.dust + poolB.dust;
        if (!hasRemainingStake) {
            residual += orphanA + orphanB;
        }

        if (!hasRemainingStake) {
            poolA.totalPending = bookedA;
            poolB.totalPending = bookedB;
        }
        poolA.availableRewards = 0;
        poolB.availableRewards = 0;
        poolA.dust = 0;
        poolB.dust = 0;

        if (residual > 0) {
            p.rewardToken.safeTransfer(p.feeRecipient, residual);
        }
    }

    /// @notice Emergency Pool A exit: returns principal and rebalances unpaid rewards into Pool B budget per rules.
    /// @dev Caller must run `PoolAccrualLib.updateGlobal` for both pools and `settleUser` for the exiting user (and peers if needed)
    ///      **before** this call so `userInfo.rewards` matches `accRewardPerToken` and `totalPending` is not left inconsistent.
    /// @param poolA Pool A storage.
    /// @param poolB Pool B storage (receives rebalanced `availableRewards` from unpaid A rewards).
    /// @param userInfoA Pool A user mapping.
    /// @param p Emergency parameters (`EmergencyWithdrawAParams`).
    /// @return stakedAmount TokenA principal returned to the user.
    function executeEmergencyWithdrawA(
        PoolInfo storage poolA,
        PoolInfo storage poolB,
        mapping(address => UserInfo) storage userInfoA,
        EmergencyWithdrawAParams memory p,
        RewardReanchorLib.ReanchorCaps memory caps
    ) external returns (uint256 stakedAmount) {
        if (!p.emergencyMode) {
            revert StakingExecutionErrors.NotInEmergency();
        }
        if (p.shutdown) {
            revert StakingExecutionErrors.ShutdownModeActive();
        }
        UserInfo storage userA = userInfoA[p.user];
        stakedAmount = userA.staked;
        uint256 reward = userA.rewards;

        if (stakedAmount == 0) {
            revert StakingExecutionErrors.NothingToWithdraw();
        }

        userInfoA[p.user].staked = 0;
        userInfoA[p.user].rewards = 0;
        userInfoA[p.user].rewardPaid = 0;

        poolA.totalStaked -= stakedAmount;

        uint256 actualReward = reward;
        if (poolA.totalPending < reward) {
            actualReward = poolA.totalPending;
        }

        poolA.totalPending -= actualReward;
        poolB.availableRewards += actualReward;
        if (actualReward > 0) {
            RewardReanchorLib.reanchorOnBudgetInjection(poolB, caps);
        }

        FOTTransferLib.transferGross(poolA.stakingToken, p.user, stakedAmount, p.maxTransferFeeBP, p.basisPoints);
    }

    /// @notice Emergency Pool B exit: returns principal, clears lock maps, and rebalances rewards similarly to Pool A path.
    /// @dev Same pre-condition as `executeEmergencyWithdrawA`: global accrual + `settleUser` for the claimant must run first.
    /// @param poolB Pool B storage.
    /// @param userInfoB Pool B user mapping.
    /// @param unlockTimeB Pool B unlock map (zeroed for user).
    /// @param stakeTimestampB Pool B weighted time map (zeroed for user).
    /// @param p Emergency parameters (`EmergencyWithdrawBParams`).
    /// @return stakedAmount TokenB principal returned to the user.
    function executeEmergencyWithdrawB(
        PoolInfo storage poolB,
        mapping(address => UserInfo) storage userInfoB,
        mapping(address => uint256) storage unlockTimeB,
        mapping(address => uint256) storage stakeTimestampB,
        EmergencyWithdrawBParams memory p,
        RewardReanchorLib.ReanchorCaps memory caps
    ) external returns (uint256 stakedAmount) {
        if (!p.emergencyMode) {
            revert StakingExecutionErrors.NotInEmergency();
        }
        if (p.shutdown) {
            revert StakingExecutionErrors.ShutdownModeActive();
        }
        UserInfo storage userB = userInfoB[p.user];
        stakedAmount = userB.staked;
        uint256 reward = userB.rewards;

        if (stakedAmount == 0) {
            revert StakingExecutionErrors.NothingToWithdraw();
        }

        userInfoB[p.user].staked = 0;
        userInfoB[p.user].rewards = 0;
        userInfoB[p.user].rewardPaid = 0;

        poolB.totalStaked -= stakedAmount;

        uint256 actualReward = reward;
        if (poolB.totalPending < reward) {
            actualReward = poolB.totalPending;
        }
        poolB.totalPending -= actualReward;
        poolB.availableRewards += actualReward;
        if (actualReward > 0) {
            RewardReanchorLib.reanchorOnBudgetInjection(poolB, caps);
        }

        unlockTimeB[p.user] = 0;
        stakeTimestampB[p.user] = 0;

        FOTTransferLib.transferGross(poolB.stakingToken, p.user, stakedAmount, p.maxTransferFeeBP, p.basisPoints);
    }

    /// @notice Amounts applied toward Pool A / Pool B bad debt during `executeResolveBadDebt`.
    struct ResolveBadDebtResult {
        /// @notice Reward wei applied to Pool A `badDebt`.
        uint256 repayA;
        /// @notice Reward wei applied to Pool B `badDebt`.
        uint256 repayB;
    }

    /// @notice Pulls reward tokens from `p.from` and applies them against `badDebt` buckets, refunding surplus to Pool B `availableRewards`.
    /// @param poolA Pool A storage.
    /// @param poolB Pool B storage.
    /// @param p Pull parameters (`ResolveBadDebtParams`).
    /// @return r Applied repayments per pool; any remainder after both debts is added to `poolB.availableRewards`.
    function executeResolveBadDebt(
        PoolInfo storage poolA,
        PoolInfo storage poolB,
        ResolveBadDebtParams memory p,
        RewardReanchorLib.ReanchorCaps memory caps
    ) external returns (ResolveBadDebtResult memory r) {
        if (poolA.badDebt == 0 && poolB.badDebt == 0) {
            revert StakingExecutionErrors.NoBadDebt();
        }
        if (p.amount == 0) {
            revert StakingExecutionErrors.ZeroAmount();
        }

        uint256 balBefore = p.rewardToken.balanceOf(address(this));
        p.rewardToken.safeTransferFrom(p.from, address(this), p.amount);
        uint256 rem = p.rewardToken.balanceOf(address(this)) - balBefore;

        if (rem > 0 && poolA.badDebt > 0) {
            r.repayA = Math.min(rem, poolA.badDebt);
            poolA.badDebt -= r.repayA;
            rem -= r.repayA;
        }
        if (rem > 0 && poolB.badDebt > 0) {
            r.repayB = Math.min(rem, poolB.badDebt);
            poolB.badDebt -= r.repayB;
            rem -= r.repayB;
        }
        if (rem > 0) {
            poolB.availableRewards += rem;
            RewardReanchorLib.reanchorOnBudgetInjection(poolB, caps);
        }
    }
}
