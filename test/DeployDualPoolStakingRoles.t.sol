// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

import {MockERC20} from "../src/MockERC20.sol";
import {DualPoolStaking} from "../src/DualPoolStaking.sol";
import {DualPoolStakingAdmin} from "../src/DualPoolStakingAdmin.sol";
import {DualPoolUserModule} from "../src/modules/DualPoolUserModule.sol";
import {DualPoolAdminModule} from "../src/modules/DualPoolAdminModule.sol";

/// @notice Asserts post-deploy role wiring matches `script/DualPoolStaking.s.sol` (Foundry broadcast sender = deployer).
/// @dev Inlined so `new DualPoolStaking` runs with `msg.sender == deployer` (same as scripted broadcast); calling `Script.run()` from a test contract would make the core `Ownable`/roles attach to the script address instead.
contract DeployDualPoolStakingRolesTest is Test {
    /// @dev Mirrors `DeployDualPoolStaking.run()` role handover after token+core+module deployment.
    function testDeploymentGraphFinalRolesMatchScript() public {
        address deployer = address(this);

        MockERC20 tokenA = new MockERC20("ZTokenA", "ZTKA");
        MockERC20 tokenB = new MockERC20("ZTokenB", "ZTKB");
        uint256 maxCap = 10_000_000 * 1e18;

        DualPoolStaking core = new DualPoolStaking(address(tokenA), address(tokenB), maxCap);
        DualPoolUserModule userModule = new DualPoolUserModule();
        DualPoolAdminModule adminModule = new DualPoolAdminModule();
        DualPoolStakingAdmin admin = new DualPoolStakingAdmin(address(core));

        core.setUserModule(address(userModule));
        core.setAdminModule(address(adminModule));

        address[] memory proposers = new address[](1);
        proposers[0] = deployer;
        address[] memory executors = new address[](1);
        executors[0] = deployer;
        TimelockController timelock = new TimelockController(48 hours, proposers, executors, address(0));

        core.grantRole(core.ADMIN_ROLE(), address(admin));
        core.revokeRole(core.ADMIN_ROLE(), deployer);
        core.grantRole(core.DEFAULT_ADMIN_ROLE(), address(admin));
        core.revokeRole(core.DEFAULT_ADMIN_ROLE(), deployer);

        admin.transferOwnership(address(timelock));

        assertTrue(core.hasRole(core.ADMIN_ROLE(), address(admin)));
        assertTrue(core.hasRole(core.DEFAULT_ADMIN_ROLE(), address(admin)));
        assertFalse(core.hasRole(core.ADMIN_ROLE(), deployer));
        assertFalse(core.hasRole(core.DEFAULT_ADMIN_ROLE(), deployer));
        assertTrue(core.hasRole(core.OPERATOR_ROLE(), deployer));
        assertEq(admin.owner(), address(timelock));
    }
}
