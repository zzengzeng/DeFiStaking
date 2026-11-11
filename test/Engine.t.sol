// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {DualPoolRewardEngine} from "../src/core/DualPoolRewardEngine.sol";
import {EngineHarness} from "./EngineHarness.sol";
import {BaseTest} from "./BaseTest.sol";
import {Pool, PoolInfo, UserInfo} from "../src/StakeTypes.sol";

contract TestEngine is BaseTest {
    EngineHarness harness;

    function setUp() public override {
        super.setUp();

        vm.prank(deployer);
        harness = new EngineHarness(address(tokenA), address(tokenB), CAP, 24 hours);

        vm.startPrank(deployer);
        harness.setOperator(ops, true);
        harness.setAdmin(alice, true);
        vm.stopPrank();
    }

    function testSettle() public {
        harness.seedUser(Pool.A, alice, 100e18, 0);
        harness.seedAcc(Pool.A, 1e45);

        harness.settleA(alice);
        UserInfo memory u = harness.getUserA(alice);
        assertEq(u.rewards, 100e18);
    }

    function testSettleSyncsBooked() public {
        harness.seedUser(Pool.A, alice, 100e18, 0);
        harness.seedAcc(Pool.A, 1e45);

        harness.settleA(alice);
        PoolInfo memory p = harness.getPool(Pool.A);
        assertEq(p.bookedUserRewards, 100e18);
    }

    function testSettleUpdatesSnapshot() public {
        harness.seedUser(Pool.A, alice, 200e18, 0);
        harness.seedAcc(Pool.A, 1e45);

        harness.settleA(alice);
        UserInfo memory u = harness.getUserA(alice);
        assertEq(u.rewardPaid, 1e45);
    }

    function testSettleZeroEarnedStillUpdatesSnapshot() public {
        harness.seedUser(Pool.A, alice, 0, 0);
        harness.seedAcc(Pool.A, 1e45);

        harness.settleA(alice);
        UserInfo memory u = harness.getUserA(alice);
        assertEq(u.rewardPaid, 1e45);
        assertEq(u.rewards, 0);
    }

    function testSettleSecondTimeNoDoubleCount() public {
        harness.seedUser(Pool.A, alice, 100e18, 0);
        harness.seedAcc(Pool.A, 1e45);

        harness.settleA(alice);
        harness.settleA(alice);

        UserInfo memory u = harness.getUserA(alice);
        assertEq(u.rewards, 100e18);
    }

    function testSettleMultiUserBookedSum() public {
        harness.seedUser(Pool.A, alice, 100e18, 0);
        harness.seedAcc(Pool.A, 1e45);
        harness.settleA(alice);

        harness.seedUser(Pool.A, bob, 100e18, 0);
        harness.seedAcc(Pool.A, 1e45);
        harness.settleA(bob);

        UserInfo memory uA = harness.getUserA(alice);
        UserInfo memory uB = harness.getUserA(bob);

        PoolInfo memory p = harness.getPool(Pool.A);
        assertEq(uA.rewards, 100e18);
        assertEq(uB.rewards, 100e18);
        assertEq(p.bookedUserRewards, (uA.rewards + uB.rewards));
    }

    function testSettleDoesNotTouchPending() public {
        harness.seedUser(Pool.A, alice, 100e18, 0);
        harness.seedAcc(Pool.A, 1e45);
        harness.seedPending(Pool.A, 100e18);

        harness.settleA(alice);
        PoolInfo memory p = harness.getPool(Pool.A);
        assertEq(p.totalPending, 100e18);
    }

    function testAccrueLinear() public {
        harness.seedPool(Pool.A, 1e18, 1000, 4600, 1e21, 1e23);
        vm.warp(4600);
        harness.updateGlobalA();

        PoolInfo memory p = harness.getPool(Pool.A);
        assertEq(p.lastUpdateTime, 4600);
        assertEq(p.accRewardPerToken, 3.6e45);
        assertEq(p.totalPending, 3.6e21);
        assertEq(p.availableRewards, 1e23 - 3.6e21);
    }

    function testAccrueEmptyPool() public {
        harness.seedPool(Pool.A, 1e18, 1000, 4600, 0, 1e23);
        vm.warp(4600);
        harness.updateGlobalA();
        PoolInfo memory p = harness.getPool(Pool.A);
        assertEq(p.lastUpdateTime, 4600);
        assertEq(p.availableRewards, 1e23);
        assertEq(p.accRewardPerToken, 0);
        assertEq(p.totalPending, 0);
    }

    function testAccrueInsufficientBudget() public {
        harness.seedPool(Pool.A, 1e18, 1000, 4600, 1e21, 1e21);
        vm.warp(4600);
        harness.updateGlobalA();

        PoolInfo memory p = harness.getPool(Pool.A);
        assertEq(p.lastUpdateTime, 4600);
        assertEq(p.availableRewards, 0);
        assertEq(p.accRewardPerToken, 3.6e45);
        assertEq(p.totalPending, 3.6e21);
        assertEq(p.badDebt, 2.6e21);
    }

    function testAccrueMultiSlice() public {
        uint256 start = 1000;
        uint256 span = 100 days;
        harness.seedPool(Pool.A, 1e18, start, start + span, 1e21, 1e30);
        vm.warp(start + span);
        harness.updateGlobalA();

        PoolInfo memory p = harness.getPool(Pool.A);
        assertEq(p.lastUpdateTime, start + span);
    }

    function testAccruePaused() public {
        vm.prank(ops);
        harness.pause();

        harness.seedPool(Pool.A, 1e18, 0, 1000, 1e21, 1e23);
        vm.warp(500);
        harness.updateGlobalA();

        PoolInfo memory p = harness.getPool(Pool.A);
        assertEq(p.lastUpdateTime, harness.pausedAt());
    }

    function testAccrueEmergency() public {
        vm.prank(ops);
        harness.enableEmergencyMode();

        harness.seedPool(Pool.A, 1e18, 0, 1000, 1e21, 1e23);
        vm.warp(500);
        harness.updateGlobalA();

        PoolInfo memory p = harness.getPool(Pool.A);
        assertEq(p.lastUpdateTime, harness.terminalRewardTime());
    }

    function testAccrueCatchupIncomplete() public {
        uint256 far = 2000 days;
        harness.seedPool(Pool.A, 1e18, 0, far, 1e21, 1e40);
        vm.warp(far);

        vm.expectRevert(DualPoolRewardEngine.CatchUpIncomplete.selector);
        harness.updateGlobalA();
    }

    function testCrankPartial() public {
        uint256 far = 2000 days;
        harness.seedPool(Pool.A, 1e18, 0, far, 1e21, 1e40);
        vm.warp(far);

        harness.crankCatchUpPool(Pool.A);
        assertEq(harness.getPool(Pool.A).lastUpdateTime, 1500 days); // 50 × 30 天
        harness.crankCatchUpPool(Pool.A);
        assertEq(harness.getPool(Pool.A).lastUpdateTime, far); // 50 × 30 天
    }
}
