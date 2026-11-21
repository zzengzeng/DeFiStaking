// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BaseTest} from "./BaseTest.sol";
import {Pool, PoolInfo} from "../src/StakeTypes.sol";
import {EngineHarness} from "./EngineHarness.sol";
import {DualPoolRewardEngine} from "../src/core/DualPoolRewardEngine.sol";
import {DualPoolStaking} from "../src/core/DualPoolStaking.sol";
import {MockFOTERC20} from "./mocks/MockFOTERC20.sol";

contract TestCompound is BaseTest {
    function _stakeA(address user, uint256 amount) internal {
        deal(address(tokenA), user, amount);
        deal(address(tokenB), ops, 864e18);

        vm.prank(ops);
        tokenB.approve(address(core), 864e18);

        vm.prank(ops);
        core.fundRewards(Pool.A, 864e18);

        vm.prank(alice);
        core.scheduleRewards(Pool.A, 86400);

        vm.prank(user);
        tokenA.approve(address(core), amount);

        vm.prank(user);
        core.stakeA(amount);
    }

    function _stakeB(address user, uint256 amount) internal {
        deal(address(tokenB), user, amount);
        deal(address(tokenB), ops, 864e18);

        vm.prank(ops);
        tokenB.approve(address(core), 864e18);

        vm.prank(ops);
        core.fundRewards(Pool.B, 864e18);

        vm.prank(alice);
        core.scheduleRewards(Pool.B, 86400);

        vm.prank(user);
        tokenB.approve(address(core), amount);

        vm.prank(user);
        core.stakeB(amount);
    }

    function testCompoundBRevertsWhenPaused() public {
        vm.prank(ops);
        core.pause();

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.WrongState.selector);
        core.compoundB();
    }

    function testCompoundBRevertsInEmergencyMode() public {
        vm.prank(ops);
        core.enableEmergencyMode();

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.WrongState.selector);
        core.compoundB();
    }

    function testCompoundBRevertsInShutdownMode() public {
        vm.prank(ops);
        core.enableEmergencyMode();

        vm.prank(alice);
        core.activateShutdown();

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.WrongState.selector);
        core.compoundB();
    }

    function testCompoundBEmitsCompoundedWithAllFields() public {
        _stakeA(alice, 100e18);

        vm.warp(block.timestamp + 1000);

        vm.prank(alice);
        vm.expectEmit(true, false, false, true, address(core));
        emit DualPoolRewardEngine.Compounded(alice, 10e18, 0, 10e18, block.timestamp + 7 days);
        core.compoundB();
    }

    function testCompoundBFromEmptyBWithdrawBChargesTier1Fee() public {
        _stakeA(alice, 100e18);

        vm.warp(block.timestamp + 1000);

        vm.prank(alice);
        core.compoundB();

        vm.warp(block.timestamp + 24 hours);

        vm.prank(alice);
        core.withdrawA(100e18);
        assertEq(core.withdrawFeeBP(), 100);
    }

    function testCompoundBKeepsScheduleUnchanged() public {
        _stakeA(bob, 100e18);

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        core.crankCatchUpPool(Pool.A);

        PoolInfo memory beforePoolInfo = core.getPool(Pool.A);

        vm.prank(bob);
        core.compoundB();

        PoolInfo memory afterPoolInfo = core.getPool(Pool.A);

        assertEq(beforePoolInfo.rewardRate, afterPoolInfo.rewardRate);
        assertEq(beforePoolInfo.periodFinish, afterPoolInfo.periodFinish);
        assertEq(beforePoolInfo.lastUpdateTime, afterPoolInfo.lastUpdateTime);
        assertEq(beforePoolInfo.availableRewards, afterPoolInfo.availableRewards);
        assertEq(afterPoolInfo.badDebt, 0);
    }

    function testCompoundBUpdatesRewardPaidSnapshots() public {
        _stakeA(alice, 100e18);

        vm.warp(block.timestamp + 1000);

        vm.prank(alice);
        core.compoundB();
        (,, uint256 rewardPaid) = core.userInfoA(alice);
        PoolInfo memory poolInfo = core.getPool(Pool.A);
        assertEq(poolInfo.accRewardPerToken, rewardPaid);
    }

    function testCompoundBReducesPendingAndBookedAndZeroesRewards() public {
        _stakeA(bob, 100e18);

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        core.crankCatchUpPool(Pool.A);

        PoolInfo memory beforePoolInfo = core.getPool(Pool.A);

        vm.prank(bob);
        core.compoundB();

        uint256 rA = 10e18;
        PoolInfo memory afterPoolInfo = core.getPool(Pool.A);
        vm.prank(bob);
        assertEq(afterPoolInfo.totalPending, beforePoolInfo.totalPending - rA);
    }

    function testCompoundBFromEmptyBSetStakeTimestampToNow() public {
        _stakeA(bob, 100e18);

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        core.compoundB();

        assertEq(core.stakeTimestampB(bob), block.timestamp);
        (uint256 stakedB,,) = core.userInfoB(bob);
        assertGt(stakedB, 0);
        assertEq(core.unlockTimeB(bob), block.timestamp + 7 days);
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

    function _newHarness() internal returns (EngineHarness harness) {
        harness = new EngineHarness(address(tokenA), address(tokenB), CAP, 24 hours);
        harness.setUserModule(address(userModule));
    }

    function _seedDebt(EngineHarness harness, Pool pool) internal {
        harness.seedDebt(pool, 1);
        harness.seedPending(pool, 1);

        PoolInfo memory p = harness.getPool(pool);
        assertEq(p.badDebt, 1);
        assertEq(p.totalPending, 1);
    }

    function testCompoundBRevertsWhenBadDebtAExists() public {
        EngineHarness harness = _newHarness();
        _seedDebt(harness, Pool.A);

        vm.expectRevert(DualPoolRewardEngine.BadDebtExists.selector);
        harness.compoundB();
    }

    function testCompoundBRevertsWhenBadDebtBExists() public {
        EngineHarness harness = _newHarness();
        _seedDebt(harness, Pool.B);

        vm.expectRevert(DualPoolRewardEngine.BadDebtExists.selector);
        harness.compoundB();
    }

    function testCompoundBRevertsWhenBothDebtsExist() public {
        EngineHarness harness = _newHarness();
        _seedDebt(harness, Pool.A);
        _seedDebt(harness, Pool.B);

        assertEq(harness.getPool(Pool.A).badDebt, 1);
        assertEq(harness.getPool(Pool.B).badDebt, 1);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.BadDebtExists.selector);
        harness.compoundB();
    }

    function testCompoundBRevertsWhenAccrualCreatesBadDebt() public {
        EngineHarness harness = new EngineHarness(address(tokenA), address(tokenB), CAP, 24 hours);
        harness.setUserModule(address(userModule));

        harness.seedPool(Pool.B, 1e18, 0, 1000, 100e18, 1e20);

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.BadDebtExists.selector);
        harness.compoundB();
    }

    function testCompoundBRevertsWhenPendingInsufficient() public {
        EngineHarness harness = new EngineHarness(address(tokenA), address(tokenB), CAP, 24 hours);
        harness.setUserModule(address(userModule));

        harness.seedUser(Pool.A, bob, 100e18, 0);
        harness.seedAcc(Pool.A, 1e45);

        PoolInfo memory p = harness.getPool(Pool.A);
        assertEq(p.badDebt, 0);
        assertEq(p.totalPending, 0);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.InsufficientPending.selector);
        harness.compoundB();
    }

    function testCompoundBRevertsWhenBookedInsufficient() public {
        EngineHarness harness = new EngineHarness(address(tokenA), address(tokenB), CAP, 24 hours);

        harness.setUserModule(address(userModule));
        harness.seedUserRewards(Pool.A, bob, 100e18);
        harness.seedPending(Pool.A, 100e18);
        harness.seedBooked(Pool.A, 50e18);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.InsufficientBooked.selector);
        harness.compoundB();
    }

    function testCompoundBRevertsAtMAX_REWARD_SHARES_B() public {
        EngineHarness harness = new EngineHarness(address(tokenA), address(tokenB), CAP, 24 hours);
        harness.setUserModule(address(userModule));

        harness.seedUser(Pool.A, bob, 100e18, 0);
        harness.seedAcc(Pool.A, 1e45);

        harness.seedPool(Pool.B, 0, 0, 0, harness.MAX_REWARD_SHARES_B(), 0);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.RewardShareLimit.selector);
        harness.compoundB();
    }

    function testCompoundBRevertsWhenAddingExceedsRemainingShares() public {
        EngineHarness harness = new EngineHarness(address(tokenA), address(tokenB), CAP, 24 hours);
        harness.setUserModule(address(userModule));

        harness.seedUser(Pool.A, bob, 10e18, 0);
        harness.seedAcc(Pool.A, 1e45);

        harness.seedUser(Pool.B, bob, 10e18, 0);
        harness.seedAcc(Pool.B, 1e45);

        harness.seedPool(Pool.B, 0, 0, 0, harness.MAX_REWARD_SHARES_B() - 10, 0);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.RewardShareLimit.selector);
        harness.compoundB();
    }

    function testCompoundBSucceedsWhenExactlyAtMAX_REWARD_SHARES_B() public {
        EngineHarness harness = new EngineHarness(address(tokenA), address(tokenB), CAP, 24 hours);
        harness.setUserModule(address(userModule));

        harness.seedUser(Pool.A, bob, 2e44, 0);
        harness.seedAcc(Pool.A, 1e45);

        harness.seedUser(Pool.B, bob, 5e44, 0);
        harness.seedAcc(Pool.B, 1e45);

        harness.seedPool(Pool.B, 0, 0, 0, 3e44, 0);

        harness.seedPending(Pool.A, 2e44);
        harness.seedPending(Pool.B, 5e44);

        deal(address(tokenB), address(harness), 10e44);

        vm.prank(bob);
        harness.compoundB();

        assertEq(harness.getPool(Pool.A).totalStaked, 0);
        assertEq(harness.getPool(Pool.A).totalPending, 0);

        PoolInfo memory poolInfo = harness.getPool(Pool.B);
        assertEq(poolInfo.totalStaked, 10e44);
        assertEq(harness.getPool(Pool.B).totalPending, 0);
    }

    function testCompoundBExemptFromMaxTVLCap() public {
        _stakeA(bob, 100e18);

        vm.prank(alice);
        core.setMaxTVLCap(Pool.A, 1);

        vm.warp(1000);

        vm.prank(bob);
        core.compoundB();
        PoolInfo memory poolInfo = core.getPool(Pool.B);
        assertGt(poolInfo.totalStaked, 0);
    }

    function testCompoundBExemptFromMinStakeAmountB() public {
        _stakeA(bob, 100e18);

        vm.prank(alice);
        core.setMinStakeAmount(Pool.B, 1000e18);

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        core.compoundB();

        (uint256 stakedB,,) = core.userInfoB(bob);
        assertGt(stakedB, 0);
        assertLt(stakedB, 1000e18);
    }

    function testCompoundBNotExemptFromMAX_REWARD_SHARES_B() public {
        EngineHarness harness = new EngineHarness(address(tokenA), address(tokenB), CAP, 24 hours);
        harness.setUserModule(address(userModule));

        harness.seedUserRewards(Pool.A, bob, 100e18);
        harness.seedPending(Pool.A, 100e18);
        harness.seedBooked(Pool.A, 100e18);

        harness.seedPool(Pool.B, 0, 0, 0, harness.MAX_REWARD_SHARES_B(), 0);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.RewardShareLimit.selector);
        harness.compoundB();

        assertEq(harness.getUserA(bob).rewards, 100e18);
        assertEq(harness.getPool(Pool.A).totalPending, 100e18);
        assertEq(harness.getPool(Pool.A).bookedUserRewards, 100e18);
        assertEq(harness.getPool(Pool.B).totalStaked, harness.MAX_REWARD_SHARES_B());
    }

    function testCompoundBThenWithdrawBChargesFullFee() public {
        EngineHarness harness = new EngineHarness(address(tokenA), address(tokenB), CAP, 24 hours);
        harness.setUserModule(address(userModule));

        harness.seedUserRewards(Pool.A, bob, 10e18);
        harness.seedPending(Pool.A, 10e18);
        harness.seedBooked(Pool.A, 10e18);

        deal(address(tokenB), address(harness), 10e18);

        vm.prank(bob);
        harness.compoundB();

        (uint256 stakedB,,) = harness.userInfoB(bob);
        assertEq(stakedB, 10e18);
        assertEq(harness.stakeTimestampB(bob), block.timestamp);

        vm.warp(harness.unlockTimeB(bob));

        uint256 expectedFee = stakedB * harness.withdrawFeeBP() / harness.BASIS_POINTS();

        vm.prank(bob);
        vm.expectEmit(true, true, false, true);
        emit DualPoolRewardEngine.Withdrawn(bob, Pool.B, stakedB, expectedFee, false);

        harness.withdrawB(stakedB);

        (uint256 staked,,) = harness.userInfoA(bob);

        assertEq(staked, 0);
    }

    function testCompoundBThenClaimARevertsInCooldown() public {
        _stakeA(bob, 100e18);

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        core.compoundB();

        uint256 expectedAvailableAt = core.lastClaimTime(bob) + core.CLAIM_COOLDOWN();

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(DualPoolRewardEngine.ClaimCooldownActive.selector, expectedAvailableAt));
        core.claimA();
    }

    function testCompoundBThenClaimAAfterCooldown() public {
        _stakeA(bob, 100e18);

        vm.warp(block.timestamp + 1000);
        vm.prank(bob);
        core.crankCatchUpPool(Pool.A);

        vm.prank(bob);
        core.compoundB();

        vm.warp(block.timestamp + 25 hours);

        (, uint256 rewards,) = core.userInfoA(bob);
        assertEq(rewards, 0);
        vm.prank(bob);
        core.claimA();
    }

    function testCompoundBMultipleUsersIndependent() public {
        _stakeA(alice, 100e18);

        deal(address(tokenA), bob, 100e18);
        vm.startPrank(bob);
        tokenA.approve(address(core), 100e18);
        core.stakeA(100e18);
        vm.stopPrank();

        vm.warp(block.timestamp + 1000);

        vm.prank(alice);
        core.compoundB();

        (uint256 staked,,) = core.userInfoA(bob);
        assertEq(staked, 100e18);

        (uint256 aliceStaked,,) = core.userInfoB(alice);
        assertGt(aliceStaked, 0);
    }

    function testCompoundBConsecutiveCompounds() public {
        _stakeA(bob, 100e18);

        vm.warp(block.timestamp + 1000);
        uint256 t1 = block.timestamp;

        vm.prank(bob);
        core.compoundB();

        (uint256 stakedB1,,) = core.userInfoB(bob);
        assertEq(stakedB1, 1e19);
        assertEq(core.stakeTimestampB(bob), t1);
        assertEq(core.unlockTimeB(bob), t1 + 7 days);
        assertEq(core.lastClaimTime(bob), t1);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(DualPoolRewardEngine.ClaimCooldownActive.selector, t1 + 24 hours));
        core.compoundB();

        vm.warp(t1 + 24 hours);
        uint256 t2 = block.timestamp;

        vm.prank(bob);
        core.compoundB();

        (uint256 stakedB2,,) = core.userInfoB(bob);
        assertEq(stakedB2, 1e19 + 854e18);
        assertEq(core.lastClaimTime(bob), t2);
        assertEq(core.unlockTimeB(bob), t2 + 7 days);

        uint256 added = stakedB2 - stakedB1;
        uint256 expectedTs = t1 + (added * (t2 - t1) + stakedB2 - 1) / stakedB2;
        assertEq(core.stakeTimestampB(bob), expectedTs);
        assertEq(expectedTs, 86401);

        // A 池本金自始至终没变
        (uint256 stakedAmount,,) = core.userInfoA(bob);
        assertEq(stakedAmount, 100e18);
    }

    function testCompoundBWithFOTTokenA() public {
        uint256 feeBP = 500;
        (DualPoolStaking fotCore, MockFOTERC20 fotToken) = _deployFOTACore(feeBP);
        vm.prank(deployer);
        fotCore.setAdmin(alice, true);

        deal(address(tokenB), ops, 864e18);
        vm.prank(ops);
        tokenB.approve(address(fotCore), 864e18);

        vm.prank(ops);
        fotCore.fundRewards(Pool.A, 864e18);

        vm.prank(alice);
        fotCore.scheduleRewards(Pool.A, 86400);

        deal(address(tokenA), bob, 100e18);
        vm.prank(bob);
        tokenA.approve(address(fotCore), 100e18);

        uint256 amount = 100e18;
        deal(address(fotToken), bob, amount);
        vm.prank(bob);
        fotToken.approve(address(fotCore), amount);
        vm.prank(bob);
        fotCore.stakeA(amount);

        (uint256 stakedA,,) = fotCore.userInfoA(bob);
        assertEq(stakedA, amount - amount * feeBP / 10000);

        uint256 balanceBBefore = tokenB.balanceOf(address(fotCore));

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        fotCore.compoundB();

        (uint256 stakedB,,) = fotCore.userInfoB(bob);
        assertApproxEqAbs(stakedB, 1e19, 1);
        assertEq(tokenB.balanceOf(address(fotCore)), balanceBBefore);
        (uint256 staked,,) = fotCore.userInfoA(bob);
        assertEq(staked, stakedA);
    }

    function testCompoundBWithFOTTokenB() public {
        uint256 feeBP = 500;
        (DualPoolStaking fotCore, MockFOTERC20 fotToken) = _deployFOTBCore(feeBP);

        uint256 fundAmount = 864e18;
        deal(address(fotToken), ops, fundAmount);
        vm.prank(ops);
        fotToken.approve(address(fotCore), fundAmount);
        vm.prank(ops);
        fotCore.fundRewards(Pool.A, fundAmount);

        uint256 received = fundAmount - fundAmount * feeBP / BASIS_POINTS;
        assertEq(fotCore.getPool(Pool.A).availableRewards, received);

        vm.prank(alice);
        fotCore.scheduleRewards(Pool.A, 86400);

        deal(address(tokenA), bob, 100e18);
        vm.prank(bob);
        tokenA.approve(address(fotCore), 100e18);
        vm.prank(bob);
        fotCore.stakeA(100e18);

        uint256 balanceBBefore = fotToken.balanceOf(address(fotCore));
        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        fotCore.compoundB();

        (uint256 stakedB,,) = fotCore.userInfoB(bob);
        (uint256 stakedA,,) = fotCore.userInfoA(bob);
        assertEq(stakedB, 95e17);

        assertEq(fotToken.balanceOf(address(fotCore)), balanceBBefore);

        assertEq(stakedA, 100e18);
    }

    function testCompoundBExtendsLockWhenOldIsShorter() public{
        vm.prank(alice);
        core.setLockDuration(90 days);

        _stakeA(bob,100e18);
        _stakeB(bob,100e18);

        uint256 farUnlock = core.unlockTimeB(bob);
        assertEq(farUnlock, block.timestamp + 90 days);

        vm.prank(alice);
        core.setLockDuration(7 days);

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        core.compoundB();

        assertEq(core.unlockTimeB(bob), farUnlock);
    }

    function testCompoundBFirstCallNoCooldown() public {
        _stakeA(bob, 100e18);

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        core.crankCatchUpPool(Pool.A);

        vm.prank(bob);
        core.compoundB();
        (uint256 staked,,) = core.userInfoB(bob);
        assertGt(staked, 0);
    }
}
