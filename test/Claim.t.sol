// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Pool, PoolInfo, UserInfo} from "../src/StakeTypes.sol";

import {BaseTest} from "./BaseTest.sol";
import {DualPoolStaking} from "../src/core/DualPoolStaking.sol";
import {DualPoolRewardEngine} from "../src/core/DualPoolRewardEngine.sol";
import {EngineHarness} from "./EngineHarness.sol";
import {MockFOTERC20} from "./mocks/MockFOTERC20.sol";
import {MockMintOnTransferERC20} from "./mocks/MockMintOnTransferERC20.sol";
import {MockSenderFeeERC20} from "./mocks/MockSenderFeeERC20.sol";
import {DualPoolStorageLayout} from "../src/core/DualPoolStorageLayout.sol";

contract TestClaim is BaseTest {
    function testClaimASettlesAccruedRewards() public {
        _setupBobSoleStaker();

        vm.warp(block.timestamp + 1000);
        uint256 beforeAmount = tokenB.balanceOf(bob);

        vm.prank(bob);
        core.claimA();
        uint256 afterAmount = tokenB.balanceOf(bob);
        assertGt(afterAmount, beforeAmount);
    }

    function testClaimAZeroesUserRewards() public {
        _setupBobSoleStaker();

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        core.claimA();

        (, uint256 rewards,) = core.userInfoA(bob);
        assertEq(rewards, 0);
    }

    function testClaimBZeroesUserRewards() public {
        _setupBobSoleStakerB();

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        core.claimB();

        (, uint256 rewards,) = core.userInfoB(bob);
        assertEq(rewards, 0);
    }

    function testClaimAReducesPendingAndBooked() public {
        _setupBobSoleStaker();
        vm.warp(block.timestamp + 1000);

        deal(address(tokenA), bob, 1);
        vm.prank(bob);
        tokenA.approve(address(core), 1);
        vm.prank(bob);
        core.stakeA(1);

        PoolInfo memory pBefore = core.getPool(Pool.A);
        assertGt(pBefore.totalPending, 0);
        assertGt(pBefore.bookedUserRewards, 0);

        vm.prank(bob);
        core.claimA();

        PoolInfo memory pAfter = core.getPool(Pool.A);
        (, uint256 rewards,) = core.userInfoA(bob);

        assertEq(rewards, 0);
        assertLt(pAfter.totalPending, pBefore.totalPending);
        assertLt(pAfter.bookedUserRewards, pBefore.bookedUserRewards);
    }

    function testClaimAUpdatesLastClaimTime() public {
        _setupBobSoleStaker();

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        core.claimA();

        assertEq(core.lastClaimTime(bob), block.timestamp);
    }

    function _setupBobSoleStaker() internal {
        deal(address(tokenB), ops, 864e18);
        deal(address(tokenA), bob, 100e18);

        vm.prank(ops);
        tokenB.approve(address(core), 864e18);

        vm.prank(bob);
        tokenA.approve(address(core), 100e18);

        vm.prank(ops);
        core.fundRewards(Pool.A, 864e18);

        vm.prank(alice);
        core.scheduleRewards(Pool.A, 86400);

        vm.prank(bob);
        core.stakeA(100e18);
    }

    function testClaimATransfersNetRewardToUser() public {
        _setupBobSoleStaker();

        vm.warp(block.timestamp + 1000);
        vm.prank(bob);
        core.claimA();

        uint256 expected = 1e16 * 1000;
        assertEq(tokenB.balanceOf(bob), expected);
        assertEq(tokenA.balanceOf(bob), 0);
    }

    function testClaimBTransfersNetRewardToUser() public {
        _setupBobSoleStakerB();

        vm.warp(block.timestamp + 1000);
        vm.prank(bob);
        core.claimB();

        uint256 expected = 1e16 * 1000;
        assertEq(tokenB.balanceOf(bob), expected);
        assertEq(tokenA.balanceOf(bob), 0);
    }

    function testClaimAEmitClaimedWithCorrectFields() public {
        _setupBobSoleStaker();

        vm.warp(block.timestamp + 1000);

        uint256 expected = 1e16 * 1000;

        vm.expectEmit(true, false, false, true);
        emit DualPoolRewardEngine.Claimed(bob, expected, 0, block.timestamp);
        vm.prank(bob);
        core.claimA();
    }

    function testClaimARevertsWithinCooldown() public {
        _setupBobSoleStaker();

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        core.claimA();

        vm.warp(block.timestamp + 2000);

        uint256 expectedAvailableAt = core.lastClaimTime(bob) + core.CLAIM_COOLDOWN();

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(DualPoolRewardEngine.ClaimCooldownActive.selector, expectedAvailableAt));
        core.claimA();
    }

    function testClaimACooldownBlocksClaimB() public {
        _setupBobSoleStaker();
        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        core.claimA();

        uint256 expectedAvailableAt = core.lastClaimTime(bob) + core.CLAIM_COOLDOWN();

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(DualPoolRewardEngine.ClaimCooldownActive.selector, expectedAvailableAt));
        core.claimB();
    }

    function testClaimBCooldownBlocksClaimA() public {
        _setupBobSoleStakerB();

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        core.claimB();

        vm.warp(block.timestamp + 2000);

        uint256 expectedAvailableAt = core.lastClaimTime(bob) + core.CLAIM_COOLDOWN();

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(DualPoolRewardEngine.ClaimCooldownActive.selector, expectedAvailableAt));
        core.claimA();
    }

    function testClaimASucceedsAfterCooldownExpiry() public {
        _setupBobSoleStaker();

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        core.claimA();
        uint256 balanceAfterFirst = tokenB.balanceOf(bob);
        uint256 lastClaim = core.lastClaimTime(bob);

        vm.warp(block.timestamp + 48 hours);

        vm.prank(bob);
        core.claimA();

        (, uint256 rewards,) = core.userInfoA(bob);
        assertGt(core.lastClaimTime(bob), lastClaim);
        assertGt(tokenB.balanceOf(bob), balanceAfterFirst);
        assertEq(rewards, 0);
    }

    function testClaimBRevertsOnBadDebtA() public {
        (EngineHarness harness) = _seedBadDebt(Pool.A);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.BadDebtExists.selector);
        harness.claimB();
    }

    function testClaimARevertsOnBadDebtB() public {
        (EngineHarness harness) = _seedBadDebt(Pool.B);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.BadDebtExists.selector);
        harness.claimA();
    }

    function _seedBadDebt(Pool debtPool) internal returns (EngineHarness) {
        EngineHarness harness = new EngineHarness(address(tokenA), address(tokenB), CAP, 24 hours);
        harness.setUserModule(address(userModule));
        harness.seedDebt(debtPool, 1);
        harness.seedPending(debtPool, 1);

        PoolInfo memory p = harness.getPool(debtPool);
        assertEq(p.badDebt, 1);
        assertEq(p.totalPending, 1);

        return harness;
    }

    function _setupBobSoleStakerB() internal {
        deal(address(tokenB), ops, 864e18);
        deal(address(tokenB), bob, 100e18);

        vm.prank(ops);
        tokenB.approve(address(core), 864e18);

        vm.prank(bob);
        tokenB.approve(address(core), 100e18);

        vm.prank(ops);
        core.fundRewards(Pool.B, 864e18);

        vm.prank(alice);
        core.scheduleRewards(Pool.B, 86400);

        vm.prank(bob);
        core.stakeB(100e18);
    }

    function testClaimB() public {
        _setupBobSoleStakerB();

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        core.claimB();
        (, uint256 rewards,) = core.userInfoB(bob);
        assertEq(rewards, 0);
        assertGt(tokenB.balanceOf(bob), 0);
    }

    function testClaimBReducesPendingAndBooked() public {
        _setupBobSoleStakerB();
        vm.warp(block.timestamp + 1000);

        deal(address(tokenB), bob, 1);
        vm.prank(bob);
        tokenB.approve(address(core), 1);
        vm.prank(bob);
        core.stakeB(1);

        PoolInfo memory pBefore = core.getPool(Pool.B);
        assertGt(pBefore.totalPending, 0);
        assertGt(pBefore.bookedUserRewards, 0);

        vm.prank(bob);
        core.claimB();

        PoolInfo memory pAfter = core.getPool(Pool.B);
        (, uint256 rewards,) = core.userInfoB(bob);

        assertEq(rewards, 0);
        assertLt(pAfter.totalPending, pBefore.totalPending);
        assertLt(pAfter.bookedUserRewards, pBefore.bookedUserRewards);
    }

    function testClaimBUpdatesLastClaimTime() public {
        _setupBobSoleStakerB();
        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        core.claimB();
        assertEq(core.lastClaimTime(bob), block.timestamp);
    }

    function testClaimBEmitsClaimed() public {
        _setupBobSoleStakerB();
        vm.warp(block.timestamp + 1000);
        uint256 expected = 1e19;
        vm.prank(bob);
        vm.expectEmit(true, false, false, true, address(core));
        emit DualPoolRewardEngine.Claimed(bob, 0, expected, block.timestamp);
        core.claimB();
    }

    function testClaimBRevertsOnNoRewards() public {
        _setupBobSoleStakerB();

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.NothingToClaim.selector);
        core.claimB();
    }

    function testClaimARevertsWhenPaused() public {
        _setupBobSoleStaker();

        vm.prank(ops);
        core.pause();

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.PausedStatus.selector);

        core.claimA();
    }

    function testClaimBRevertsWhenPaused() public {
        _setupBobSoleStakerB();

        vm.prank(ops);
        core.pause();

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.PausedStatus.selector);

        core.claimB();
    }

    function testClaimARevertsInEmergency() public {
        _setupBobSoleStaker();
        vm.prank(ops);
        core.enableEmergencyMode();

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.EmergencyStatus.selector);

        core.claimA();
    }

    function testClaimAWorksInShutdown() public {
        _setupBobSoleStaker();

        vm.warp(block.timestamp + 1000);

        _forceShutdown();
        vm.warp(block.timestamp + 500);

        vm.prank(bob);
        core.claimA();
        assertGt(tokenB.balanceOf(bob), 0);
    }

    function testClaimBWorksInShutdown() public {
        _setupBobSoleStakerB();

        vm.warp(block.timestamp + 1000);

        _forceShutdown();
        vm.warp(block.timestamp + 500);

        vm.prank(bob);
        core.claimB();
        assertGt(tokenB.balanceOf(bob), 0);
    }

    function testClaimARevertsBelowMinClaim() public {
        _setupBobSoleStaker();

        vm.prank(alice);
        core.setMinClaimAmount(1e17);

        vm.warp(block.timestamp + 5);
        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.BelowMinClaim.selector);
        core.claimA();
    }

    function testClaimASkipsMinClaimInShutdown() public {
        _setupBobSoleStaker();

        vm.prank(alice);
        core.setMinClaimAmount(1e17);

        vm.warp(block.timestamp + 5);

        _forceShutdown();
        vm.prank(bob);
        core.claimA();
        (, uint256 rewards,) = core.userInfoA(bob);
        assertEq(rewards, 0);
        assertGt(tokenB.balanceOf(bob), 0);
    }

    function testClaimARevertsInsufficientPending() public {
        EngineHarness harness = new EngineHarness(address(tokenA), address(tokenB), CAP, 24 hours);
        harness.setUserModule(address(userModule));

        harness.seedUser(Pool.A, bob, 100e18, 0);
        harness.seedAcc(Pool.A, 1e45);

        PoolInfo memory p = harness.getPool(Pool.A);
        assertEq(p.badDebt, 0);
        assertEq(p.totalPending, 0);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.InsufficientPending.selector);
        harness.claimA();
    }

    function testClaimARevertsInsufficientBooked() public {
        EngineHarness harness = new EngineHarness(address(tokenA), address(tokenB), CAP, 24 hours);

        harness.setUserModule(address(userModule));
        harness.seedUserRewards(Pool.A, bob, 100e18);
        harness.seedPending(Pool.A, 100e18);
        harness.seedBooked(Pool.A, 50e18);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.InsufficientBooked.selector);
        harness.claimA();
    }

    function testClaimARevertsFOTFeeExceedsCap() public {
        uint256 feeBP = 500;
        (DualPoolStaking fotCore, MockFOTERC20 fotToken) = _deployFOTCore(feeBP);

        vm.prank(deployer);
        fotCore.setAdmin(alice, true);

        deal(address(fotToken), ops, 864e18);
        vm.prank(ops);
        fotToken.approve(address(fotCore), 864e18);

        vm.prank(ops);
        fotCore.fundRewards(Pool.A, 864e18);

        vm.prank(alice);
        fotCore.scheduleRewards(Pool.A, 86400);

        deal(address(tokenA), bob, 100e18);
        vm.prank(bob);
        tokenA.approve(address(fotCore), 100e18);

        vm.prank(bob);
        fotCore.stakeA(100e18);

        vm.warp(block.timestamp + 1000);

        fotToken.setFee(1500);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.FeeExceedsCap.selector);
        fotCore.claimA();
    }

    function testClaimARevertsOnMintOnTransfer() public {
        uint256 mintExtraBP = 1000;
        (DualPoolStaking fotCore, MockMintOnTransferERC20 fotToken) = _deployMintOnTransferCore(mintExtraBP);
        vm.prank(deployer);
        fotCore.setAdmin(alice, true);

        fotToken.setMintExtraBP(0);

        deal(address(fotToken), ops, 864e18);
        vm.prank(ops);
        fotToken.approve(address(fotCore), 864e18);

        vm.prank(ops);
        fotCore.fundRewards(Pool.A, 864e18);

        vm.prank(alice);
        fotCore.scheduleRewards(Pool.A, 86400);

        deal(address(tokenA), bob, 100e18);
        vm.prank(bob);
        tokenA.approve(address(fotCore), 100e18);

        vm.prank(bob);
        fotCore.stakeA(100e18);

        vm.warp(block.timestamp + 1000);
        fotToken.setMintExtraBP(mintExtraBP);

        uint256 gross = 1e19;
        uint256 netReceived = gross * (10000 + mintExtraBP) / 10000; // 1.1e19

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(DualPoolStorageLayout.InvalidNetReceived.selector, gross, netReceived));
        fotCore.claimA();
    }

    function testClaimARevertsOnSenderFeeToken() public {
        uint256 feeBP = 1000;
        (DualPoolStaking fotCore, MockSenderFeeERC20 fotToken) = _deploySenderFeeERC20(feeBP);
        vm.prank(deployer);
        fotCore.setAdmin(alice, true);
        fotToken.setFee(0);

        deal(address(fotToken), ops, 864e18);
        vm.prank(ops);
        fotToken.approve(address(fotCore), 864e18);

        vm.prank(ops);
        fotCore.fundRewards(Pool.A, 864e18);

        vm.prank(alice);
        fotCore.scheduleRewards(Pool.A, 86400);

        deal(address(tokenA), bob, 100e18);
        vm.prank(bob);
        tokenA.approve(address(fotCore), 100e18);

        vm.prank(bob);
        fotCore.stakeA(100e18);

        vm.warp(block.timestamp + 1000);

        fotToken.setFee(1000);

        uint256 gross = 1e16 * 1000;
        uint256 debited = gross + gross * feeBP / 10000;

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(DualPoolStorageLayout.VaultDebitMismatch.selector, gross, debited));
        fotCore.claimA();
    }

    function testClaimARevertsOnVaultBalanceDeficit() public {
        _setupBobSoleStaker();
        deal(address(tokenB), address(core), 0);

        vm.warp(block.timestamp + 1000);
        vm.prank(bob);
        vm.expectRevert();
        core.claimA();
    }

    function testClaimBRevertsOnVaultBalanceDeficit() public {
        _setupBobSoleStakerB();
        deal(address(tokenB), address(core), 0);

        vm.warp(block.timestamp + 1000);
        vm.prank(bob);
        vm.expectRevert();
        core.claimB();
    }

    function testClaimAInvariantAfterFailedTransfer() public {
        uint256 feeBP = 500;
        (DualPoolStaking fotCore, MockSenderFeeERC20 fotToken) = _deploySenderFeeERC20(feeBP);
        vm.prank(deployer);
        fotCore.setAdmin(alice, true);

        fotToken.setFee(0);

        deal(address(fotToken), ops, 864e18);
        vm.prank(ops);
        fotToken.approve(address(fotCore), 864e18);
        vm.prank(ops);
        fotCore.fundRewards(Pool.A, 864e18);

        vm.prank(alice);
        fotCore.scheduleRewards(Pool.A, 86400);

        deal(address(tokenA), bob, 100e18);
        vm.prank(bob);
        tokenA.approve(address(fotCore), 100e18);
        vm.prank(bob);
        fotCore.stakeA(100e18);

        vm.warp(block.timestamp + 1000);

        (uint256 stakedBefore, uint256 rewardBefore,) = fotCore.userInfoA(bob);
        PoolInfo memory pBefore = fotCore.getPool(Pool.A);
        uint256 bobTokenBBefore = fotToken.balanceOf(bob);
        uint256 lastClaimBefore = fotCore.lastClaimTime(bob);

        fotToken.setFee(1000);

        vm.prank(bob);
        vm.expectRevert();
        fotCore.claimA();

        (uint256 stakedAfter, uint256 rewardAfter,) = fotCore.userInfoA(bob);
        PoolInfo memory pAfter = fotCore.getPool(Pool.A);

        assertEq(stakedBefore, stakedAfter);
        assertEq(rewardAfter, rewardBefore); // ← 关键:reward 没被清零
        assertEq(pAfter.totalPending, pBefore.totalPending); // ← 关键:池子账目没动
        assertEq(pAfter.bookedUserRewards, pBefore.bookedUserRewards);
        assertEq(fotCore.lastClaimTime(bob), lastClaimBefore);
        assertEq(fotToken.balanceOf(bob), bobTokenBBefore); // bob 也没收到钱
    }

    function testClaimAAccruesBothPools() public {
        _setupBobSoleStaker();
        _setupBobSoleStakerB();

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        core.claimA();

        assertEq(core.getPool(Pool.A).lastUpdateTime, block.timestamp);
        assertEq(core.getPool(Pool.B).lastUpdateTime, block.timestamp);
    }

    function testForceClaimAllHealthy() public {
        _setupBobSoleStaker();
        _setupBobSoleStakerB();

        vm.warp(block.timestamp + 1000);

        core.crankCatchUpPool(Pool.A);
        core.crankCatchUpPool(Pool.B);

        PoolInfo memory beforePoolInfoA = core.getPool(Pool.A);
        PoolInfo memory beforePoolInfoB = core.getPool(Pool.B);

        vm.prank(bob);
        core.forceClaimAll();

        PoolInfo memory afterPoolInfoA = core.getPool(Pool.A);
        PoolInfo memory afterPoolInfoB = core.getPool(Pool.B);

        assertGt(beforePoolInfoA.totalPending, afterPoolInfoA.totalPending);
        assertGt(beforePoolInfoB.totalPending, afterPoolInfoB.totalPending);
    }

    function testForceClaimAllRevertsHealthyBelowMinClaim() public {
        _setupBobSoleStaker();
        _setupBobSoleStakerB();

        vm.warp(block.timestamp + 1);

        vm.prank(alice);
        core.setMinClaimAmount(1e16 + 1);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.BelowMinClaim.selector);
        core.forceClaimAll();
    }

    function testForceClaimAllRevertsHealthyNoLiquidity() public {
        _setupBobSoleStaker();
        _setupBobSoleStakerB();

        vm.warp(block.timestamp + 864000);

        deal(address(tokenB), address(core), 0);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.InsufficientLiquidity.selector);
        core.forceClaimAll();
    }

    function testForceClaimAllShutdownPartial() public {
        _setupBobSoleStaker();
        _setupBobSoleStakerB();

        vm.warp(block.timestamp + 1000);
        _forceShutdown();

        deal(address(tokenB), address(core), 1813e18);
        uint256 beforeBal = tokenB.balanceOf(bob);

        vm.prank(bob);
        core.forceClaimAll();

        assertEq(tokenB.balanceOf(bob) - beforeBal, 5e18);

        (, uint256 remA,) = core.userInfoA(bob);
        (, uint256 remB,) = core.userInfoB(bob);

        assertEq(remA, 5e18);
        assertEq(remB, 10e18);
    }

    function testForceClaimAllNoPayableLiquidity() public {
        _setupBobSoleStaker();
        _setupBobSoleStakerB();

        vm.warp(block.timestamp + 1000);

        core.crankCatchUpPool(Pool.A);
        core.crankCatchUpPool(Pool.B);

        _forceShutdown();

        deal(address(tokenB), address(core), 1808e18);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.NoPayableLiquidity.selector);
        core.forceClaimAll();
    }

    function testForceClaimAllPreservesRemaining() public {
        _setupBobSoleStaker();
        _setupBobSoleStakerB();
        vm.warp(block.timestamp + 1000);

        core.crankCatchUpPool(Pool.A);
        core.crankCatchUpPool(Pool.B);

        _forceShutdown();

        deal(address(tokenB), address(core), 1813e18);

        vm.prank(bob);
        core.forceClaimAll();

        (, uint256 remA,) = core.userInfoA(bob);
        (, uint256 remB,) = core.userInfoB(bob);

        assertEq(remA, 5e18);
        assertEq(remB, 10e18);

        PoolInfo memory pA = core.getPool(Pool.A);
        PoolInfo memory pB = core.getPool(Pool.B);

        assertEq(pA.totalPending, 5e18);
        assertEq(pB.totalPending, 10e18);
        assertEq(pB.totalPending, 10e18);
        assertEq(pB.bookedUserRewards, 10e18);

        assertEq(pA.badDebt, 0);
        assertEq(pB.badDebt, 0);
        assertEq(core.lastClaimTime(bob), block.timestamp);
    }

    function testForceClaimAllEmitsForceClaimedAll() public {
        _setupBobSoleStaker();
        _setupBobSoleStakerB();

        vm.warp(block.timestamp + 1000);

        core.crankCatchUpPool(Pool.A);
        core.crankCatchUpPool(Pool.B);

        vm.prank(bob);
        vm.expectEmit(true, false, false, true, address(core));
        emit DualPoolRewardEngine.ForceClaimedAll(bob, 10e18, 10e18, 0, 0, block.timestamp);
        core.forceClaimAll();
    }

    function testForceClaimAllCooldown() public {
        _setupBobSoleStaker();
        _setupBobSoleStakerB();

        vm.warp(block.timestamp + 1000);

        core.crankCatchUpPool(Pool.A);
        core.crankCatchUpPool(Pool.B);

        vm.prank(bob);
        core.claimA();

        uint256 last = core.lastClaimTime(bob);
        bytes memory err =
            abi.encodeWithSelector(DualPoolRewardEngine.ClaimCooldownActive.selector, last + core.CLAIM_COOLDOWN());

        vm.prank(bob);
        vm.expectRevert(err);
        core.forceClaimAll();
    }

    function testForceClaimAllRevertsPaused() public {
        vm.prank(ops);
        core.pause();

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.PausedStatus.selector);
        core.forceClaimAll();
    }

    function testForceClaimAllRevertsEmergency() public {
        vm.prank(ops);
        core.enableEmergencyMode();

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.EmergencyStatus.selector);
        core.forceClaimAll();
    }
}
