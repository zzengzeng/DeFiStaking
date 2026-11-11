// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {BaseTest} from "./BaseTest.sol";
import {DualPoolStaking} from "../src/core/DualPoolStaking.sol";
import {Pool, PoolInfo} from "../src/StakeTypes.sol";
import {DualPoolAdminModule} from "../src/core/DualPoolAdminModule.sol";
import {DualPoolStorageLayout} from "../src/core/DualPoolStorageLayout.sol";

import {DualPoolRewardEngine} from "../src/core/DualPoolRewardEngine.sol";

contract TestRewardSchedule is BaseTest {
    function testScheduleSucceeds() public {
        uint256 amount = 999e18;
        uint256 duration = 30 days;
        deal(address(tokenB), ops, amount);

        vm.prank(ops);
        tokenB.approve(address(core), amount);

        vm.prank(ops);
        core.fundRewards(Pool.A, amount);

        uint256 expectedRate = amount / duration;

        vm.prank(alice);
        vm.expectEmit(true, false, false, true, address(core));
        emit DualPoolAdminModule.RewardScheduled(
            Pool.A, duration, expectedRate, block.timestamp, block.timestamp + duration
        );
        core.scheduleRewards(Pool.A, duration);

        PoolInfo memory p = core.getPool(Pool.A);
        assertEq(p.rewardRate, expectedRate);
        assertEq(p.periodFinish, block.timestamp + duration);
        assertEq(p.lastUpdateTime, block.timestamp);
        assertEq(p.availableRewards, amount);
    }

    function testScheduleZeroDurationUsesDefault() public {
        uint256 amount = 100e18;
        uint256 defaultDuration = 30 days;

        vm.prank(alice);
        core.setRewardDuration(Pool.A, defaultDuration);
        deal(address(tokenB), ops, amount);
        vm.prank(ops);
        tokenB.approve(address(core), amount);

        vm.prank(ops);
        core.fundRewards(Pool.A, amount);

        vm.prank(alice);
        core.scheduleRewards(Pool.A, 0);

        PoolInfo memory p = core.getPool(Pool.A);
        assertEq(p.lastUpdateTime, block.timestamp);
        assertEq(p.periodFinish, block.timestamp + defaultDuration);
        assertEq(p.rewardRate, amount / defaultDuration);
        assertEq(p.availableRewards, amount);
    }

    function testScheduleZeroDefaultReverts() public {
        uint256 amount = 200e18;

        deal(address(tokenB), ops, amount);

        vm.prank(ops);
        tokenB.approve(address(core), amount);

        vm.prank(ops);
        core.fundRewards(Pool.A, amount);

        vm.prank(alice);
        vm.expectRevert(DualPoolStorageLayout.InvalidRewardDuration.selector);
        core.scheduleRewards(Pool.A, 0);
    }

    function testScheduleBelowMinDuration() public {
        uint256 defaultDuration = 30 days;
        uint256 duration = 1 days - 1;
        uint256 amount = 100e18;

        vm.prank(alice);
        core.setRewardDuration(Pool.A, defaultDuration);

        deal(address(tokenB), ops, amount);
        vm.prank(ops);
        tokenB.approve(address(core), amount);

        vm.prank(ops);
        core.fundRewards(Pool.A, amount);

        vm.prank(alice);
        vm.expectRevert(DualPoolStorageLayout.InvalidRewardDuration.selector);
        core.scheduleRewards(Pool.A, duration);
    }

    function testScheduleAboveMaxDuration() public {
        uint256 defaultDuration = 30 days;
        uint256 duration = 365 days + 1;
        uint256 amount = 200e18;

        vm.prank(alice);
        core.setRewardDuration(Pool.A, defaultDuration);

        deal(address(tokenB), ops, amount);
        vm.prank(ops);
        tokenB.approve(address(core), amount);

        vm.prank(ops);
        core.fundRewards(Pool.A, amount);

        vm.prank(alice);
        vm.expectRevert(DualPoolStorageLayout.InvalidRewardDuration.selector);
        core.scheduleRewards(Pool.A, duration);
    }

    function testScheduleZeroBudgetReverts() public {
        uint256 duration = 30 days;
        vm.prank(alice);
        vm.expectRevert(DualPoolAdminModule.InvalidRate.selector);
        core.scheduleRewards(Pool.A, duration);
    }

    function testScheduleAboveRateCapReverts() public {
        uint256 amount = 6e21;
        uint256 duration = 1 days;

        vm.prank(alice);
        core.setRewardDuration(Pool.A, duration);

        deal(address(tokenB), ops, amount);
        vm.prank(ops);
        tokenB.approve(address(core), amount);

        vm.prank(ops);
        core.fundRewards(Pool.A, amount);

        vm.prank(alice);
        vm.expectRevert(DualPoolAdminModule.InvalidRate.selector);
        core.scheduleRewards(Pool.A, duration);
    }

    function testScheduleWindowActiveReverts() public {
        uint256 amount = 100e18;
        uint256 defaultDuration = 30 days;

        vm.prank(alice);
        core.setRewardDuration(Pool.A, defaultDuration);

        deal(address(tokenB), ops, amount);
        vm.prank(ops);
        tokenB.approve(address(core), amount);

        vm.prank(ops);
        core.fundRewards(Pool.A, amount);

        vm.prank(alice);
        core.scheduleRewards(Pool.A, defaultDuration);

        vm.prank(alice);
        vm.expectRevert(DualPoolAdminModule.WindowActive.selector);
        core.scheduleRewards(Pool.A, 10 days);
    }

    function testScheduleWithBadDebtReverts() public {
        vm.store(address(core), bytes32(uint256(18)), bytes32(uint256(1)));

        uint256 amount = 100e18;
        uint256 defaultDuration = 30 days;

        vm.prank(alice);
        core.setRewardDuration(Pool.A, defaultDuration);

        deal(address(tokenB), ops, amount);
        vm.prank(ops);
        tokenB.approve(address(core), amount);

        vm.prank(ops);
        core.fundRewards(Pool.A, amount);

        vm.prank(alice);
        vm.expectRevert(DualPoolAdminModule.BadDebtExists.selector);
        core.scheduleRewards(Pool.A, 0);
    }

    function testScheduleEmergencyReverts() public {
        vm.prank(ops);
        core.enableEmergencyMode();

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.WrongState.selector);
        core.scheduleRewards(Pool.A, 0);
    }

    function testScheduleShutdownReverts() public {
        vm.store(address(core), bytes32(uint256(44)), bytes32(uint256(1) << 8));

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.WrongState.selector);
        core.scheduleRewards(Pool.A, 0);
    }

    function testSchedulePausedAllowed() public {
        uint256 defaultDuration = 30 days;
        uint256 amount = 100e18;

        vm.prank(alice);
        core.setRewardDuration(Pool.A, defaultDuration);

        deal(address(tokenB), ops, amount);
        vm.prank(ops);
        tokenB.approve(address(core), amount);

        vm.prank(ops);
        core.fundRewards(Pool.A, amount);

        vm.prank(ops);
        core.pause();

        vm.prank(alice);
        core.scheduleRewards(Pool.A, 0);
        PoolInfo memory p = core.getPool(Pool.A);
        assertEq(p.lastUpdateTime, core.pausedAt());
        assertEq(p.periodFinish, core.pausedAt() + defaultDuration);
        assertEq(p.rewardRate, amount / defaultDuration);
    }

    function testScheduleNonAdminReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, bob, core.ADMIN_ROLE())
        );
        vm.prank(bob);
        core.scheduleRewards(Pool.A, 0);
    }

    function testScheduleDoesNotConsumeAvailable() public {
        uint256 amount = 100e18;
        uint256 defaultDuration = 30 days;

        vm.prank(alice);
        core.setRewardDuration(Pool.A, defaultDuration);

        deal(address(tokenB), ops, amount);
        vm.prank(ops);
        tokenB.approve(address(core), amount);

        vm.prank(ops);
        core.fundRewards(Pool.A, amount);

        vm.prank(alice);
        core.scheduleRewards(Pool.A, 0);
        PoolInfo memory p = core.getPool(Pool.A);
        assertEq(p.availableRewards, amount);
    }
}
