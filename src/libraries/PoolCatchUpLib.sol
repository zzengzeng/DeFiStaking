// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PoolInfo} from "../StakeTypes.sol";

/// @title PoolCatchUpLib
/// @notice Shared catch-up cap / completion helpers for accrual scheduling.
library PoolCatchUpLib {
    /// @notice Accrual clock for catch-up and previews: frozen at `pausedAt` while paused (L-1 / L-2).
    function accrualTimestamp(uint256 timestamp, uint256 pausedAt_, bool paused_) internal pure returns (uint256 t) {
        t = timestamp;
        if (paused_ && pausedAt_ != 0) {
            t = pausedAt_;
        }
    }

    /// @notice Upper bound of global accrual for catch-up: `min(accrualTimestamp(now), periodFinish)`.
    function accrualCatchUpCap(PoolInfo storage pool, uint256 pausedAt_, bool paused_) internal view returns (uint256 cap) {
        cap = accrualTimestamp(block.timestamp, pausedAt_, paused_);
        if (pool.periodFinish < cap) cap = pool.periodFinish;
    }

    /// @notice True when `lastUpdateTime` has reached the pause-aware catch-up cap.
    function isCatchUpComplete(PoolInfo storage pool, uint256 pausedAt_, bool paused_) internal view returns (bool) {
        return pool.lastUpdateTime >= accrualCatchUpCap(pool, pausedAt_, paused_);
    }

    /// @notice Memory-pool variant for `pendingReward*` previews.
    function isCatchUpCompleteMem(PoolInfo memory pool, uint256 timestamp) internal pure returns (bool) {
        uint256 cap = timestamp;
        if (pool.periodFinish < cap) cap = pool.periodFinish;
        return pool.lastUpdateTime >= cap;
    }

    /// @notice Memory-pool catch-up cap for previews.
    function accrualCatchUpCapMem(PoolInfo memory pool, uint256 timestamp) internal pure returns (uint256 cap) {
        cap = timestamp;
        if (pool.periodFinish < cap) cap = pool.periodFinish;
        return cap;
    }
}
