// SPDX-License-Identifier:MIT
pragma solidity ^0.8.20;
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {DualPoolStorageLayout} from "../core/DualPoolStorageLayout.sol";

abstract contract DualPoolRoles is DualPoolStorageLayout, Ownable, AccessControl, Pausable, ReentrancyGuard {
    error SelfTransferForbidden();
    error RoleUpdateForbidden(bytes32 role, address account);
    error RenounceForbidden(bytes32 role, address callerConfirm);
    error RenounceOwnershipForbidden();

    event SuperAdminTransferred(address indexed oldSuperAdmin, address indexed newSuperAdmin, uint256 currentTime);

    constructor() Ownable(msg.sender) {}

    function setAdmin(address newAdmin, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (newAdmin == address(0)) revert ZeroAddress();
        if (enabled) _grantRole(ADMIN_ROLE, newAdmin);
        else _revokeRole(ADMIN_ROLE, newAdmin);
    }

    function setOperator(address newOperator, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (newOperator == address(0)) revert ZeroAddress();
        if (enabled) _grantRole(OPERATOR_ROLE, newOperator);
        else _revokeRole(OPERATOR_ROLE, newOperator);
    }

    function transferSuperAdmin(address newSuperAdmin) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (newSuperAdmin == address(0)) revert ZeroAddress();
        if (newSuperAdmin == msg.sender) revert SelfTransferForbidden();
        address oldSuperAdmin = msg.sender;
        _grantRole(DEFAULT_ADMIN_ROLE, newSuperAdmin);
        _revokeRole(DEFAULT_ADMIN_ROLE, oldSuperAdmin);
        _transferOwnership(newSuperAdmin);
        emit SuperAdminTransferred(oldSuperAdmin, newSuperAdmin, block.timestamp);
    }

    function transferOwnership(address newOwner) public virtual override onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (newOwner == address(0)) revert ZeroAddress();
        _transferOwnership(newOwner);
    }

    function grantRole(bytes32 role, address account) public pure override {
        revert RoleUpdateForbidden(role, account);
    }

    function revokeRole(bytes32 role, address account) public pure override {
        revert RoleUpdateForbidden(role, account);
    }

    function renounceRole(bytes32 role, address callerConfirmation) public pure override {
        revert RenounceForbidden(role, callerConfirmation);
    }

    function renounceOwnership() public pure override {
        revert RenounceOwnershipForbidden();
    }
}
