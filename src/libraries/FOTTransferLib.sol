// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {StakingExecutionErrors} from "../StakingExecutionErrors.sol";

/// @title FOTTransferLib
/// @notice FOT-safe outbound transfers: user bears transfer tax; pool never grosses-up.
/// @dev Inbound stake/notify paths use balance-delta separately. Outbound sends the booked `grossAmount` from the vault;
///      the recipient wallet receives less when the token charges a transfer fee. `maxTransferFeeBP` bounds tolerated tax.
library FOTTransferLib {
    using SafeERC20 for IERC20;

    event OutboundTransfer(address indexed token, address indexed to, uint256 grossAmount, uint256 netReceived);

    /// @notice Estimates wallet net after an outbound `grossAmount` transfer (off-chain preview should use the same formula).
    function walletReceiveAfterFee(uint256 grossAmount, uint256 maxTransferFeeBP, uint256 basisPoints)
        internal
        pure
        returns (uint256)
    {
        if (grossAmount == 0 || maxTransferFeeBP == 0) return grossAmount;
        return Math.mulDiv(grossAmount, basisPoints - maxTransferFeeBP, basisPoints);
    }

    /// @notice Transfers `grossAmount` to `to`; FOT tax is borne by the recipient (not subsidized by the pool).
    /// @dev Uses the same implied-fee bound as inbound stake/notify: `maxTransferFeeBP == 0` requires `received == grossAmount`
    ///      (no FOT loss); `maxTransferFeeBP > 0` tolerates tax up to that ceiling.
    function transferGross(IERC20 token, address to, uint256 grossAmount, uint256 maxTransferFeeBP, uint256 basisPoints)
        internal
        returns (uint256 received)
    {
        if (grossAmount == 0) return 0;

        uint256 contractBal = token.balanceOf(address(this));
        if (contractBal < grossAmount) {
            revert StakingExecutionErrors.InsufficientBalance(grossAmount, contractBal);
        }

        uint256 recipientBefore = token.balanceOf(to);
        token.safeTransfer(to, grossAmount);
        received = token.balanceOf(to) - recipientBefore;

        if (received * basisPoints < grossAmount * (basisPoints - maxTransferFeeBP)) {
            revert StakingExecutionErrors.ExcessiveTransferFee();
        }
        emit OutboundTransfer(address(token), to, grossAmount, received);
    }
}
