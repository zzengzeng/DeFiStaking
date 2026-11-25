// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BaseTest} from "./BaseTest.sol";
import {Pool, PoolInfo} from "../src/StakeTypes.sol";
import {DualPoolRewardEngine} from "../src/core/DualPoolRewardEngine.sol";
import {EngineHarness} from "./EngineHarness.sol";

contract TestRebalance is BaseTest {
    function testRebalanceMovesAvailableFromAToB() public {
        deal(address(tokenB), ops, 864e18);

        vm.prank(ops);
        tokenB.approve(address(core), 864e18);

        vm.prank(ops);
        core.fundRewards(Pool.A, 864e18);

        vm.prank(alice);
        core.scheduleRewards(Pool.A, 86400);

        vm.warp(block.timestamp + 2000);

        uint256 amount = 20e18;
        PoolInfo memory aBefore = core.getPool(Pool.A);
        PoolInfo memory bBefore = core.getPool(Pool.B);
        vm.prank(alice);

        core.rebalanceBudgets(Pool.A, Pool.B, 20e18);
        PoolInfo memory aAfter = core.getPool(Pool.A);
        PoolInfo memory bAfter = core.getPool(Pool.B);
        assertEq(aAfter.availableRewards, aBefore.availableRewards - amount);
        assertEq(bAfter.availableRewards, bBefore.availableRewards + amount);
    }

    function testRebalanceMovesAvailableFromBToA() public {
        uint256 amount = 864e18;
        deal(address(tokenB), ops, amount);

        vm.prank(ops);
        tokenB.approve(address(core), amount);

        vm.prank(ops);
        core.fundRewards(Pool.B, amount);

        vm.prank(alice);
        core.scheduleRewards(Pool.B, 86400);

        vm.warp(block.timestamp + 1000);

        PoolInfo memory beforePoolInfoA = core.getPool(Pool.A);
        PoolInfo memory beforePoolInfoB = core.getPool(Pool.B);
        vm.prank(alice);
        core.rebalanceBudgets(Pool.B, Pool.A, 10e18);

        PoolInfo memory afterPoolInfoA = core.getPool(Pool.A);
        PoolInfo memory afterPoolInfoB = core.getPool(Pool.B);

        assertEq(afterPoolInfoA.availableRewards, beforePoolInfoA.availableRewards + 10e18);
        assertEq(afterPoolInfoB.availableRewards, beforePoolInfoB.availableRewards - 10e18);
    }

    function testRebalanceDoesNotChangeRatesOrFinish() public {
        deal(address(tokenB), ops, 864e18);

        vm.prank(ops);
        tokenB.approve(address(core), 864e18);

        vm.prank(ops);
        core.fundRewards(Pool.A, 864e18);

        vm.prank(alice);
        core.scheduleRewards(Pool.A, 86400);

        vm.warp(block.timestamp + 2000);

        PoolInfo memory aBefore = core.getPool(Pool.A);
        PoolInfo memory bBefore = core.getPool(Pool.B);
        vm.prank(alice);

        core.rebalanceBudgets(Pool.A, Pool.B, 20e18);
        PoolInfo memory aAfter = core.getPool(Pool.A);
        PoolInfo memory bAfter = core.getPool(Pool.B);

        assertEq(aAfter.rewardRate, aBefore.rewardRate);
        assertEq(bAfter.periodFinish, bBefore.periodFinish);
        assertEq(bAfter.rewardRate, bBefore.rewardRate);
        assertEq(bAfter.periodFinish, bBefore.periodFinish);
    }

    function testRebalanceEmitsBudgetRebalanced() public {
        deal(address(tokenB), ops, 864e18);

        vm.prank(ops);
        tokenB.approve(address(core), 864e18);

        vm.prank(ops);
        core.fundRewards(Pool.A, 864e18);

        vm.prank(alice);
        core.scheduleRewards(Pool.A, 86400);

        vm.warp(block.timestamp + 2000);

        vm.expectEmit(true, true, false, true, address(core));
        emit DualPoolRewardEngine.BudgetRebalanced(Pool.A, Pool.B, 20e18, block.timestamp);
        vm.prank(alice);
        core.rebalanceBudgets(Pool.A, Pool.B, 20e18);
    }

    function testRebalanceAllowsExactlyAtFreeBudget() public {
        deal(address(tokenB), ops, 864e18);

        vm.prank(ops);
        tokenB.approve(address(core), 864e18);

        vm.prank(ops);
        core.fundRewards(Pool.A, 864e18);

        vm.prank(alice);
        core.scheduleRewards(Pool.A, 86400);

        vm.warp(block.timestamp + 2000);

        PoolInfo memory beforeA = core.getPool(Pool.A);
        PoolInfo memory beforeB = core.getPool(Pool.B);

        uint256 remaining = beforeA.periodFinish - block.timestamp;
        uint256 committed = beforeA.rewardRate * remaining;
        uint256 freeBudget = beforeA.availableRewards - committed;

        assertEq(freeBudget, 20e18);

        vm.prank(alice);
        core.rebalanceBudgets(Pool.A, Pool.B, freeBudget);

        PoolInfo memory afterA = core.getPool(Pool.A);
        PoolInfo memory afterB = core.getPool(Pool.B);

        assertEq(afterA.availableRewards, committed);
        assertEq(afterB.availableRewards, beforeB.availableRewards + freeBudget);
        assertEq(afterA.availableRewards, afterA.rewardRate * (afterA.periodFinish - block.timestamp));
    }

    function testRebalanceAllowsFullMoveWhenNoActiveSchedule() public {
        deal(address(tokenB), ops, 864e18);

        vm.prank(ops);
        tokenB.approve(address(core), 864e18);

        vm.prank(ops);
        core.fundRewards(Pool.A, 864e18);

        PoolInfo memory beforePoolInfoA = core.getPool(Pool.A);
        PoolInfo memory beforePoolInfoB = core.getPool(Pool.B);

        uint256 amount = 20e18;
        vm.prank(alice);
        core.rebalanceBudgets(Pool.A, Pool.B, 20e18);

        PoolInfo memory afterPoolInfoA = core.getPool(Pool.A);
        PoolInfo memory afterPoolInfoB = core.getPool(Pool.B);

        assertEq(afterPoolInfoA.availableRewards, beforePoolInfoA.availableRewards - amount);
        assertEq(afterPoolInfoB.availableRewards, beforePoolInfoB.availableRewards + amount);
    }

    function testRebalanceRevertsWhenFromEqualsTo() public {
        uint256 amount = 20e18;
        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.SamePool.selector);
        core.rebalanceBudgets(Pool.A, Pool.A, amount);
    }

    function testRebalanceRevertsWhenZeroAmount() public {
        uint256 amount = 0;
        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.ZeroAmount.selector);
        core.rebalanceBudgets(Pool.A, Pool.B, amount);
    }

    function _newHarness() internal returns (EngineHarness harness) {
        harness = new EngineHarness(address(tokenA), address(tokenB), CAP, 24 hours);
        harness.setUserModule(address(userModule));
        harness.setAdminModule(address(adminModule));
        harness.setAdmin(alice, true);
    }

    function _seedDebt(EngineHarness harness, Pool pool) internal {
        harness.seedDebt(pool, 1);
        harness.seedPending(pool, 1);

        PoolInfo memory p = harness.getPool(pool);
        assertEq(p.badDebt, 1);
        assertEq(p.totalPending, 1);
    }

    function testRebalanceRevertsWhenBadDebtAExists() public {
        EngineHarness harness = _newHarness();

        _seedDebt(harness, Pool.A);

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.BadDebtExists.selector);
        harness.rebalanceBudgets(Pool.A, Pool.B, 20e18);
    }

    function testRebalanceRevertsWhenBadDebtBExists() public {
        EngineHarness harness = _newHarness();

        _seedDebt(harness, Pool.B);

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.BadDebtExists.selector);
        harness.rebalanceBudgets(Pool.A, Pool.B, 20e18);
    }

    function testRebalanceWorksWhenPaused() public {
        deal(address(tokenB), ops, 864e18);

        vm.prank(ops);
        tokenB.approve(address(core), 864e18);

        vm.prank(ops);
        core.fundRewards(Pool.A, 864e18);

        vm.prank(alice);
        core.scheduleRewards(Pool.A, 86400);

        vm.warp(block.timestamp + 2000);

        vm.prank(ops);
        core.pause();

        uint256 amount = 20e18;
        PoolInfo memory aBefore = core.getPool(Pool.A);
        PoolInfo memory bBefore = core.getPool(Pool.B);

        vm.prank(alice);
        core.rebalanceBudgets(Pool.A, Pool.B, 20e18);
        PoolInfo memory aAfter = core.getPool(Pool.A);
        PoolInfo memory bAfter = core.getPool(Pool.B);
        assertEq(aAfter.availableRewards, aBefore.availableRewards - amount);
        assertEq(bAfter.availableRewards, bBefore.availableRewards + amount);
    }

    function testRebalanceRevertsInEmergency() public {
        vm.prank(ops);
        core.enableEmergencyMode();

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.WrongState.selector);
        core.rebalanceBudgets(Pool.A, Pool.B, 20e18);
    }

    function testRebalanceRevertsInShutdown() public {
        vm.prank(ops);
        core.enableEmergencyMode();

        vm.prank(alice);
        core.activateShutdown();

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.WrongState.selector);
        core.rebalanceBudgets(Pool.A, Pool.B, 20e18);
    }

    function testRebalanceInPausedUsesPausedAt() public {
        deal(address(tokenB), ops, 864e18);
        vm.prank(ops);
        tokenB.approve(address(core), 864e18);
        vm.prank(ops);
        core.fundRewards(Pool.A, 864e18);

        vm.prank(alice);
        core.scheduleRewards(Pool.A, 86400);

        vm.warp(block.timestamp + 1000);
        vm.prank(ops);
        core.pause();

        uint256 pausedAt = core.pausedAt();

        vm.warp(block.timestamp + 5000);
        PoolInfo memory p = core.getPool(Pool.A);

        uint256 remaining = p.periodFinish - pausedAt;
        uint256 committed = p.rewardRate * remaining;
        uint256 freeByPausedAt = p.availableRewards - committed;
        assertEq(freeByPausedAt, 10e18);

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.InsufficientFreeBudget.selector);
        core.rebalanceBudgets(Pool.A, Pool.B, 20e18);

        vm.prank(alice);
        core.rebalanceBudgets(Pool.A, Pool.B, freeByPausedAt);

        PoolInfo memory afterA = core.getPool(Pool.A);
        assertEq(afterA.availableRewards, committed);
    }

    function _requiredB() internal view returns (uint256) {
        PoolInfo memory a = core.getPool(Pool.A);
        PoolInfo memory b = core.getPool(Pool.B);
        return b.totalStaked + a.totalPending + b.totalPending + a.availableRewards + b.availableRewards
            + core.unclaimedFeesB();
    }

    function _actualB() internal view returns (uint256) {
        return tokenB.balanceOf(address(core)) + core.getPool(Pool.A).badDebt + core.getPool(Pool.B).badDebt;
    }

    function testRebalancePreservesInvariantB() public {
        deal(address(tokenB), ops, 864e18);
        vm.prank(ops);
        tokenB.approve(address(core), 864e18);
        vm.prank(ops);
        core.fundRewards(Pool.A, 864e18);

        uint256 requiredBefore = _requiredB();
        uint256 actualBefore = _actualB();
        assertGe(actualBefore, requiredBefore);

        uint256 availABefore = core.getPool(Pool.A).availableRewards;
        uint256 availBBefore = core.getPool(Pool.B).availableRewards;

        vm.prank(alice);
        core.rebalanceBudgets(Pool.A, Pool.B, 20e18);

        uint256 requiredAfter = _requiredB();
        uint256 actualAfter = _actualB();

        assertEq(requiredAfter, requiredBefore);
        assertEq(actualAfter, actualBefore);

        assertGe(actualAfter, requiredAfter);

        assertEq(core.getPool(Pool.A).availableRewards, availABefore - 20e18);
        assertEq(core.getPool(Pool.B).availableRewards, availBBefore + 20e18);

        assertEq(core.getPool(Pool.A).badDebt, 0);
        assertEq(core.getPool(Pool.B).badDebt, 0);
    }

    function testRebalancePreservesTokenBBalance() public {
        deal(address(tokenB), ops, 864e18);
        vm.prank(ops);
        tokenB.approve(address(core), 864e18);
        vm.prank(ops);
        core.fundRewards(Pool.A, 864e18);

        uint256 beforeTokenB = tokenB.balanceOf(address(core));

        vm.prank(alice);
        core.rebalanceBudgets(Pool.A, Pool.B, 20e18);

        uint256 afterTokenB = tokenB.balanceOf(address(core));

        assertEq(beforeTokenB, afterTokenB);
    }

    function testRebalancePreservesTotalPending() public {
        deal(address(tokenB), ops, 864e18);
        vm.prank(ops);
        tokenB.approve(address(core), 864e18);
        vm.prank(ops);
        core.fundRewards(Pool.A, 864e18);

        PoolInfo memory beforePoolInfoA = core.getPool(Pool.A);
        PoolInfo memory beforePoolInfoB = core.getPool(Pool.B);

        vm.prank(alice);
        core.rebalanceBudgets(Pool.A, Pool.B, 20e18);

        PoolInfo memory afterPoolInfoA = core.getPool(Pool.A);
        PoolInfo memory afterPoolInfoB = core.getPool(Pool.B);

        assertEq(beforePoolInfoA.totalPending, afterPoolInfoA.totalPending);
        assertEq(beforePoolInfoB.totalPending, afterPoolInfoB.totalPending);
    }

    function testRebalancePreservesUnclaimedFeesB() public {
        deal(address(tokenB), ops, 864e18);
        vm.prank(ops);
        tokenB.approve(address(core), 864e18);
        vm.prank(ops);
        core.fundRewards(Pool.A, 864e18);

        uint256 beforeUnclaimedFeesB = core.unclaimedFeesB();

        vm.prank(alice);
        core.rebalanceBudgets(Pool.A, Pool.B, 20e18);

        uint256 afterUnclaimedFeesB = core.unclaimedFeesB();

        assertEq(beforeUnclaimedFeesB, afterUnclaimedFeesB);
    }

    function testRebalanceRevertsNonAdmin() public {
        vm.prank(bob);
        vm.expectRevert();
        core.rebalanceBudgets(Pool.A, Pool.B, 20e18);
    }

    function testRebalanceThenScheduleTargetPool() public {
        deal(address(tokenB), ops, 864e18);
        vm.prank(ops);
        tokenB.approve(address(core), 864e18);
        vm.prank(ops);
        core.fundRewards(Pool.A, 864e18);

        vm.prank(alice);
        core.rebalanceBudgets(Pool.A, Pool.B, 20e18);

        uint256 duration = 30 days;
        vm.prank(alice);
        core.scheduleRewards(Pool.B, duration);

        PoolInfo memory poolInfoB = core.getPool(Pool.B);

        assertEq(poolInfoB.rewardRate, 20e18 / duration);
        assertEq(poolInfoB.periodFinish, block.timestamp + duration);
        assertEq(poolInfoB.lastUpdateTime, block.timestamp);

        assertEq(core.getPool(Pool.A).availableRewards, 864e18 - 20e18);
    }

    function testCancelThenRebalanceMovesCommitted() public {
        deal(address(tokenB), ops, 864e18);
        vm.prank(ops);
        tokenB.approve(address(core), 864e18);
        vm.prank(ops);
        core.fundRewards(Pool.A, 864e18);

        vm.prank(alice);
        core.scheduleRewards(Pool.A, 86400);

        vm.warp(block.timestamp + 2000);

        PoolInfo memory p = core.getPool(Pool.A);
        uint256 committed = p.rewardRate * (p.periodFinish - block.timestamp);

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.InsufficientFreeBudget.selector);
        core.rebalanceBudgets(Pool.A, Pool.B, committed);

        vm.prank(alice);
        core.cancelRewardSchedule(Pool.A);

        vm.prank(alice);
        core.rebalanceBudgets(Pool.A, Pool.B, 864e18);

        PoolInfo memory afterA = core.getPool(Pool.A);
        PoolInfo memory afterB = core.getPool(Pool.B);
        assertEq(afterA.availableRewards, 0);
        assertEq(afterB.availableRewards, 864e18);
    }

    function testRebalanceRevertsOneWeiAboveFreeBudget() public {
        deal(address(tokenB), ops, 864e18);
        vm.prank(ops);
        tokenB.approve(address(core), 864e18);
        vm.prank(ops);
        core.fundRewards(Pool.A, 864e18);
        vm.prank(alice);
        core.scheduleRewards(Pool.A, 86400);

        vm.warp(block.timestamp + 2000);

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.InsufficientFreeBudget.selector);
        core.rebalanceBudgets(Pool.A, Pool.B, 20e18 + 1);
    }

    function testRebalanceRevertsWhenInvariantBAlreadyBroken() public {
        deal(address(tokenB), ops, 864e18);
        vm.prank(ops);
        tokenB.approve(address(core), 864e18);

        vm.prank(ops);
        core.fundRewards(Pool.A, 864e18);

        deal(address(tokenB), address(core), 800e18);

        vm.prank(alice);
        vm.expectRevert();
        core.rebalanceBudgets(Pool.A, Pool.B, 20e18);
    }
}
