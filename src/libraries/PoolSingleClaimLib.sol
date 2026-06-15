// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {PoolInfo, UserInfo} from "../StakeTypes.sol";
import {FOTTransferLib} from "./FOTTransferLib.sol";
import {StakingExecutionErrors} from "../StakingExecutionErrors.sol";

/// @title PoolSingleClaimLib
/// @notice Linked library: single-pool reward claim with min-claim, bad-debt, and on-hand liquidity checks.
/// @dev Pays out the core `rewardToken` (TokenB). Ledger `rewards` is the **gross** vault transfer amount;
///      FOT transfer tax on outbound is borne by the user (see PRD §4.6).
library PoolSingleClaimLib {
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
        /// @notice FOT outbound tax ceiling (`0` = standard ERC20, no post-transfer check).
        uint256 maxTransferFeeBP;
        /// @notice Basis-point denominator (`10_000`).
        uint256 basisPoints;
    }

    /// @notice Pays `userInfo.rewards` to `p.claimer` if all checks pass; updates pending and cooldown.
    /// @return reward Gross amount sent from the vault (wallet net may be lower under FOT TokenB).
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
        FOTTransferLib.transferGross(p.rewardToken, p.claimer, reward, p.maxTransferFeeBP, p.basisPoints);
    }
}
