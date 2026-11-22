// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {BaseTest} from "./BaseTest.sol";
import {DualPoolStaking} from "../src/core/DualPoolStaking.sol";
import {Pool, PoolInfo} from "../src/StakeTypes.sol";
import {DualPoolAdminModule} from "../src/core/DualPoolAdminModule.sol";
import {DualPoolStorageLayout} from "../src/core/DualPoolStorageLayout.sol";
import {EngineHarness} from "./EngineHarness.sol";

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
        vm.expectRevert(DualPoolRewardEngine.BadDebtExists.selector);
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

    function testCancelRewardScheduleStopsEmission() public {
        _scheduleRewards();

        vm.warp(block.timestamp + 1000);

        vm.prank(alice);
        core.cancelRewardSchedule(Pool.A);

        PoolInfo memory poolInfoA = core.getPool(Pool.A);
        assertEq(poolInfoA.rewardRate, 0);
        assertEq(poolInfoA.periodFinish, block.timestamp);
    }

    function _scheduleRewards() internal {
        uint256 amount = 999e18;
        uint256 duration = 30 days;
        deal(address(tokenB), ops, amount);

        vm.prank(ops);
        tokenB.approve(address(core), amount);

        vm.prank(ops);
        core.fundRewards(Pool.A, amount);

        vm.prank(alice);
        core.scheduleRewards(Pool.A, duration);
    }

    function testCancelRewardSchedulePreservesAvailable() public {
        _scheduleRewards();

        vm.warp(block.timestamp + 1000);

        PoolInfo memory beforePoolInfo = core.getPool(Pool.A);

        vm.prank(alice);
        core.cancelRewardSchedule(Pool.A);

        PoolInfo memory afterPoolInfo = core.getPool(Pool.A);
        assertEq(beforePoolInfo.availableRewards, afterPoolInfo.availableRewards);
    }

    function testCancelRewardScheduleEmitsRewardScheduleCancelled() public {
        _scheduleRewards();

        vm.warp(block.timestamp + 1000);

        core.crankCatchUpPool(Pool.A);

        PoolInfo memory beforePoolInfo = core.getPool(Pool.A);
        uint256 expectedAt = block.timestamp;

        vm.prank(alice);
        vm.expectEmit(true, false, false, true, address(core));
        emit DualPoolRewardEngine.RewardScheduleCancelled(Pool.A, beforePoolInfo.availableRewards, expectedAt);
        core.cancelRewardSchedule(Pool.A);
    }

    function testCancelRewardScheduleAfterCancelNoFurtherAccrual() public {
        _scheduleRewards();

        vm.warp(block.timestamp + 1000);

        PoolInfo memory beforePoolInfoA = core.getPool(Pool.A);

        vm.prank(alice);
        core.cancelRewardSchedule(Pool.A);

        vm.warp(block.timestamp + 2000);

        PoolInfo memory afterPoolInfoA = core.getPool(Pool.A);

        assertEq(beforePoolInfoA.availableRewards, afterPoolInfoA.availableRewards);
    }

    function testCancelRewardScheduleRevertsWhenNoActiveWindow() public {
        _scheduleRewards();

        vm.warp(block.timestamp + 31 days);

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.NoActiveWindow.selector);
        core.cancelRewardSchedule(Pool.A);
    }

    function testCancelRewardScheduleRevertsOnDoubleCancel() public {
        _scheduleRewards();

        vm.warp(block.timestamp + 1000);

        vm.prank(alice);
        core.cancelRewardSchedule(Pool.A);

        vm.warp(block.timestamp + 3000);

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.NoActiveWindow.selector);
        core.cancelRewardSchedule(Pool.A);
    }

    function testCancelRewardScheduleRevertsAtExactPeriodFinish() public {
        _scheduleRewards();

        vm.warp(block.timestamp + 30 days);

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.NoActiveWindow.selector);
        core.cancelRewardSchedule(Pool.A);
    }

    function testCancelRewardScheduleJustBeforeExpiry() public {
        _scheduleRewards();

        vm.warp(block.timestamp + 30 days - 1);

        vm.prank(alice);
        core.cancelRewardSchedule(Pool.A);

        PoolInfo memory poolInfoA = core.getPool(Pool.A);
        assertEq(poolInfoA.rewardRate, 0);
    }

    function testCancelRewardScheduleWithZeroAvailable() public {
        EngineHarness harness = new EngineHarness(address(tokenA), address(tokenB), CAP, 24 hours);
        harness.setAdminModule(address(adminModule));
        harness.setAdmin(alice, true);

        uint256 finish = block.timestamp + 1000;
        harness.seedPool(Pool.A, 1e16, block.timestamp, finish, 0, 0);

        vm.warp(block.timestamp + 100);

        vm.prank(alice);
        vm.expectEmit(true, false, false, true, address(harness));
        emit DualPoolRewardEngine.RewardScheduleCancelled(Pool.A, 0, block.timestamp);
        harness.cancelRewardSchedule(Pool.A);

        PoolInfo memory p = harness.getPool(Pool.A);
        assertEq(p.availableRewards, 0);
        assertEq(p.rewardRate, 0);
        assertEq(p.periodFinish, block.timestamp);
        assertEq(p.lastUpdateTime, block.timestamp);
    }

    function testCancelRewardScheduleZeroAvailableStopsBadDebtAccrual() public {
        EngineHarness harness = new EngineHarness(address(tokenA), address(tokenB), CAP, 24 hours);
        harness.setAdminModule(address(adminModule));
        harness.setAdmin(alice, true);

        uint256 start = block.timestamp;
        uint256 finish = start + 10_000;

        harness.seedPool(Pool.A, 1e16, start, finish, 100e18, 0);

        vm.warp(start + 1000);
        harness.updateGlobalA();

        uint256 debtBeforeCancel = harness.getPool(Pool.A).badDebt;
        assertGt(debtBeforeCancel, 0);
        assertEq(debtBeforeCancel, 1e16 * 1000);

        vm.prank(alice);
        harness.cancelRewardSchedule(Pool.A);

        PoolInfo memory afterCancel = harness.getPool(Pool.A);
        assertEq(afterCancel.rewardRate, 0);
        assertEq(afterCancel.periodFinish, block.timestamp);
        assertEq(afterCancel.lastUpdateTime, block.timestamp);
        assertEq(afterCancel.badDebt, debtBeforeCancel);

        vm.warp(block.timestamp + 5000);
        harness.updateGlobalA();

        PoolInfo memory afterWarp = harness.getPool(Pool.A);
        assertEq(afterWarp.badDebt, debtBeforeCancel);
        assertEq(afterWarp.totalPending, 1e16 * 1000);
    }

    function _newHarness() internal returns (EngineHarness harness) {
        harness = new EngineHarness(address(tokenA), address(tokenB), CAP, 24 hours);
        harness.setAdminModule(address(adminModule));
    }

    function _seedDebt(EngineHarness harness, Pool pool) internal {
        harness.seedDebt(pool, 1);
        harness.seedPending(pool, 1);

        PoolInfo memory p = harness.getPool(pool);
        assertEq(p.badDebt, 1);
        assertEq(p.totalPending, 1);
    }

    function testCancelRewardScheduleAllowsBadDebtA() public {
        EngineHarness harness = _newHarness();
        harness.setAdminModule(address(adminModule));
        harness.setAdmin(alice, true);
        harness.setOperator(ops, true);
        vm.prank(alice);

        _scheduleRewards(harness, Pool.A);

        _seedDebt(harness, Pool.A);

        vm.prank(alice);
        harness.cancelRewardSchedule(Pool.A);

        PoolInfo memory poolInfoA = harness.getPool(Pool.A);
        assertEq(poolInfoA.rewardRate, 0);
    }

    function _scheduleRewards(EngineHarness harness, Pool pool) public {
        uint256 amount = 999e18;
        uint256 duration = 30 days;
        deal(address(tokenB), ops, amount);

        vm.prank(ops);
        tokenB.approve(address(harness), amount);

        vm.prank(ops);
        harness.fundRewards(pool, amount);

        vm.prank(alice);
        harness.scheduleRewards(pool, duration);
    }

    function testCancelRewardScheduleAllowsBadDebtB() public {
        EngineHarness harness = _newHarness();
        harness.setAdminModule(address(adminModule));
        harness.setAdmin(alice, true);
        harness.setOperator(ops, true);
        vm.prank(alice);

        _scheduleRewards(harness, Pool.A);
        _scheduleRewards(harness, Pool.B);

        _seedDebt(harness, Pool.B);
        _seedDebt(harness, Pool.A);

        vm.prank(alice);
        harness.cancelRewardSchedule(Pool.A);

        vm.prank(alice);
        harness.cancelRewardSchedule(Pool.B);

        PoolInfo memory poolInfoA = harness.getPool(Pool.A);
        PoolInfo memory poolInfoB = harness.getPool(Pool.B);
        assertEq(poolInfoA.rewardRate, 0);
        assertEq(poolInfoB.rewardRate, 0);
    }

    function testCancelRewardScheduleDoesNotChangeBadDebt() public {
        EngineHarness harness = _newHarness();
        harness.setAdminModule(address(adminModule));
        harness.setAdmin(alice, true);
        harness.setOperator(ops, true);
        vm.prank(alice);

        _scheduleRewards(harness, Pool.A);
        _scheduleRewards(harness, Pool.B);

        _seedDebt(harness, Pool.B);
        _seedDebt(harness, Pool.A);

        PoolInfo memory beforePoolInfoA = harness.getPool(Pool.A);
        PoolInfo memory beforePoolInfoB = harness.getPool(Pool.B);

        vm.prank(alice);
        harness.cancelRewardSchedule(Pool.A);

        vm.prank(alice);
        harness.cancelRewardSchedule(Pool.B);

        PoolInfo memory afterPoolInfoA = harness.getPool(Pool.A);
        PoolInfo memory afterPoolInfoB = harness.getPool(Pool.B);
        assertEq(beforePoolInfoA.badDebt, afterPoolInfoA.badDebt);
        assertEq(beforePoolInfoB.badDebt, afterPoolInfoB.badDebt);
    }

    function testCancelRewardScheduleWorksWhenPaused() public {
        _scheduleRewards();

        vm.warp(block.timestamp + 1000);

        vm.prank(ops);
        core.pause();
        uint256 pauseAt = block.timestamp;

        vm.prank(alice);
        core.cancelRewardSchedule(Pool.A);

        PoolInfo memory poolInfoA = core.getPool(Pool.A);
        assertEq(poolInfoA.periodFinish, pauseAt);
        assertEq(poolInfoA.lastUpdateTime, pauseAt);
    }

    function testCancelRewardScheduleEventAtFieldIsPausedAt() public {
        _scheduleRewards();

        vm.warp(block.timestamp + 1000);

        vm.prank(ops);
        core.pause();
        uint256 pauseAt = block.timestamp;

        PoolInfo memory poolInfoA = core.getPool(Pool.A);
        vm.prank(alice);
        vm.expectEmit(true, false, false, true, address(core));
        emit DualPoolRewardEngine.RewardScheduleCancelled(Pool.A, poolInfoA.availableRewards, pauseAt);
        core.cancelRewardSchedule(Pool.A);
    }

    function testCancelRewardScheduleRevertsInEmergency() public {
        _scheduleRewards();

        vm.prank(ops);
        core.enableEmergencyMode();

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.WrongState.selector);
        core.cancelRewardSchedule(Pool.A);
    }

    function testCancelRewardScheduleRevertsInShutdown() public {
        _scheduleRewards();

        vm.prank(ops);
        core.enableEmergencyMode();

        vm.prank(alice);
        core.activateShutdown();

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.WrongState.selector);
        core.cancelRewardSchedule(Pool.A);
    }

    function testCancelRewardScheduleRevertsNonAdmin() public {
        _scheduleRewards();

        vm.prank(bob);
        vm.expectRevert();
        core.cancelRewardSchedule(Pool.A);
    }

    function testCancelRewardScheduleDoesNotChangePending() public {
        EngineHarness harness = _newHarness();
        harness.setAdminModule(address(adminModule));
        harness.setAdmin(alice, true);
        harness.setOperator(ops, true);
        vm.prank(alice);

        _scheduleRewards(harness, Pool.A);
        _scheduleRewards(harness, Pool.B);

        PoolInfo memory beforePoolInfoA = harness.getPool(Pool.A);
        PoolInfo memory beforePoolInfoB = harness.getPool(Pool.B);

        vm.prank(alice);
        harness.cancelRewardSchedule(Pool.A);

        vm.prank(alice);
        harness.cancelRewardSchedule(Pool.B);

        PoolInfo memory afterPoolInfoA = harness.getPool(Pool.A);
        PoolInfo memory afterPoolInfoB = harness.getPool(Pool.B);
        assertEq(beforePoolInfoA.availableRewards, afterPoolInfoA.availableRewards);
        assertEq(beforePoolInfoB.availableRewards, afterPoolInfoB.availableRewards);
    }

    function testCancelRewardScheduleDoesNotAffectOtherPool() public {
        EngineHarness harness = _newHarness();
        harness.setAdminModule(address(adminModule));
        harness.setAdmin(alice, true);
        harness.setOperator(ops, true);
        vm.prank(alice);

        _scheduleRewards(harness, Pool.A);
        _scheduleRewards(harness, Pool.B);

        PoolInfo memory beforePoolInfoB = harness.getPool(Pool.B);

        vm.prank(alice);
        harness.cancelRewardSchedule(Pool.A);

        PoolInfo memory afterPoolInfoB = harness.getPool(Pool.B);
        assertEq(beforePoolInfoB.rewardRate, afterPoolInfoB.rewardRate);
        assertEq(beforePoolInfoB.periodFinish, afterPoolInfoB.periodFinish);
        assertEq(beforePoolInfoB.lastUpdateTime, afterPoolInfoB.lastUpdateTime);
    }

    function testCancelThenRescheduleSucceedsImmediately() public {
        EngineHarness harness = _newHarness();
        harness.setAdminModule(address(adminModule));
        harness.setAdmin(alice, true);
        harness.setOperator(ops, true);

        _scheduleRewards(harness, Pool.A);

        uint256 budget = harness.getPool(Pool.A).availableRewards;
        uint256 newDuration = 10 days;

        vm.prank(alice);
        vm.expectRevert(DualPoolAdminModule.WindowActive.selector);
        harness.scheduleRewards(Pool.A, newDuration);

        vm.prank(alice);
        harness.cancelRewardSchedule(Pool.A);

        PoolInfo memory afterCancel = harness.getPool(Pool.A);
        assertEq(afterCancel.rewardRate, 0);
        assertEq(afterCancel.periodFinish, block.timestamp);
        assertEq(afterCancel.availableRewards, budget);

        uint256 expectedRate = budget / newDuration;
        vm.prank(alice);
        harness.scheduleRewards(Pool.A, newDuration);

        PoolInfo memory afterReschedule = harness.getPool(Pool.A);
        assertEq(afterReschedule.rewardRate, expectedRate);
        assertEq(afterReschedule.periodFinish, block.timestamp + newDuration);
        assertEq(afterReschedule.lastUpdateTime, block.timestamp);
        assertEq(afterReschedule.availableRewards, budget);
    }
}
