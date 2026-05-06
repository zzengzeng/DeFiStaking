// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {Pool, PoolInfo, UserInfo} from "../StakeTypes.sol";
import {StakingExecutionErrors} from "../StakingExecutionErrors.sol";

/// @title StakingAdminLib
/// @notice Linked library: admin, emergency, fee, recovery, shutdown, and bad-debt execution bodies used via `DualPoolAdminModule` (`delegatecall` from core) or direct `external` calls from `DualPoolStakingOld`.
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
    }

    /// @notice Parameters for Pool A emergency principal exit.
    struct EmergencyWithdrawAParams {
        /// @notice Emergency flag must be true.
        bool emergencyMode;
        /// @notice Shutdown must be false for this path.
        bool shutdown;
        /// @notice User receiving principal and partial rewards per liquidity rules.
        address user;
    }

    /// @notice Parameters for Pool B emergency principal exit.
    struct EmergencyWithdrawBParams {
        /// @notice Emergency flag must be true.
        bool emergencyMode;
        /// @notice Shutdown must be false for this path.
        bool shutdown;
        /// @notice User receiving principal and partial rewards per liquidity rules.
        address user;
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

    /// @notice Moves `amount` of `availableRewards` from `from` pool to `to` pool (no bad debt, distinct pools).
    /// @param poolA Pool A storage.
    /// @param poolB Pool B storage.
    /// @param from Source pool enum.
    /// @param to Destination pool enum.
    /// @param amount Reward token wei to move between `availableRewards` buckets.
    function executeRebalanceBudgets(PoolInfo storage poolA, PoolInfo storage poolB, Pool from, Pool to, uint256 amount)
        external
    {
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

        poolFrom.availableRewards -= amount;
        poolTo.availableRewards += amount;
    }

    /// @notice Transfers accumulated Pool B fees (`fees`) to `feeRecipient` using the reward token.
    /// @param rewardToken TokenB ERC20 instance.
    /// @param feeRecipient Recipient; must be non-zero.
    /// @param fees Amount to transfer (caller typically passes full `unclaimedFeesB`).
    function executeClaimFees(IERC20 rewardToken, address feeRecipient, uint256 fees) external {
        if (fees == 0) {
            revert StakingExecutionErrors.NoFeesToClaim();
        }
        if (feeRecipient == address(0)) {
            revert StakingExecutionErrors.NoFeeRecipient();
        }
        rewardToken.safeTransfer(feeRecipient, fees);
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

    /// @notice Terminal shutdown step: zeros pending/available/dust buckets and sends residual reward token to `feeRecipient` when allowed.
    /// @param poolA Pool A storage.
    /// @param poolB Pool B storage.
    /// @param p Shutdown finalization parameters (`ForceShutdownFinalizeParams`).
    /// @dev `residual` includes `poolA.dust + poolB.dust` so sub-`DUST_TOLERANCE` accrual dust is swept with the final transfer (avoids wei permanently stuck in the core).
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

        uint256 residual = poolA.totalPending + poolB.totalPending + poolA.availableRewards + poolB.availableRewards
            + p.unclaimedFeesAtCall + poolA.dust + poolB.dust;

        poolA.totalPending = 0;
        poolB.totalPending = 0;
        poolA.availableRewards = 0;
        poolB.availableRewards = 0;
        poolA.dust = 0;
        poolB.dust = 0;

        if (residual > 0) {
            p.rewardToken.safeTransfer(p.feeRecipient, residual);
        }
    }

    /// @notice Emergency Pool A exit: returns principal and rebalances unpaid rewards into Pool B budget per rules.
    /// @param poolA Pool A storage.
    /// @param poolB Pool B storage (receives rebalanced `availableRewards` from unpaid A rewards).
    /// @param userInfoA Pool A user mapping.
    /// @param p Emergency parameters (`EmergencyWithdrawAParams`).
    /// @return stakedAmount TokenA principal returned to the user.
    function executeEmergencyWithdrawA(
        PoolInfo storage poolA,
        PoolInfo storage poolB,
        mapping(address => UserInfo) storage userInfoA,
        EmergencyWithdrawAParams memory p
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

        poolA.stakingToken.safeTransfer(p.user, stakedAmount);
    }

    /// @notice Emergency Pool B exit: returns principal, clears lock maps, and rebalances rewards similarly to Pool A path.
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
        EmergencyWithdrawBParams memory p
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

        unlockTimeB[p.user] = 0;
        stakeTimestampB[p.user] = 0;

        poolB.stakingToken.safeTransfer(p.user, stakedAmount);
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
    function executeResolveBadDebt(PoolInfo storage poolA, PoolInfo storage poolB, ResolveBadDebtParams memory p)
        external
        returns (ResolveBadDebtResult memory r)
    {
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
        }
    }
}
