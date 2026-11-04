// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BaseTest} from "./BaseTest.sol";
import {DualPoolStaking} from "../src/core/DualPoolStaking.sol";
import {Pool} from "../src/StakeTypes.sol";
import {DualPoolAdminModule} from "../src/core/DualPoolAdminModule.sol";
import {DualPoolUserModule} from "../src/core/DualPoolUserModule.sol";

contract TestDualPoolStaking is BaseTest {
    function testSmoke() public view {
        assertTrue(core.hasRole(core.DEFAULT_ADMIN_ROLE(), deployer));
        assertEq(core.owner(), deployer);
        assertEq(address(core.getPool(Pool.A).stakingToken), address(tokenA));
    }

    function testSetAdminModuleSucceeds() public {
        DualPoolAdminModule newAddress = new DualPoolAdminModule();
        vm.prank(deployer);
        core.setAdminModule(address(newAddress));
        assertEq(core.adminModule(), address(newAddress));
    }

    function testSetAdminModuleEmitsEvent() public {
        DualPoolAdminModule newAddress = new DualPoolAdminModule();
        vm.startPrank(deployer);
        vm.expectEmit(true, true, false, true);
        emit DualPoolStaking.AdminModuleUpdated(core.adminModule(), address(newAddress), block.timestamp);
        core.setAdminModule(address(newAddress));
        assertEq(core.adminModule(), address(newAddress));
        vm.stopPrank();
    }

    function testSetAdminModuleRevertsOnZero() public {
        vm.prank(deployer);
        vm.expectRevert(DualPoolStaking.ModuleNotSet.selector);
        core.setAdminModule(address(0));
    }

    function testSetAdminModuleRevertsOnEOA() public {
        vm.prank(deployer);
        vm.expectRevert(DualPoolStaking.ModuleNotContract.selector);
        core.setAdminModule(0xa0Ee7A142d267C1f36714E4a8F75612F20a79720);
    }

    function testSetAdminModuleRevertsForNonDefaultAdmin() public {
        DualPoolAdminModule newAddress = new DualPoolAdminModule();
        vm.prank(alice);
        vm.expectRevert();
        core.setAdminModule(address(newAddress));
    }

    function testSetAdminModuleUpdateOldValueCorrect() public {
        DualPoolAdminModule newAddress1 = new DualPoolAdminModule();
        DualPoolAdminModule newAddress2 = new DualPoolAdminModule();

        vm.startPrank(deployer);
        vm.expectEmit(true, true, false, true);
        emit DualPoolStaking.AdminModuleUpdated(core.adminModule(), address(newAddress1), block.timestamp);
        core.setAdminModule(address(newAddress1));

        vm.expectEmit(true, true, false, true);
        emit DualPoolStaking.AdminModuleUpdated(address(newAddress1), address(newAddress2), block.timestamp);
        core.setAdminModule(address(newAddress2));

        vm.stopPrank();
    }

    function testSetUserModuleSucceeds() public {
        DualPoolUserModule newUserModule = new DualPoolUserModule();
        vm.prank(deployer);
        core.setUserModule(address(newUserModule));
        assertEq(core.userModule(), address(newUserModule));
    }

    function testSetUserModuleEmitsEvent() public {
        address oldUserModule = core.userModule();
        DualPoolUserModule newUserModule = new DualPoolUserModule();
        vm.prank(deployer);
        vm.expectEmit(true, true, false, true);
        emit DualPoolStaking.UserModuleUpdated(oldUserModule, address(newUserModule), block.timestamp);
        core.setUserModule(address(newUserModule));
    }

    function testSetUserModuleRevertsOnZero() public {
        vm.prank(deployer);
        vm.expectRevert(DualPoolStaking.ModuleNotSet.selector);
        core.setUserModule(address(0));
    }

    function testSetUserModuleRevertsOnEOA() public {
        vm.prank(deployer);
        vm.expectRevert(DualPoolStaking.ModuleNotContract.selector);
        core.setUserModule(0xa0Ee7A142d267C1f36714E4a8F75612F20a79720);
    }

    function testSetUserModuleRevertsForNonDefaultAdmin() public {
        DualPoolUserModule newAddress = new DualPoolUserModule();
        vm.prank(bob);
        vm.expectRevert();
        core.setUserModule(address(newAddress));
    }
}

