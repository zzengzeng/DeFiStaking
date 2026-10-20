// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title PoolBWadpLib
/// @notice Weighted-average deposit timestamp (WADP) for Pool B fee tier / holding-duration math.
/// @dev Uses **ceiling** division so each update loses at most one second of upward bias instead of flooring toward older
///      timestamps. Floor bias made `stakeTimestampB` systematically low, inflating `holdingDuration` and pushing users into
///      lower withdraw-fee tiers early—especially under many small stakes where truncation compounded.
library PoolBWadpLib {
    /// @notice Next weighted-average unix timestamp after adding `addedAmount` at `currentTimestamp`.
    /// @param oldStaked User Pool B principal before this increment.
    /// @param oldTimestamp Prior WADP (`0` means treat as fresh-only path via `oldStaked == 0`).
    /// @param addedAmount New principal wei credited this step.
    /// @param currentTimestamp Reference time for the new leg (caller passes `block.timestamp`).
    function weightedAvgDepositTimestamp(
        uint256 oldStaked,
        uint256 oldTimestamp,
        uint256 addedAmount,
        uint256 currentTimestamp
    ) internal pure returns (uint256) {
        if (oldStaked == 0) return currentTimestamp;
        if (addedAmount == 0) return oldTimestamp;
        uint256 weightedOld = oldStaked * oldTimestamp;
        uint256 weightedNew = addedAmount * currentTimestamp;
        uint256 sum = weightedOld + weightedNew;
        uint256 denom = oldStaked + addedAmount;
        return Math.mulDiv(sum, 1, denom, Math.Rounding.Ceil);
    }
}
