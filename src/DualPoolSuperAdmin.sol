// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title DualPoolSuperAdmin
/// @author DeFiStaking Team
/// @notice Role-based governance contract for the DualPool system, built on top of
///         OpenZeppelin's AccessControl. A single super-admin — the deployer holding
///         `DEFAULT_ADMIN_ROLE` (0x00) — controls every other role in this contract:
///         - `DEFAULT_ADMIN_ROLE` (deployer) → grants / revokes both `ADMIN_ROLE` and `OPERATOR_ROLE`
///         - `ADMIN_ROLE`                    → operational admin, assigned to `initialOwner`
///         - `OPERATOR_ROLE`                 → operators (e.g. keepers / bots)
/// @dev Inherits `Ownable`, `AccessControl` and `Pausable`. Both role-management
///      functions (`setAdmin`, `setOperator`) are gated on `DEFAULT_ADMIN_ROLE`,
///      so the deployer retains full control. `ADMIN_ROLE` / `OPERATOR_ROLE` are
///      intended to be consumed by downstream contracts via `hasRole(...)`.
contract DualPoolSuperAdmin is Ownable, AccessControl, Pausable {
    /// @notice Role identifier for the operational admin of the DualPool system.
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @notice Role identifier for operators (e.g. front-end / keeper bots).
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    /// @dev Reverted when a zero address is passed to a role-management function.
    error ZeroAddress();

    /// @notice Initializes the contract.
    /// @dev The deployer (`msg.sender`) receives `DEFAULT_ADMIN_ROLE`; `initialOwner`
    ///      receives `ADMIN_ROLE`. Both role-management functions (`setAdmin`,
    ///      `setOperator`) are gated on `DEFAULT_ADMIN_ROLE`, so the deployer
    ///      retains full control. `Ownable` is also initialised with `initialOwner`.
    /// @param initialOwner Address that will hold `ADMIN_ROLE` after construction.
    constructor(address initialOwner) Ownable(initialOwner) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, initialOwner);
    }

    /// @notice Grants or revokes `ADMIN_ROLE` for `newAdmin`.
    /// @dev Callable only by holders of `DEFAULT_ADMIN_ROLE`.
    /// @param newAdmin Address to grant/revoke the role to/from. Reverts on zero address.
    /// @param enabled `true` to grant, `false` to revoke.
    function setAdmin(address newAdmin, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newAdmin == address(0)) revert ZeroAddress();
        if (enabled) _grantRole(ADMIN_ROLE, newAdmin);
        else _revokeRole(ADMIN_ROLE, newAdmin);
    }

    /// @notice Grants or revokes `OPERATOR_ROLE` for `newOperator`.
    /// @dev Callable only by holders of `DEFAULT_ADMIN_ROLE`.
    /// @param newOperator Address to grant/revoke the role to/from. Reverts on zero address.
    /// @param enabled `true` to grant, `false` to revoke.
    function setOperator(address newOperator, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newOperator == address(0)) revert ZeroAddress();
        if (enabled) _grantRole(OPERATOR_ROLE, newOperator);
        else _revokeRole(OPERATOR_ROLE, newOperator);
    }
}
