// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BaseTest} from "./BaseTest.sol";
import {Pool, PoolInfo} from "../src/StakeTypes.sol";
import {DualPoolRewardEngine} from "../src/core/DualPoolRewardEngine.sol";
import {EngineHarness} from "./EngineHarness.sol";
import {DualPoolStaking} from "../src/core/DualPoolStaking.sol";
import {MockFOTERC20} from "./mocks/MockFOTERC20.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TestRecoverToken is BaseTest {
    function testRecoverTokenAExcessSucceeds() public {
        deal(address(tokenA), bob, 100e18);
        vm.startPrank(bob);
        tokenA.approve(address(core), 100e18);
        core.stakeA(100e18);
        vm.stopPrank();

        deal(address(tokenA), address(core), 150e18);

        uint256 excess = 50e18;
        uint256 treasuryBefore = tokenA.balanceOf(treasury);

        vm.expectEmit(true, true, false, true, address(core));
        emit DualPoolRewardEngine.TokenRecovered(address(tokenA), treasury, excess);
        vm.prank(alice);
        core.recoverToken(tokenA, treasury, excess);

        assertEq(tokenA.balanceOf(treasury), treasuryBefore + excess);
        assertEq(tokenA.balanceOf(address(core)), 100e18);
        assertEq(core.getPool(Pool.A).totalStaked, 100e18);
    }

    function testRecoverTokenAPartialExcess() public {
        deal(address(tokenA), bob, 100e18);
        vm.startPrank(bob);
        tokenA.approve(address(core), 100e18);
        core.stakeA(100e18);
        vm.stopPrank();

        deal(address(tokenA), address(core), 150e18);

        uint256 excess = 30e18;
        uint256 treasuryBefore = tokenA.balanceOf(treasury);

        vm.expectEmit(true, true, false, true, address(core));
        emit DualPoolRewardEngine.TokenRecovered(address(tokenA), treasury, excess);
        vm.prank(alice);
        core.recoverToken(tokenA, treasury, excess);

        assertEq(tokenA.balanceOf(treasury), treasuryBefore + excess);
        assertEq(tokenA.balanceOf(address(core)), 120e18);
        assertEq(core.getPool(Pool.A).totalStaked, 100e18);
    }

    function testRecoverTokenARevertsWhenNoExcess() public {
        deal(address(tokenA), bob, 100e18);
        vm.startPrank(bob);
        tokenA.approve(address(core), 100e18);
        core.stakeA(100e18);
        vm.stopPrank();

        vm.expectRevert(DualPoolRewardEngine.NoExcessTokenA.selector);
        vm.prank(alice);
        core.recoverToken(tokenA, treasury, 1);
    }

    function testRecoverTokenARevertsWhenAmountExceedsExcess() public {
        deal(address(tokenA), bob, 50e18);
        vm.startPrank(bob);
        tokenA.approve(address(core), 50e18);
        core.stakeA(50e18);
        vm.stopPrank();

        deal(address(tokenA), address(core), 100e18);
        uint256 excess = 50e18;

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.CannotRecoverStakedTokenA.selector);
        core.recoverToken(tokenA, treasury, excess + 1);
    }

    function testRecoverTokenBExcessSucceeds() public {
        deal(address(tokenB), ops, 80e18);
        vm.startPrank(ops);
        tokenB.approve(address(core), 80e18);
        core.fundRewards(Pool.A, 80e18);
        vm.stopPrank();

        deal(address(tokenB), address(core), 100e18);

        uint256 treasuryBefore = tokenB.balanceOf(treasury);

        vm.prank(alice);
        core.recoverToken(tokenB, treasury, 20e18);
        assertEq(tokenB.balanceOf(treasury), treasuryBefore + 20e18);
    }

    function testRecoverTokenBPartialExcess() public {
        deal(address(tokenB), ops, 80e18);
        vm.startPrank(ops);
        tokenB.approve(address(core), 80e18);
        core.fundRewards(Pool.A, 80e18);
        vm.stopPrank();

        deal(address(tokenB), address(core), 100e18);

        uint256 treasuryBefore = tokenB.balanceOf(treasury);

        vm.prank(alice);
        core.recoverToken(tokenB, treasury, 10e18);
        assertEq(tokenB.balanceOf(treasury), treasuryBefore + 10e18);
        assertEq(core.getPool(Pool.A).availableRewards, 80e18);
        assertEq(tokenB.balanceOf(address(core)), 90e18);
    }

    function testRecoverTokenBEmitsTokenRecovered() public {
        deal(address(tokenB), ops, 80e18);
        vm.startPrank(ops);
        tokenB.approve(address(core), 80e18);
        core.fundRewards(Pool.A, 80e18);
        vm.stopPrank();

        deal(address(tokenB), address(core), 110e18);

        vm.prank(alice);
        vm.expectEmit(true, true, false, false, address(core));
        emit DualPoolRewardEngine.TokenRecovered(address(tokenB), treasury, 30e18);
        core.recoverToken(tokenB, treasury, 30e18);
    }

    function testRecoverTokenBRevertsAboveExcess() public {
        deal(address(tokenB), ops, 80e18);
        vm.startPrank(ops);
        tokenB.approve(address(core), 80e18);
        core.fundRewards(Pool.A, 80e18);
        vm.stopPrank();

        deal(address(tokenB), address(core), 110e18);

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.ExceedsExcess.selector);
        core.recoverToken(tokenB, treasury, 30e18 + 1);
    }

    function testRecoverTokenBRevertsWhenNoExcess() public {
        deal(address(tokenB), ops, 80e18);
        vm.startPrank(ops);
        tokenB.approve(address(core), 80e18);
        core.fundRewards(Pool.A, 80e18);
        vm.stopPrank();

        deal(address(tokenB), address(core), 80e18);

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.NoExcessTokenB.selector);
        core.recoverToken(tokenB, treasury, 30e18);
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

    function testRecoverTokenBRevertsWhenBadDebtA() public {
        EngineHarness harness = _newHarness();
        _seedDebt(harness, Pool.A);

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.BadDebtExists.selector);
        harness.recoverToken(tokenB, treasury, 10e18);
    }

    function testRecoverTokenBRevertsWhenBadDebtB() public {
        EngineHarness harness = _newHarness();
        _seedDebt(harness, Pool.A);

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.BadDebtExists.selector);
        harness.recoverToken(tokenB, treasury, 10e18);
    }

    function testRecoverTokenBSettlesBeforeBadDebtCheck() public {
        EngineHarness harness = _newHarness();
        vm.warp(1 days);
        uint256 now_ = block.timestamp;
        harness.seedPool(Pool.B, 1e18, now_ - 100, now_ + 100, 100e18, 50e18);

        deal(address(tokenB), address(harness), 500e18);

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.BadDebtExists.selector);
        harness.recoverToken(tokenB, treasury, 10e18);
    }

    function testRecoverTokenBProtectsAllRequired() public {
        EngineHarness harness = _newHarness();

        harness.seedPool(Pool.A, 0, 0, 0, 0, 20e18);
        harness.seedPool(Pool.B, 0, 0, 0, 30e18, 25e18);
        harness.seedPending(Pool.A, 10e18);
        harness.seedPending(Pool.B, 15e18);

        deal(address(tokenB), address(harness), 150e18);
        uint256 treasuryBefore = tokenB.balanceOf(treasury);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(harness));
        emit DualPoolRewardEngine.TokenRecovered(address(tokenB), treasury, 50e18);
        harness.recoverToken(tokenB, treasury, 50e18);
        assertEq(tokenB.balanceOf(treasury), treasuryBefore + 50e18);
        assertEq(tokenB.balanceOf(address(harness)), 100e18);

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.NoExcessTokenB.selector);
        harness.recoverToken(tokenB, treasury, 1);
    }

    function testRecoverTokenBPreservesInvariant() public {
        EngineHarness harness = _newHarness();

        harness.seedPool(Pool.A, 0, 0, 0, 0, 20e18);
        harness.seedPool(Pool.B, 0, 0, 0, 30e18, 25e18);
        harness.seedPending(Pool.A, 10e18);
        harness.seedPending(Pool.B, 15e18);

        deal(address(tokenB), address(harness), 150e18);

        (uint256 requiredBefore, uint256 actualBefore) = _snapshot(harness);
        assertGe(actualBefore, requiredBefore);

        PoolInfo memory aBefore = harness.getPool(Pool.A);
        PoolInfo memory bBefore = harness.getPool(Pool.B);

        vm.prank(alice);
        harness.recoverToken(tokenB, treasury, 40e18);

        (uint256 requiredAfter, uint256 actualAfter) = _snapshot(harness);
        assertGe(actualAfter, requiredAfter);
        assertEq(actualAfter, actualBefore - 40e18);
        assertEq(requiredAfter, requiredBefore);

        PoolInfo memory aAfter = harness.getPool(Pool.A);
        PoolInfo memory bAfter = harness.getPool(Pool.B);
        assertEq(aAfter.availableRewards, aBefore.availableRewards);
        assertEq(bAfter.availableRewards, bBefore.availableRewards);
        assertEq(aAfter.totalPending, aBefore.totalPending);
        assertEq(bAfter.totalPending, bBefore.totalPending);
        assertEq(bAfter.totalStaked, bBefore.totalStaked);
    }

    function _snapshot(EngineHarness h) internal view returns (uint256 required, uint256 actual) {
        PoolInfo memory a = h.getPool(Pool.A);
        PoolInfo memory b = h.getPool(Pool.B);
        required = b.totalStaked + a.totalPending + b.totalPending + a.availableRewards + b.availableRewards;
        actual = tokenB.balanceOf(address(h));
    }

    function testRecoverTokenBWithFOT() public {
        uint256 feeBP = 100; // 1%
        (DualPoolStaking fotCore, MockFOTERC20 fotToken) = _deployFOTBCore(feeBP);

        address staker = makeAddr("staker");
        uint256 stakeAmount = 100e18;
        fotToken.mint(staker, stakeAmount);
        vm.startPrank(staker);
        fotToken.approve(address(fotCore), stakeAmount);
        fotCore.stakeB(stakeAmount);
        vm.stopPrank();

        deal(address(fotToken), address(fotCore), 150e18);

        address treasury = makeAddr("treasury");
        uint256 treasuryBefore = fotToken.balanceOf(treasury);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(fotCore));
        uint256 expectedNet = 30e18 - (30e18 * feeBP / 10000);
        emit DualPoolRewardEngine.OutboundTransfer(address(fotToken), treasury, 30e18, expectedNet);
        fotCore.recoverToken(fotToken, treasury, 30e18);

        uint256 treasuryAfter = fotToken.balanceOf(treasury);
        assertEq(treasuryAfter - treasuryBefore, expectedNet);

        uint256 coreBalanceAfter = fotToken.balanceOf(address(fotCore));
        assertEq(coreBalanceAfter, 150e18 - 30e18);
        assertEq(coreBalanceAfter, 120e18);

        vm.prank(alice);
        fotCore.recoverToken(fotToken, treasury, 21e18);
        assertEq(fotToken.balanceOf(address(fotCore)), 99e18);

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.NoExcessTokenB.selector);
        fotCore.recoverToken(fotToken, treasury, 1);
    }

    function testRecoverTokenRevertsForUnsupportedToken() public {
        MockERC20 tokenC = new MockERC20("tokenC", "TKC", GOOD_DECIMALS);
        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.TokenRecoveryRestricted.selector);
        core.recoverToken(tokenC, treasury, 10e18);
    }

    function testRecoverTokenRevertsWhenZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.InvalidRecovery.selector);
        core.recoverToken(tokenA, treasury, 0);
    }

    function testRecoverTokenRevertsWhenToZero() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.InvalidRecovery.selector);
        core.recoverToken(tokenA, address(0), 10e18);
    }

    function testRecoverTokenRevertsNonAdmin() public {
        vm.prank(bob);
        vm.expectRevert();
        core.recoverToken(tokenA, treasury, 10e18);
    }

    function testRecoverTokenAWorksWhenPaused() public {
        deal(address(tokenA), bob, 100e18);
        vm.startPrank(bob);
        tokenA.approve(address(core), 100e18);
        core.stakeA(100e18);
        vm.stopPrank();

        deal(address(tokenA), address(core), 150e18);

        vm.prank(ops);
        core.pause();
        assertTrue(core.paused());

        uint256 treasuryBefore = tokenA.balanceOf(treasury);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(core));
        emit DualPoolRewardEngine.TokenRecovered(address(tokenA), treasury, 30e18);
        core.recoverToken(tokenA, treasury, 30e18);

        assertEq(tokenA.balanceOf(treasury), treasuryBefore + 30e18);
        assertEq(tokenA.balanceOf(address(core)), 120e18);
        assertEq(core.getPool(Pool.A).totalStaked, 100e18);
    }

    function testRecoverTokenAWorksInEmergency() public {
        deal(address(tokenA), bob, 100e18);
        vm.startPrank(bob);
        tokenA.approve(address(core), 100e18);
        core.stakeA(100e18);
        vm.stopPrank();

        deal(address(tokenA), address(core), 150e18);

        vm.prank(ops);
        core.enableEmergencyMode();
        assertTrue(core.emergencyMode());

        uint256 treasuryBefore = tokenA.balanceOf(treasury);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(core));
        emit DualPoolRewardEngine.TokenRecovered(address(tokenA), treasury, 30e18);
        core.recoverToken(tokenA, treasury, 30e18);

        assertEq(tokenA.balanceOf(treasury), treasuryBefore + 30e18);
        assertEq(tokenA.balanceOf(address(core)), 120e18);
        assertEq(core.getPool(Pool.A).totalStaked, 100e18);
    }

    function testRecoverTokenAWorksInShutdown() public {
        deal(address(tokenA), bob, 100e18);
        vm.startPrank(bob);
        tokenA.approve(address(core), 100e18);
        core.stakeA(100e18);
        vm.stopPrank();

        deal(address(tokenA), address(core), 150e18);

        vm.prank(ops);
        core.enableEmergencyMode();
        assertTrue(core.emergencyMode());

        vm.prank(alice);
        core.activateShutdown();
        assertTrue(core.shutdownMode());

        uint256 treasuryBefore = tokenA.balanceOf(treasury);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(core));
        emit DualPoolRewardEngine.TokenRecovered(address(tokenA), treasury, 30e18);
        core.recoverToken(tokenA, treasury, 30e18);

        assertEq(tokenA.balanceOf(treasury), treasuryBefore + 30e18);
        assertEq(tokenA.balanceOf(address(core)), 120e18);
        assertEq(core.getPool(Pool.A).totalStaked, 100e18);
    }

    function testRecoverTokenBWorksWhenPaused() public {
        deal(address(tokenB), bob, 100e18);
        vm.startPrank(bob);
        tokenB.approve(address(core), 100e18);
        core.stakeB(100e18);
        vm.stopPrank();

        deal(address(tokenB), address(core), 150e18);

        vm.prank(ops);
        core.pause();
        assertTrue(core.paused());

        uint256 treasuryBefore = tokenB.balanceOf(treasury);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(core));
        emit DualPoolRewardEngine.TokenRecovered(address(tokenB), treasury, 30e18);
        core.recoverToken(tokenB, treasury, 30e18);

        assertEq(tokenB.balanceOf(treasury), treasuryBefore + 30e18);
        assertEq(tokenB.balanceOf(address(core)), 120e18);
        assertEq(core.getPool(Pool.B).totalStaked, 100e18);
    }

    function testRecoverTokenBWorksInEmergency() public {
        deal(address(tokenB), bob, 100e18);
        vm.startPrank(bob);
        tokenB.approve(address(core), 100e18);
        core.stakeB(100e18);
        vm.stopPrank();

        deal(address(tokenB), address(core), 150e18);

        vm.prank(ops);
        core.enableEmergencyMode();
        assertTrue(core.emergencyMode());

        uint256 treasuryBefore = tokenB.balanceOf(treasury);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(core));
        emit DualPoolRewardEngine.TokenRecovered(address(tokenB), treasury, 30e18);
        core.recoverToken(tokenB, treasury, 30e18);

        assertEq(tokenB.balanceOf(treasury), treasuryBefore + 30e18);
        assertEq(tokenB.balanceOf(address(core)), 120e18);
        assertEq(core.getPool(Pool.B).totalStaked, 100e18);
    }

    function testRecoverTokenBWorksInShutdown() public {
        deal(address(tokenB), bob, 100e18);
        vm.startPrank(bob);
        tokenB.approve(address(core), 100e18);
        core.stakeB(100e18);
        vm.stopPrank();

        deal(address(tokenB), address(core), 150e18);

        vm.prank(ops);
        core.enableEmergencyMode();
        assertTrue(core.emergencyMode());

        vm.prank(alice);
        core.activateShutdown();
        assertTrue(core.shutdownMode());

        uint256 treasuryBefore = tokenB.balanceOf(treasury);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(core));
        emit DualPoolRewardEngine.TokenRecovered(address(tokenB), treasury, 30e18);
        core.recoverToken(tokenB, treasury, 30e18);

        assertEq(tokenB.balanceOf(treasury), treasuryBefore + 30e18);
        assertEq(tokenB.balanceOf(address(core)), 120e18);
        assertEq(core.getPool(Pool.B).totalStaked, 100e18);
    }

    function testRecoverTokenAWorksWithBadDebt() public {
        EngineHarness harness = _newHarness();
        harness.seedPool(Pool.A, 0, 0, 0, 100e18, 0);
        harness.seedDebt(Pool.A, 10e18);
        harness.seedPending(Pool.A, 10e18);

        deal(address(tokenA), address(harness), 150e18);
        uint256 treasuryBefore = tokenA.balanceOf(treasury);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(harness));
        emit DualPoolRewardEngine.TokenRecovered(address(tokenA), treasury, 30e18);
        harness.recoverToken(tokenA, treasury, 30e18);

        assertEq(tokenA.balanceOf(treasury), treasuryBefore + 30e18);
        assertEq(tokenA.balanceOf(address(harness)), 120e18);
        assertEq(harness.getPool(Pool.A).totalStaked, 100e18);
    }

    function testRecoverTokenADoesNotSettleB() public {
        EngineHarness harness = _newHarness();

        vm.warp(1 days);
        uint256 now_ = block.timestamp;

        harness.seedPool(Pool.A, 0, 0, 0, 100e18, 0);

        harness.seedPool(Pool.B, 1e18, now_ - 100, now_ + 100, 100e18, 50e18);

        deal(address(tokenA), address(harness), 150e18);

        PoolInfo memory poolBBefore = harness.getPool(Pool.B);
        assertEq(poolBBefore.badDebt, 0);
        assertEq(poolBBefore.lastUpdateTime, now_ - 100);
        assertEq(poolBBefore.availableRewards, 50e18);

        uint256 treasuryBefore = tokenA.balanceOf(treasury);
        vm.prank(alice);
        harness.recoverToken(tokenA, treasury, 30e18);

        assertEq(tokenA.balanceOf(treasury), treasuryBefore + 30e18);
        assertEq(tokenA.balanceOf(address(harness)), 120e18);

        PoolInfo memory poolBAfter = harness.getPool(Pool.B);
        assertEq(poolBAfter.badDebt, 0);
        assertEq(poolBAfter.lastUpdateTime, now_ - 100);
        assertEq(poolBAfter.availableRewards, 50e18);
        assertEq(poolBAfter.totalPending, 0);
    }
}
