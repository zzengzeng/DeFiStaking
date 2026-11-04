// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BaseTest} from "./BaseTest.sol";
import {DualPoolStaking} from "../src/core/DualPoolStaking.sol";
import {IDualPoolAdminModule} from "../src/interfaces/IDualPoolAdminModule.sol";
import {DualPoolStorageLayout} from "../src/core/DualPoolStorageLayout.sol";
import {DualPoolRoles} from "../src/core/DualPoolRoles.sol";

contract TestRoles is BaseTest {
    function testSetAdminGrantRevoke() public {
        vm.startPrank(deployer);
        core.setAdmin(address(adminModule), true);
        assertTrue(core.hasRole(ADMIN_ROLE, address(adminModule)));

        core.setAdmin(address(adminModule), false);
        assertFalse(core.hasRole(ADMIN_ROLE, deployer));
        vm.stopPrank();
    }

    function testSetAdminRevertsOnZeroAddress() public {
        vm.prank(deployer);
        vm.expectRevert(DualPoolStorageLayout.ZeroAddress.selector);
        core.setAdmin(address(0), true);
    }

    function testSetAdminRevertsForNonDefaultAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        core.setAdmin(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266, true);
    }

    function testSetOperatorGrantRevoke() public {
        vm.startPrank(deployer);
        core.setOperator(ops, true);
        assertTrue(core.hasRole(OPERATOR_ROLE, ops));

        core.setOperator(ops, false);
        assertFalse(core.hasRole(OPERATOR_ROLE, ops));
        vm.stopPrank();
    }

    function testSetOperatorRevertsOnZeroAddress() public {
        vm.prank(deployer);
        vm.expectRevert(DualPoolStorageLayout.ZeroAddress.selector);
        core.setOperator(address(0), true);
    }

    function testSetOperatorRevertsForNonDefaultAdmin() public {
        vm.startPrank(deployer);
        core.transferSuperAdmin(alice);
        vm.expectRevert();
        core.setOperator(ops, true);
        vm.stopPrank();
    }

    function testRoleAdminTopology() public {
        vm.prank(deployer);
        assertEq(core.getRoleAdmin(core.ADMIN_ROLE()), core.DEFAULT_ADMIN_ROLE());
        assertEq(core.getRoleAdmin(core.OPERATOR_ROLE()), core.DEFAULT_ADMIN_ROLE());
    }

    function testGrantRoleForbidden() public {
        vm.prank(deployer);
        vm.expectRevert(abi.encodeWithSelector(DualPoolRoles.RoleUpdateForbidden.selector, ADMIN_ROLE, alice));
        core.grantRole(ADMIN_ROLE, alice);
    }

    function testRevokeRoleForbidden() public {
        vm.prank(deployer);
        vm.expectRevert(abi.encodeWithSelector(DualPoolRoles.RoleUpdateForbidden.selector, ADMIN_ROLE, alice));
        core.revokeRole(ADMIN_ROLE, alice);
    }

    function testRenounceRoleForbidden() public {
        vm.prank(deployer);
        vm.expectRevert(abi.encodeWithSelector(DualPoolRoles.RenounceForbidden.selector, ADMIN_ROLE, alice));
        core.renounceRole(ADMIN_ROLE, alice);
    }

    function testRenounceOwnershipForbidden() public {
        vm.prank(deployer);
        vm.expectRevert(DualPoolRoles.RenounceOwnershipForbidden.selector);
        core.renounceOwnership();
    }

    function testTransferOwnershipRequiresDefaultAdmin() public {
        vm.startPrank(deployer);
        core.transferSuperAdmin(alice);
        vm.expectRevert();
        core.transferSuperAdmin(alice);
        vm.stopPrank();
    }

    function testTransferSuperAdminRevertsOnSelf() public {
        vm.prank(deployer);
        vm.expectRevert(DualPoolRoles.SelfTransferForbidden.selector);
        core.transferSuperAdmin(deployer);
    }

    function testTransferSuperAdminAtomicHandover() public {
        vm.startPrank(deployer);
        core.transferSuperAdmin(alice);
        assertTrue(core.hasRole(core.DEFAULT_ADMIN_ROLE(), alice));
        assertTrue(core.hasRole(core.ADMIN_ROLE(), alice));
        assertFalse(core.hasRole(core.DEFAULT_ADMIN_ROLE(), deployer));
        assertFalse(core.hasRole(core.ADMIN_ROLE(), deployer));
        vm.stopPrank();
    }

    function testTransferSuperAdminRevertsOnZeroAddress() public {
        vm.prank(deployer);
        vm.expectRevert(DualPoolStorageLayout.ZeroAddress.selector);
        core.transferSuperAdmin(address(0));
    }

    function testTransferSuperAdminRevertsForNonDefaultAdmin() public {
        vm.prank(bob);
        vm.expectRevert();
        core.transferSuperAdmin(address(0));
    }

    function testTransferSuperAdminKeepsOtherRoles() public {
        vm.startPrank(deployer);
        core.transferSuperAdmin(treasury);
        assertTrue(core.hasRole(core.DEFAULT_ADMIN_ROLE(), treasury));
        assertTrue(core.hasRole(core.OPERATOR_ROLE(), ops));
        assertTrue(core.hasRole(core.ADMIN_ROLE(), alice));
        vm.stopPrank();
    }

    function testDefaultAdminCannotCallAdminGatedFunction() public {
        vm.prank(deployer);
        vm.expectRevert();
        core.setLockDuration(10 days);
    }

    function testAdminRoleCanCallAdminGatedFunction() public {
        vm.prank(alice);
        core.setLockDuration(10 days);
        assertEq(core.lockDuration(), 10 days);
    }

    function testRevokingAdminRoleRemovesAccess() public {
        vm.prank(deployer);
        core.setAdmin(alice, false);
        vm.prank(alice);
        vm.expectRevert();
        core.setLockDuration(6 days);
    }

    function testOperatorCannotCallAdminGatedFunction() public {
        vm.prank(ops);
        vm.expectRevert();
        core.setLockDuration(8 days);
    }

    function testNoRoleAddressCannotCallAdminGatedFunction() public {
        vm.prank(bob);
        vm.expectRevert();
        core.setLockDuration(3 days);
    }

    function testAdminRoleCannotCallDefaultAdminGatedFunction() public {
        vm.prank(alice);
        vm.expectRevert();
        core.setAdmin(bob, true);
    }
}
