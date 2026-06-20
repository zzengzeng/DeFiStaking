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
    address internal constant GOVERNANCE_PROPOSER = address(0xA11CE);
    address internal constant GOVERNANCE_EXECUTOR = address(0xB0B);
    address internal constant SUPER_PROPOSER = address(0xCAFE);
    address internal constant SUPER_EXECUTOR = address(0xD00D);
    address internal constant OPERATOR = address(0x0A11CE);

    function _singleton(address account) private pure returns (address[] memory list) {
        list = new address[](1);
        list[0] = account;
    }

    function testDeploymentGraphFinalRolesMatchScript() public {
        address deployer = address(this);

        DualPoolStaking core = new DualPoolStaking(
            address(new MockERC20("ZZTokenA", "ZZTKA")), address(new MockERC20("ZZTokenB", "ZZTKB")), 10_000_000 * 1e18
        );
        DualPoolUserModule userModule = new DualPoolUserModule();
        DualPoolAdminModule adminModule = new DualPoolAdminModule();

        TimelockController timelockGovernance = new TimelockController(
            GOVERNANCE_MIN_DELAY, _singleton(GOVERNANCE_PROPOSER), _singleton(GOVERNANCE_EXECUTOR), address(0)
        );
        TimelockController timelockSuper =
            new TimelockController(SUPER_MIN_DELAY, _singleton(SUPER_PROPOSER), _singleton(SUPER_EXECUTOR), address(0));

        DualPoolStakingAdmin admin =
            new DualPoolStakingAdmin(address(core), address(timelockGovernance), address(timelockSuper));

        core.setUserModule(address(userModule));
        core.setAdminModule(address(adminModule));

        core.grantRole(core.OPERATOR_ROLE(), OPERATOR);
        core.revokeRole(core.OPERATOR_ROLE(), deployer);
        core.grantRole(core.ADMIN_ROLE(), address(admin));
        core.revokeRole(core.ADMIN_ROLE(), deployer);
        core.grantRole(core.DEFAULT_ADMIN_ROLE(), address(admin));
        core.revokeRole(core.DEFAULT_ADMIN_ROLE(), deployer);
        core.transferOwnership(address(admin));

        assertEq(admin.timelockGovernance(), address(timelockGovernance));
        assertEq(admin.timelockSuper(), address(timelockSuper));
        assertEq(timelockGovernance.getMinDelay(), GOVERNANCE_MIN_DELAY);
        assertEq(timelockSuper.getMinDelay(), SUPER_MIN_DELAY);
        assertTrue(timelockGovernance.hasRole(timelockGovernance.PROPOSER_ROLE(), GOVERNANCE_PROPOSER));
        assertTrue(timelockGovernance.hasRole(timelockGovernance.EXECUTOR_ROLE(), GOVERNANCE_EXECUTOR));
        assertTrue(timelockSuper.hasRole(timelockSuper.PROPOSER_ROLE(), SUPER_PROPOSER));
        assertTrue(timelockSuper.hasRole(timelockSuper.EXECUTOR_ROLE(), SUPER_EXECUTOR));

        assertTrue(core.hasRole(core.ADMIN_ROLE(), address(admin)));
        assertTrue(core.hasRole(core.DEFAULT_ADMIN_ROLE(), address(admin)));
        assertFalse(core.hasRole(core.ADMIN_ROLE(), deployer));
        assertFalse(core.hasRole(core.DEFAULT_ADMIN_ROLE(), deployer));
        assertFalse(core.hasRole(core.OPERATOR_ROLE(), deployer));
        assertTrue(core.hasRole(core.OPERATOR_ROLE(), OPERATOR));
        assertEq(core.owner(), address(admin));
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
