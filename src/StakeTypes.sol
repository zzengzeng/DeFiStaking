// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title StakeTypes
/// @notice Shared enums and structs for dual-pool staking (`DualPoolStaking`, `DualPoolStakingOld`, delegate modules, and linked libraries).
/// @dev All structs are intentionally plain data carriers; mutators live in the core or libraries. Field units are always the relevant token’s smallest unit unless noted.

/// @notice Logical pool identifier: Pool A stakes TokenA; Pool B stakes TokenB (the same asset used for reward distribution).
enum Pool {
    /// @notice Pool A: `stakingToken` is TokenA; rewards are denominated and paid in TokenB.
    A,
    /// @notice Pool B: `stakingToken` is TokenB; rewards share the same 18-decimal fixed-point math as Pool A liabilities.
    B
}

/// @notice On-chain accounting snapshot for one pool (staking asset, issuance state, caps).
/// @dev Field semantics align with `PoolAccrualLib`, stake/withdraw libs, and admin notify paths.
struct PoolInfo {
    /// @notice ERC20 staked in this pool (TokenA for A, TokenB for B).
    IERC20 stakingToken;
    /// @notice Total principal currently staked in the pool.
    uint256 totalStaked;
    /// @notice Rewards emitted per second toward stakers during the active period.
    uint256 rewardRate;
    /// @notice Last timestamp global index was advanced to.
    uint256 lastUpdateTime;
    /// @notice Cumulative reward per staked token (scaled by `PRECISION` on the core).
    uint256 accRewardPerToken;
    /// @notice Reward budget not yet scheduled into pending liabilities.
    uint256 availableRewards;
    /// @notice End timestamp of the current reward period (0 if none).
    uint256 periodFinish;
    /// @notice Shortfall tallied when budget cannot cover accrual (bad debt).
    uint256 badDebt;
    /// @notice Rewards promised to stakers but not yet claimed (pending bucket).
    uint256 totalPending;
    /// @notice Sub-wei remainder bucket recycled when above dust tolerance.
    uint256 dust;
    /// @notice Optional TVL cap for the pool (`totalStaked` ceiling); `0` is treated as uncapped by stake libraries and the cores.
    uint256 tvlCap;
    /// @notice Minimum stake per transaction for the pool.
    uint256 minStakeAmount;
    /// @notice Default reward duration parameter used by notify / admin flows.
    uint256 rewardDuration;
}

/// @notice Per-user staking and reward checkpoint for one pool (mirrored in `userInfoA` / `userInfoB` mappings on the core).
struct UserInfo {
    /// @notice User principal staked in the pool.
    uint256 staked;
    /// @notice Accrued rewards not yet paid out (after settlement).
    uint256 rewards;
    /// @notice Last `accRewardPerToken` applied to this user (reward debt / paid index).
    uint256 rewardPaid;
}

/// @notice Optional on-chain record for a timelocked governance operation (`pendingOps[opId]` on the cores).
/// @dev `executeAfter` and `paramsHash` are written by higher-level governance scripts; cancellation clears the slot.
struct PendingOp {
    /// @notice Earliest timestamp at which the op may execute (0 if unset / cleared).
    uint256 executeAfter;
    /// @notice Commitment hash of encoded parameters (for cancellation / audit).
    bytes32 paramsHash;
}
