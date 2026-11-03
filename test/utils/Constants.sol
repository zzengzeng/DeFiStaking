// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract Constants {
    uint256 internal constant CAP = 1_000_000e18;
    uint256 internal constant INITIAL_MINT = 1_000_000e18;
    uint8 internal constant GOOD_DECIMALS = 18;
    uint8 internal constant BAD_DECIMALS = 6;
    uint256 internal constant MIN_CAP_FOR_NONZERO_RATE = 15_768_000;
    uint256 public constant MAX_APR_BP = 20000;
    uint256 public constant SECONDS_PER_YEAR = 31536000;
    uint256 public constant BASIS_POINTS = 10000;
}
