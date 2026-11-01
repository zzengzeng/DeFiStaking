// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title DualPoolStakingSuperAdmin
/// @author DeFiStaking Team
/// @notice Role registry for the DualPool system, built on OpenZeppelin `AccessControl`.
/// @dev Three roles exist:
///        - `DEFAULT_ADMIN_ROLE` (0x00): the super-admin. The deployer holds it at
///          construction and it is the admin of both other roles, so only it can
///          grant or revoke them.
///        - `ADMIN_ROLE`: operational admin, granted to `initialOwner` at construction.
///        - `OPERATOR_ROLE`: operators (keepers / bots); unassigned at construction.
///      Downstream modules (e.g. `DualPoolStakingAdmin`) consume roles by calling
///      `hasRole(ROLE, account)`; they never mutate this registry.
///
///      All inherited entry points are hardened:
///        - `grantRole` / `revokeRole` always revert: role changes must go through
///          {setAdmin}, {setOperator}, or {transferSuperAdmin}, so every change emits
///          a dedicated, auditable event.
///        - `renounceRole` always reverts: prevents losing the last super-admin and
///          enforces "never give up the last governance control" (PRD §2.1.1).
///        - `renounceOwnership` always reverts: the owner identity must not be burned.
///        - `transferOwnership` is gated on `DEFAULT_ADMIN_ROLE` and calls the internal
///          `_transferOwnership`, so Ownable's `onlyOwner` modifier is not re-applied.
///      `DEFAULT_ADMIN_ROLE` and `Ownable.owner` are distinct identities (PRD §2.1),
///      but both are handed over atomically by {transferSuperAdmin}.
///      The shared `nonReentrant` guard is applied to every role / ownership mutation
///      entry point per PRD §2.1.1 ¶5, even though none performs external calls today.
contract DualPoolStakingSuperAdmin is Ownable, AccessControl, ReentrancyGuard {
    /// @notice Role identifier for the operational admin of the DualPool system.
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @notice Role identifier for operators (e.g. front-end / keeper bots).
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // ── Errors ────────────────────────────────────────────────────────────

    /// @notice Thrown when a required address argument is the zero address.
    error ZeroAddress();
    /// @notice Thrown by {renounceRole}; renouncing any role is disabled.
    error RenounceForbidden(bytes32 role, address callerConfirmation);
    /// @notice Thrown by {renounceOwnership}; burning the owner is disabled.
    error RenounceOwnershipForbidden();
    /// @notice Thrown by the disabled `grantRole` / `revokeRole` overrides. Use
    ///         {setAdmin}, {setOperator}, or {transferSuperAdmin} instead.
    error RoleUpdateForbidden(bytes32 role, address account);
    /// @notice Thrown when {transferSuperAdmin} is called with `msg.sender`.
    error SelfTransferForbidden();

    // ── Events ────────────────────────────────────────────────────────────

    /// @notice Emitted when {transferSuperAdmin} atomically hands over
    ///         `DEFAULT_ADMIN_ROLE` and `Ownable` ownership.
    /// @param oldSuperAdmin Previous super-admin (the caller).
    /// @param newSuperAdmin New super-admin and owner.
    event SuperAdminTransferred(address oldSuperAdmin, address newSuperAdmin);

    // ── Constructor ───────────────────────────────────────────────────────

    /// @notice Initializes the role registry.
    /// @dev The deployer (`msg.sender`) receives `DEFAULT_ADMIN_ROLE`; `initialOwner`
    ///      receives `ADMIN_ROLE` and becomes the `Ownable` owner. The deployer
    ///      therefore retains full control over role management at construction.
    /// @param initialOwner Address that receives `ADMIN_ROLE` and `Ownable` ownership.
    constructor(address initialOwner) Ownable(initialOwner) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, initialOwner);
    }

    // ── Role management ───────────────────────────────────────────────────

    /// @notice Grants or revokes `ADMIN_ROLE` for `newAdmin`.
    /// @dev Callable only by holders of `DEFAULT_ADMIN_ROLE`. Uses the internal
    ///      `_grantRole` / `_revokeRole`, so it keeps working even though the public
    ///      `grantRole` / `revokeRole` overrides always revert.
    /// @param newAdmin Address to grant or revoke `ADMIN_ROLE` to/from. Reverts on zero.
    /// @param enabled `true` to grant, `false` to revoke.
    function setAdmin(address newAdmin, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (newAdmin == address(0)) revert ZeroAddress();
        if (enabled) _grantRole(ADMIN_ROLE, newAdmin);
        else _revokeRole(ADMIN_ROLE, newAdmin);
    }

    /// @notice Grants or revokes `OPERATOR_ROLE` for `newOperator`.
    /// @dev Callable only by holders of `DEFAULT_ADMIN_ROLE`. Uses the internal
    ///      `_grantRole` / `_revokeRole`, so it keeps working even though the public
    ///      `grantRole` / `revokeRole` overrides always revert.
    /// @param newOperator Address to grant or revoke `OPERATOR_ROLE` to/from. Reverts on zero.
    /// @param enabled `true` to grant, `false` to revoke.
    function setOperator(address newOperator, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (newOperator == address(0)) revert ZeroAddress();
        if (enabled) _grantRole(OPERATOR_ROLE, newOperator);
        else _revokeRole(OPERATOR_ROLE, newOperator);
    }

    /// @notice Atomically hands over `DEFAULT_ADMIN_ROLE` and `Ownable` ownership.
    /// @dev Grants `DEFAULT_ADMIN_ROLE` to `newSuperAdmin`, revokes it from the caller,
    ///      then transfers ownership — all in one transaction, so the registry is never
    ///      left without a super-admin. `ADMIN_ROLE` / `OPERATOR_ROLE` holders are not
    ///      migrated. Reverts on the zero address and on self-transfer.
    /// @param newSuperAdmin Successor address. Must differ from the caller.
    function transferSuperAdmin(address newSuperAdmin) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (newSuperAdmin == address(0)) revert ZeroAddress();
        if (newSuperAdmin == msg.sender) revert SelfTransferForbidden();
        address oldSuperAdmin = msg.sender;
        _grantRole(DEFAULT_ADMIN_ROLE, newSuperAdmin);
        _revokeRole(DEFAULT_ADMIN_ROLE, oldSuperAdmin);
        _transferOwnership(newSuperAdmin);
        emit SuperAdminTransferred(oldSuperAdmin, newSuperAdmin);
    }

    // ── Hardened overrides ────────────────────────────────────────────────

    /// @notice Disabled. Renouncing any role is not allowed in this registry.
    /// @dev Always reverts with {RenounceForbidden}. Use {setAdmin(addr, false)} or
    ///      {setOperator(addr, false)} to remove a role, and {transferSuperAdmin} to
    ///      hand over the super-admin role, so every change is explicit and auditable.
    /// @param role Role the caller is attempting to renounce (unused, echoed in the error).
    /// @param callerConfirmation Expected `msg.sender` (unused, echoed in the error).
    function renounceRole(bytes32 role, address callerConfirmation) public virtual override {
        revert RenounceForbidden(role, callerConfirmation);
    }

    /// @notice Disabled. Ownership cannot be renounced.
    /// @dev Always reverts with {RenounceOwnershipForbidden}. Hand ownership over with
    ///      {transferSuperAdmin} instead, which requires an explicit successor.
    function renounceOwnership() public virtual override {
        revert RenounceOwnershipForbidden();
    }

    /// @notice Transfers `Ownable` ownership to `newOwner`.
    /// @dev Gated on `DEFAULT_ADMIN_ROLE` (not `onlyOwner`) and delegates to the
    ///      internal `_transferOwnership`, so Ownable's `onlyOwner` modifier is not
    ///      re-applied. This changes only the owner identity; `DEFAULT_ADMIN_ROLE`
    ///      stays with the current holder. Use {transferSuperAdmin} to move both.
    /// @param newOwner New owner. Reverts on the zero address.
    function transferOwnership(address newOwner) public virtual override onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (newOwner == address(0)) revert ZeroAddress();
        _transferOwnership(newOwner);
    }

    /// @notice Disabled. Direct role granting is not allowed.
    /// @dev Always reverts with {RoleUpdateForbidden}. Use {setAdmin} / {setOperator};
    ///      the super-admin itself is replaced through {transferSuperAdmin}.
    /// @param role Role that would be granted (unused, echoed in the error).
    /// @param account Recipient that would be granted the role (unused, echoed).
    function grantRole(bytes32 role, address account) public virtual override {
        revert RoleUpdateForbidden(role, account);
    }

    /// @notice Disabled. Direct role revocation is not allowed.
    /// @dev Always reverts with {RoleUpdateForbidden}. Use {setAdmin(addr, false)} or
    ///      {setOperator(addr, false)}.
    /// @param role Role that would be revoked (unused, echoed in the error).
    /// @param account Address that would lose the role (unused, echoed).
    function revokeRole(bytes32 role, address account) public virtual override {
        revert RoleUpdateForbidden(role, account);
    }
}
