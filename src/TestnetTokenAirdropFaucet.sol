// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title TestnetTokenAirdropFaucet
/// @notice Distributes pre-funded TokenA for Sepolia demos; users call `claim` (no mint permission required).
/// @dev Deployer mints TokenA to this contract at deploy time. Not for production.
contract TestnetTokenAirdropFaucet {
    using SafeERC20 for IERC20;

    /// @notice ERC20 distributed on each successful claim.
    IERC20 public immutable token;
    /// @notice Fixed amount sent per wallet on `claim`.
    uint256 public immutable claimAmount;
    /// @notice Maximum number of distinct wallets that may claim.
    uint256 public immutable maxClaims;

    uint256 public claimCount;
    mapping(address => bool) public claimed;

    event Claimed(address indexed claimant, uint256 amount);

    /// @param token_ TokenA address (must be pre-funded).
    /// @param claimAmount_ Amount per claim in token smallest units.
    /// @param maxClaims_ Cap on total claims.
    constructor(address token_, uint256 claimAmount_, uint256 maxClaims_) {
        require(token_ != address(0), "token zero");
        require(claimAmount_ > 0, "claim amount zero");
        require(maxClaims_ > 0, "max claims zero");
        token = IERC20(token_);
        claimAmount = claimAmount_;
        maxClaims = maxClaims_;
    }

    /// @notice Sends `claimAmount` to `msg.sender` once per address until `maxClaims` is reached.
    function claim() external {
        require(!claimed[msg.sender], "already claimed");
        require(claimCount < maxClaims, "cap reached");
        claimed[msg.sender] = true;
        unchecked {
            ++claimCount;
        }
        token.safeTransfer(msg.sender, claimAmount);
        emit Claimed(msg.sender, claimAmount);
    }

    /// @notice Remaining claim slots (0 when capped).
    function remainingClaims() external view returns (uint256) {
        if (claimCount >= maxClaims) return 0;
        return maxClaims - claimCount;
    }
}
