// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {PoolInfo, UserInfo} from "../StakeTypes.sol";
import {StakingExecutionErrors} from "../StakingExecutionErrors.sol";

/// @title PoolSingleClaimLib
/// @notice Linked library: single-pool reward claim with min-claim, bad-debt, and on-hand liquidity checks.
/// @dev Pays out the core `rewardToken` (TokenB); requires `balanceOf(this) >= reward` after pending accounting.
library PoolSingleClaimLib {
    using SafeERC20 for IERC20;

    /// @notice Static parameters for `executeClaim` (global config + cross-pool bad-debt guard).
    struct ClaimParams {
        /// @notice ERC20 used for payout (TokenB).
        IERC20 rewardToken;
        /// @notice Address receiving the transfer (also used as `lastClaimTime` key).
        address claimer;
        /// @notice Minimum `userInfo.rewards` for a successful claim (unless bypassed at a higher layer).
        uint256 minClaimAmount;
        /// @notice Pool A `badDebt` snapshot; both must be zero to allow claim.
        uint256 badDebtPoolA;
        /// @notice Pool B `badDebt` snapshot; both must be zero to allow claim.
        uint256 badDebtPoolB;
    }

    /// @notice Pays `userInfo.rewards` to `p.claimer` in reward token if all checks pass; updates pending and cooldown.
    /// @param pool Pool being claimed against (A or B).
    /// @param userInfo User ledger row for that pool.
    /// @param lastClaimTime Per-user cooldown map (keyed by `p.claimer`).
    /// @param p Claim parameters (`ClaimParams`).
    /// @return reward Amount transferred out (equals pre-call `userInfo.rewards`).
    function executeClaim(
        PoolInfo storage pool,
        UserInfo storage userInfo,
        mapping(address => uint256) storage lastClaimTime,
        ClaimParams memory p
    ) external returns (uint256 reward) {
        reward = userInfo.rewards;

        if (reward == 0) {
            revert StakingExecutionErrors.NoRewardsToClaim();
        }
        if (reward < p.minClaimAmount) {
            revert StakingExecutionErrors.BelowMinClaim(reward, p.minClaimAmount);
        }
        if (p.badDebtPoolA > 0 || p.badDebtPoolB > 0) {
            revert StakingExecutionErrors.BadDebtExists();
        }
        if (pool.totalPending < reward) {
            revert StakingExecutionErrors.InsufficientPending(reward, pool.totalPending);
        }

        uint256 balance = p.rewardToken.balanceOf(address(this));
        if (balance < reward) {
            revert StakingExecutionErrors.InsufficientPending(reward, balance);
        }

        pool.totalPending -= reward;
        userInfo.rewards = 0;
        lastClaimTime[p.claimer] = block.timestamp;
        p.rewardToken.safeTransfer(p.claimer, reward);
    }
}
