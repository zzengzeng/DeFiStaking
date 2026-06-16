// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

import {MockERC20} from "../src/MockERC20.sol";
import {DualPoolStaking} from "../src/DualPoolStaking.sol";
import {DualPoolStakingAdmin} from "../src/DualPoolStakingAdmin.sol";
import {DualPoolUserModule} from "../src/modules/DualPoolUserModule.sol";
import {DualPoolAdminModule} from "../src/modules/DualPoolAdminModule.sol";

/// @notice Asserts post-deploy role wiring matches `script/DualPoolStaking.s.sol`.
contract DeployDualPoolStakingRolesTest is Test {
    uint256 internal constant GOVERNANCE_MIN_DELAY = 48 hours;
    uint256 internal constant SUPER_MIN_DELAY = 72 hours;

    function testDeploymentGraphFinalRolesMatchScript() public {
        address deployer = address(this);

        MockERC20 tokenA = new MockERC20("ZZTokenA", "ZZTKA");
        MockERC20 tokenB = new MockERC20("ZZTokenB", "ZZTKB");
        uint256 maxCap = 10_000_000 * 1e18;

        DualPoolStaking core = new DualPoolStaking(address(tokenA), address(tokenB), maxCap);
        DualPoolUserModule userModule = new DualPoolUserModule();
        DualPoolAdminModule adminModule = new DualPoolAdminModule();

        address[] memory proposers = new address[](1);
        proposers[0] = deployer;
        address[] memory executors = new address[](1);
        executors[0] = deployer;

        TimelockController timelockGovernance =
            new TimelockController(GOVERNANCE_MIN_DELAY, proposers, executors, address(0));
        TimelockController timelockSuper = new TimelockController(SUPER_MIN_DELAY, proposers, executors, address(0));

        DualPoolStakingAdmin admin =
            new DualPoolStakingAdmin(address(core), address(timelockGovernance), address(timelockSuper));

        core.setUserModule(address(userModule));
        core.setAdminModule(address(adminModule));

        core.grantRole(core.ADMIN_ROLE(), address(admin));
        core.revokeRole(core.ADMIN_ROLE(), deployer);
        core.grantRole(core.DEFAULT_ADMIN_ROLE(), address(admin));
        core.revokeRole(core.DEFAULT_ADMIN_ROLE(), deployer);

        assertEq(admin.timelockGovernance(), address(timelockGovernance));
        assertEq(admin.timelockSuper(), address(timelockSuper));
        assertEq(timelockGovernance.getMinDelay(), GOVERNANCE_MIN_DELAY);
        assertEq(timelockSuper.getMinDelay(), SUPER_MIN_DELAY);

        assertTrue(core.hasRole(core.ADMIN_ROLE(), address(admin)));
        assertTrue(core.hasRole(core.DEFAULT_ADMIN_ROLE(), address(admin)));
        assertFalse(core.hasRole(core.ADMIN_ROLE(), deployer));
        assertFalse(core.hasRole(core.DEFAULT_ADMIN_ROLE(), deployer));
        assertTrue(core.hasRole(core.OPERATOR_ROLE(), deployer));
        assertEq(core.userModule(), address(userModule));
        assertEq(core.adminModule(), address(adminModule));
    }

    function testGovernanceTimelockCannotCallSuperPath() public {
        DualPoolStaking core =
            new DualPoolStaking(address(new MockERC20("A", "A")), address(new MockERC20("B", "B")), 1e24);
        address[] memory one = new address[](1);
        one[0] = address(this);
        TimelockController tlGov = new TimelockController(48 hours, one, one, address(0));
        TimelockController tlSuper = new TimelockController(72 hours, one, one, address(0));
        DualPoolStakingAdmin admin = new DualPoolStakingAdmin(address(core), address(tlGov), address(tlSuper));
        core.grantRole(core.DEFAULT_ADMIN_ROLE(), address(admin));

        vm.prank(address(tlGov));
        vm.expectRevert(abi.encodeWithSelector(DualPoolStakingAdmin.UnauthorizedSuperTimelock.selector, address(tlGov)));
        admin.setUserModule(address(0xBEEF));
    }

    function testSuperTimelockCannotCallGovernancePath() public {
        DualPoolStaking core =
            new DualPoolStaking(address(new MockERC20("A2", "A2")), address(new MockERC20("B2", "B2")), 1e24);
        address[] memory one = new address[](1);
        one[0] = address(this);
        TimelockController tlGov = new TimelockController(48 hours, one, one, address(0));
        TimelockController tlSuper = new TimelockController(72 hours, one, one, address(0));
        DualPoolStakingAdmin admin = new DualPoolStakingAdmin(address(core), address(tlGov), address(tlSuper));
        core.grantRole(core.ADMIN_ROLE(), address(admin));

        vm.prank(address(tlSuper));
        vm.expectRevert(
            abi.encodeWithSelector(DualPoolStakingAdmin.UnauthorizedGovernanceTimelock.selector, address(tlSuper))
        );
        admin.setMinClaimAmount(1);
    }
}
