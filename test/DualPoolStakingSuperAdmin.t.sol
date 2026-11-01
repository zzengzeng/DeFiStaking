// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";

import {DualPoolStakingSuperAdmin} from "../src/DualPoolStakingSuperAdmin.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

/// @notice Tests for DualPoolSuperAdmin.
/// @dev Each `test*` function runs independently after a fresh `setUp()`.
contract DualPoolSuperAdminTest is Test {
    DualPoolStakingSuperAdmin internal admin;

    address internal deployer = makeAddr("deployer");
    address internal initialOwner = makeAddr("initialOwner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        vm.startPrank(deployer);
        admin = new DualPoolStakingSuperAdmin(initialOwner);
        vm.stopPrank();
    }

    function testConstructorDeployerHasDefaultAdminRole() public view {
        bytes32 role = admin.DEFAULT_ADMIN_ROLE();
        assertTrue(admin.hasRole(role, deployer));
    }

    function testConstructorInitialOwnerHasAdminRole() public view {
        bytes32 role = admin.ADMIN_ROLE();
        assertTrue(admin.hasRole(role, initialOwner));
    }

    function testConstructorOwnerIsInitialOwner() public view {
        assertEq(admin.owner(), initialOwner);
    }

    function testConstructorDeployerLacksAdminRole() public view {
        bytes32 role = admin.ADMIN_ROLE();
        assertFalse(admin.hasRole(role, deployer));
    }

    function testConstructorNooneHasOperatorRoleInitially() public view {
        bytes32 role = admin.OPERATOR_ROLE();
        assertFalse(admin.hasRole(role, deployer));
        assertFalse(admin.hasRole(role, initialOwner));
    }

    function testSetAdminGrant() public {
        vm.startPrank(deployer);
        bytes32 role = admin.ADMIN_ROLE();
        assertFalse(admin.hasRole(role, bob));

        admin.setAdmin(bob, true);
        assertTrue(admin.hasRole(role, bob));

        vm.stopPrank();
    }

    function testSetAdminRevoke() public {
        vm.startPrank(deployer);
        bytes32 role = admin.ADMIN_ROLE();

        admin.setAdmin(bob, true);
        assertTrue(admin.hasRole(role, bob));

        admin.setAdmin(bob, false);
        assertFalse(admin.hasRole(role, bob));
        vm.stopPrank();
    }

    function testSetAdminGrantSelf() public {
        vm.startPrank(deployer);
        bytes32 role = admin.ADMIN_ROLE();

        assertFalse(admin.hasRole(role, deployer));
        admin.setAdmin(deployer, true);
        assertTrue(admin.hasRole(role, deployer));
        vm.stopPrank();
    }

    function testSetAdminRevertWhenCallerNotDefaultAdmin() public {
        vm.startPrank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, bytes32(0))
        );
        admin.setAdmin(alice, true);
        vm.stopPrank();
    }

    function testSetAdminRevertWhenCallerIsOnlyAdminRole() public {
        vm.startPrank(initialOwner);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, initialOwner, bytes32(0))
        );
        admin.setAdmin(bob, true);
        vm.stopPrank();
    }

    function testSetAdminRevertWhenZeroAddress() public {
        vm.startPrank(deployer);
        vm.expectRevert(DualPoolStakingSuperAdmin.ZeroAddress.selector);
        admin.setAdmin(address(0), true);
        vm.stopPrank();
    }

    function testSetOperatorGrant() public {
        vm.startPrank(deployer);
        bytes32 role = admin.OPERATOR_ROLE();
        assertFalse(admin.hasRole(role, bob));
        admin.setOperator(bob, true);
        assertTrue(admin.hasRole(role, bob));
        vm.stopPrank();
    }

    function testSetOperatorRevoke() public {
        vm.startPrank(deployer);
        bytes32 role = admin.OPERATOR_ROLE();
        assertFalse(admin.hasRole(role, bob));
        admin.setOperator(bob, true);
        assertTrue(admin.hasRole(role, bob));
        admin.setOperator(bob, false);
        assertFalse(admin.hasRole(role, bob));
        vm.stopPrank();
    }

    function testSetOperatorMultipleOperatorsCoexist() public {
        vm.startPrank(deployer);
        bytes32 role = admin.OPERATOR_ROLE();
        admin.setOperator(alice, true);
        assertTrue(admin.hasRole(role, alice));
        admin.setOperator(bob, true);
        assertTrue(admin.hasRole(role, bob));
        vm.stopPrank();
    }

    function testSetOperatorRevertWhenCallerNotDefaultAdmin() public {
        vm.startPrank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, bytes32(0))
        );
        admin.setOperator(bob, true);
        vm.stopPrank();
    }

    function testSetOperatorRevertWhenCallerIsOnlyAdminRole() public {
        vm.startPrank(initialOwner);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, initialOwner, bytes32(0))
        );
        admin.setOperator(bob, true);
        vm.stopPrank();
    }

    function testSetOperatorRevertWhenZeroAddress() public {
        vm.startPrank(deployer);
        vm.expectRevert(DualPoolStakingSuperAdmin.ZeroAddress.selector);
        admin.setOperator(address(0), true);
        vm.stopPrank();
    }

    function testSetAdminGrantEmitsRoleGranted() public {
        vm.startPrank(deployer);
        bytes32 role = admin.ADMIN_ROLE();
        vm.expectEmit(true, true, true, true);
        emit IAccessControl.RoleGranted(role, alice, deployer);
        admin.setAdmin(alice, true);
        vm.stopPrank();
    }

    function testSetAdminRevokeEmitsRoleRevoked() public {
        vm.startPrank(deployer);
        bytes32 role = admin.ADMIN_ROLE();

        admin.setAdmin(alice, true);
        vm.expectEmit(true, true, true, true);
        emit IAccessControl.RoleRevoked(role, alice, deployer);
        admin.setAdmin(alice, false);

        vm.stopPrank();
    }

    function testFuzzSetAdminGrantAnyAddress(address who) public {
        vm.startPrank(deployer);
        bytes32 role = admin.ADMIN_ROLE();
        vm.assume(who != address(0));
        admin.setAdmin(who, true);
        assertTrue(admin.hasRole(role, who));
        vm.stopPrank();
    }

    function testFuzzSetOperatorOnlyDefaultAdminCanCall(address caller) public {
        vm.assume(caller != deployer);
        vm.prank(caller);
        vm.expectRevert();
        admin.setOperator(bob, true);
    }

    function testTransferSuperAdminSelfTransferReverts() public {
        vm.prank(deployer);
        vm.expectRevert(DualPoolStakingSuperAdmin.SelfTransferForbidden.selector);
        admin.transferSuperAdmin(deployer);
    }

    function testTransferOwnershipByDefaultAdminSucceeds() public {
        assertEq(admin.owner(), initialOwner);
        vm.prank(deployer);
        admin.transferOwnership(deployer);
        assertEq(admin.owner(), deployer);
    }

    function testRenounceForbidden() public {
        bytes32 role = admin.ADMIN_ROLE();
        vm.prank(deployer);
        vm.expectRevert(abi.encodeWithSelector(DualPoolStakingSuperAdmin.RenounceForbidden.selector, role, deployer));
        admin.renounceRole(role, deployer);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(DualPoolStakingSuperAdmin.RenounceForbidden.selector, role, alice));
        admin.renounceRole(role, alice);
    }

    function testRenounceOwnershipForbidden() public {
        vm.prank(deployer);
        vm.expectRevert(DualPoolStakingSuperAdmin.RenounceOwnershipForbidden.selector);
        admin.renounceOwnership();
    }

    function testRoleUpdateForbidden() public {
        bytes32 role = admin.ADMIN_ROLE();
        vm.prank(deployer);
        vm.expectRevert(abi.encodeWithSelector(DualPoolStakingSuperAdmin.RoleUpdateForbidden.selector, role, deployer));
        admin.grantRole(role, deployer);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(DualPoolStakingSuperAdmin.RoleUpdateForbidden.selector, role, alice));
        admin.revokeRole(role, alice);
    }

    function testTransferOwnershipHappyPath() public {
        vm.startPrank(deployer);
        admin.transferOwnership(alice);
        admin.setAdmin(bob, true);
        assertEq(admin.owner(), alice);
        vm.stopPrank();
    }

    function testTransferOwnershipZeroAddress() public {
        vm.startPrank(deployer);
        vm.expectRevert(DualPoolStakingSuperAdmin.ZeroAddress.selector);
        admin.transferOwnership(address(0));
        vm.stopPrank();
    }

    function testTransferOwnershipUnauthorizedAccount() public {
        vm.startPrank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, bytes32(0))
        );
        admin.transferOwnership(bob);
        vm.stopPrank();
    }

    function testTransferSuperAdminHappyPath() public {
        vm.prank(deployer);
        admin.setOperator(bob, true);
        assertTrue(admin.hasRole(admin.OPERATOR_ROLE(), bob));

        vm.prank(deployer);
        admin.transferSuperAdmin(alice);

        assertTrue(admin.hasRole(admin.DEFAULT_ADMIN_ROLE(), alice));
        assertEq(admin.owner(), alice);

        assertFalse(admin.hasRole(admin.DEFAULT_ADMIN_ROLE(), deployer));

        assertTrue(admin.hasRole(admin.ADMIN_ROLE(), initialOwner));
        assertTrue(admin.hasRole(admin.OPERATOR_ROLE(), bob));

        vm.prank(alice);
        admin.setAdmin(makeAddr("carol"), true);
        assertTrue(admin.hasRole(admin.ADMIN_ROLE(), makeAddr("carol")));

        vm.prank(deployer);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, deployer, bytes32(0))
        );
        admin.setAdmin(makeAddr("momo"), true);
    }

    function testTransferSuperAdminZeroAddress() public {
        vm.prank(deployer);
        vm.expectRevert(DualPoolStakingSuperAdmin.ZeroAddress.selector);
        admin.transferSuperAdmin(address(0));
    }

    function testTransferSuperAdminUnauthorizedAccount() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, bytes32(0))
        );
        admin.transferSuperAdmin(bob);
    }

    function testTransferSuperAdminEmitsEvent() public {
        vm.prank(deployer);
        vm.expectEmit(true, true, true, true);
        emit DualPoolStakingSuperAdmin.SuperAdminTransferred(deployer, alice);
        admin.transferSuperAdmin(alice);
    }
}
