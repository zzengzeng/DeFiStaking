// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {StakingExecutionErrors} from "../StakingExecutionErrors.sol";

/// @notice Reverts direct calls to delegate-only module bytecode (storage context must be the core).
abstract contract DelegatecallGuard {
    address private immutable _moduleImplementation;

    constructor() {
        _moduleImplementation = address(this);
    }

    modifier onlyDelegatecall() {
        if (address(this) == _moduleImplementation) {
            revert StakingExecutionErrors.DirectModuleCall();
        }
        _;
    }
}
