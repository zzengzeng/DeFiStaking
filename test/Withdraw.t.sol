// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Pool, PoolInfo, UserInfo} from "../src/StakeTypes.sol";
import {DualPoolStaking} from "../src/core/DualPoolStaking.sol";
import {BaseTest} from "./BaseTest.sol";
import {DualPoolRewardEngine} from "../src/core/DualPoolRewardEngine.sol";
import {MockFOTERC20} from "./mocks/MockFOTERC20.sol";
import {DualPoolAdminModule} from "../src/core/DualPoolAdminModule.sol";
import {DualPoolUserModule} from "../src/core/DualPoolUserModule.sol";
import {EngineHarness} from "./EngineHarness.sol";

contract TestWithdraw is BaseTest {
    function _stakeA(address user, uint256 amount) internal {
        deal(address(tokenA), user, amount);
        vm.prank(user);
        tokenA.approve(address(core), amount);
        vm.prank(user);
        core.stakeA(amount);
    }

    function _stakeB(address user, uint256 amount) internal {
        deal(address(tokenB), user, amount);
        vm.prank(user);
        tokenB.approve(address(core), amount);
        vm.prank(user);
        core.stakeB(amount);
    }

    function testWithdrawAFull() public {
        uint256 amount = 100e18;
        _stakeA(alice, amount);

        vm.prank(alice);
        core.withdrawA(amount);
        (uint256 staked,,) = core.userInfoA(alice);
        PoolInfo memory p = core.getPool(Pool.A);
        assertEq(staked, 0);
        assertEq(p.totalStaked, 0);
    }

    function testWithdrawAPartial() public {
        uint256 amount = 100e18;
        _stakeA(alice, amount);

        vm.prank(alice);
        core.withdrawA(40e18);
        (uint256 staked,,) = core.userInfoA(alice);
        PoolInfo memory p = core.getPool(Pool.A);
        assertEq(staked, 60e18);
        assertEq(tokenA.balanceOf(address(core)), 60e18);
        assertEq(p.totalStaked, 60e18);
    }

    function testWithdrawATwicePartial() public {
        uint256 amount = 100e18;
        _stakeA(alice, amount);

        vm.startPrank(alice);
        core.withdrawA(30e18);
        core.withdrawA(20e18);
        (uint256 staked,,) = core.userInfoA(alice);
        PoolInfo memory p = core.getPool(Pool.A);
        assertEq(staked, 50e18);
        assertEq(tokenA.balanceOf(address(core)), 50e18);
        assertEq(p.totalStaked, 50e18);
        vm.stopPrank();
    }

    function testWithdrawAFullAfterTwoStakes() public {
        _stakeA(alice, 100e18);
        _stakeA(alice, 50e18);

        vm.prank(alice);
        core.withdrawA(150e18);

        (uint256 staked,,) = core.userInfoA(alice);
        PoolInfo memory p = core.getPool(Pool.A);
        assertEq(staked, 0);
        assertEq(p.totalStaked, 0);
    }

    function testWithdrawARevertsOnZero() public {
        _stakeA(alice, 100e18);

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.InvalidAmount.selector);
        core.withdrawA(0);
    }

    function testWithdrawARevertsAboveStaked() public {
        _stakeA(alice, 100e18);

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.InvalidAmount.selector);
        core.withdrawA(101e18);
    }

    function testWithdrawARevertsWithoutStake() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.InvalidAmount.selector);
        core.withdrawA(10e18);
    }

    function testWithdrawARevertsWhenPaused() public {
        _stakeA(bob, 100e18);
        vm.prank(ops);
        core.pause();

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.PausedStatus.selector);
        core.withdrawA(10e18);
        vm.stopPrank();
    }

    function testWithdrawARevertsInEmergency() public {
        _stakeA(bob, 100e18);

        vm.prank(ops);
        core.enableEmergencyMode();

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.EmergencyStatus.selector);
        core.withdrawA(20e18);
    }

    function testWithdrawAWorksInShutdown() internal {
        vm.prank(ops);
        core.pause();

        vm.prank(alice);
        _forceShutdown();

        _stakeA(bob, 100e18);
        vm.prank(bob);
        core.withdrawA(100e18);
        (uint256 staked,,) = core.userInfoA(alice);
        assertEq(staked, 0);
    }

    function testWithdrawAWorksInShutdownWhilePaused() public {
        uint256 amount = 100e18;

        _stakeA(bob, amount);

        _forceShutdown();

        assertTrue(core.paused(), "should be paused");
        assertTrue(core.emergencyMode(), "should be ememrgency");
        assertTrue(core.shutdownMode(), "should be shudown");

        vm.prank(bob);
        core.withdrawA(amount);
        (uint256 staked,,) = core.userInfoA(bob);
        PoolInfo memory p = core.getPool(Pool.A);
        assertEq(staked, 0);
        assertEq(p.totalStaked, 0);
        assertEq(tokenA.balanceOf(bob), amount);
    }

    function testWithdrawAPreservesRewards() public {
        uint256 amount = 1000e18;
        deal(address(tokenB), ops, amount);
        deal(address(tokenA), bob, 100e18);

        vm.prank(ops);
        tokenB.approve(address(core), amount);

        vm.prank(alice);
        core.setRewardDuration(Pool.A, 30 days);

        vm.prank(ops);
        core.fundRewards(Pool.A, amount);

        vm.prank(alice);
        core.scheduleRewards(Pool.A, 0);

        _stakeA(bob, 100e18);

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        core.withdrawA(10e18);
        (, uint256 rewards,) = core.userInfoA(bob);
        assertGt(rewards, 0);

        vm.prank(bob);
        core.withdrawA(90e18);
        (uint256 staked, uint256 rewardsAfter,) = core.userInfoA(bob);
        assertEq(staked, 0);
        assertEq(rewardsAfter, rewards);
    }

    function testWithdrawASettlesRewardsFirst() public {
        uint256 amount = 1000e18;
        deal(address(tokenB), ops, amount);
        vm.prank(ops);
        tokenB.approve(address(core), amount);

        vm.prank(ops);
        core.fundRewards(Pool.A, amount);

        vm.prank(alice);
        core.scheduleRewards(Pool.A, 30 days);

        vm.prank(bob);
        _stakeA(bob, 100e18);

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        core.withdrawA(100e18);

        (uint256 staked, uint256 rewards,) = core.userInfoA(bob);
        uint256 expectedReward = (amount / 30 days) * 1000;
        assertApproxEqAbs(rewards, expectedReward, 1);
        assertEq(staked, 0);
    }

    function testWithdrawAUpdatesSnapshot() public {
        uint256 amount = 1000e18;
        deal(address(tokenB), ops, amount);
        vm.prank(ops);
        tokenB.approve(address(core), amount);

        vm.prank(ops);
        core.fundRewards(Pool.A, amount);

        vm.prank(alice);
        core.scheduleRewards(Pool.A, 30 days);

        vm.prank(bob);
        _stakeA(bob, 100e18);

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        core.withdrawA(100e18);

        (,, uint256 rewardPaid) = core.userInfoA(bob);
        PoolInfo memory p = core.getPool(Pool.A);
        assertEq(p.accRewardPerToken, rewardPaid);
        assertGt(rewardPaid, 0);
    }

    function testWithdrawADoesNotAffectB() public {
        uint256 amount = 1000e18;
        deal(address(tokenB), ops, amount);
        vm.prank(ops);
        tokenB.approve(address(core), amount);

        vm.prank(ops);
        core.fundRewards(Pool.A, amount);

        vm.prank(alice);
        core.scheduleRewards(Pool.A, 30 days);

        _stakeA(bob, 100e18);

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        core.withdrawA(100e18);

        (, uint256 rewards,) = core.userInfoB(bob);
        assertEq(rewards, 0);
    }

    function testWithdrawADoesNotBlockOnBDeficit() public {
        uint256 amount = 1000e18;
        deal(address(tokenB), ops, amount);

        vm.prank(ops);
        tokenB.approve(address(core), amount);

        vm.prank(ops);
        core.fundRewards(Pool.A, amount);

        vm.prank(alice);
        core.scheduleRewards(Pool.A, 30 days);

        // poolB.badDebt = slot 31, poolB.totalPending = slot 32
        vm.store(address(core), bytes32(uint256(31)), bytes32(uint256(1)));
        vm.store(address(core), bytes32(uint256(32)), bytes32(uint256(1)));

        _stakeA(bob, 100e18);

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        core.withdrawA(100e18);

        (, uint256 rewards,) = core.userInfoA(bob);
        assertGt(rewards, 0);
    }

    function testWithdrawARevertsOnPrincipalDeficit() public {
        uint256 amount = 100e18;
        _stakeA(bob, amount);

        deal(address(tokenA), address(core), 50e18);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(DualPoolRewardEngine.PrincipalDeficit.selector, Pool.A, 50e18, 100e18));
        core.withdrawA(50e18);
    }

    function testWithdrawAExactlyCovered() public {
        uint256 amount = 100e18;
        _stakeA(bob, amount);
        vm.prank(bob);
        core.withdrawA(50e18);
        PoolInfo memory p = core.getPool(Pool.A);
        assertEq(p.totalStaked, tokenA.balanceOf(address(core)));
    }

    function testWithdrawAEmitsWithdrawn() public {
        uint256 amount = 1000e18;
        deal(address(tokenB), ops, amount);
        vm.prank(ops);
        tokenB.approve(address(core), amount);

        vm.prank(ops);
        core.fundRewards(Pool.A, amount);

        vm.prank(alice);
        core.scheduleRewards(Pool.A, 30 days);

        _stakeA(bob, 100e18);

        vm.prank(bob);

        vm.expectEmit(true, true, false, true);
        emit DualPoolRewardEngine.Withdrawn(bob, Pool.A, 50e18, 0, false);
        core.withdrawA(50e18);
    }

    function testWithdrawADoesNotEmitOnRevert() public {
        _stakeA(bob, 100e18);
        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.InvalidAmount.selector);
        core.withdrawA(0);
    }

    function testWithdrawAWithFOTWithinCap() public {
        uint256 feeBP = 500;
        (DualPoolStaking fotCore, MockFOTERC20 fotToken) = _deployFOTACore(feeBP);
        vm.prank(deployer);
        fotCore.setAdmin(alice, true);

        deal(address(fotToken), bob, 100e18);

        vm.prank(bob);
        fotToken.approve(address(fotCore), 100e18);
        vm.prank(bob);
        fotCore.stakeA(100e18);
        (uint256 staked,,) = fotCore.userInfoA(bob);
        assertEq(staked, 95e18);

        vm.prank(bob);
        fotCore.withdrawA(95e18);
        (uint256 stakedAfter,,) = fotCore.userInfoA(bob);
        assertEq(stakedAfter, 0);
        assertEq(fotToken.balanceOf(bob), 90.25e18);
        assertEq(fotToken.balanceOf(address(core)), 0);
    }

    function testWithdrawBMatureFirstTier() public {
        uint256 stakeAmount = 100e18;
        _fundAndSchedule(Pool.B, 86400e18, 8640000);
        _stakeB(bob, stakeAmount);

        vm.warp(block.timestamp + 30 days);

        vm.prank(bob);
        core.withdrawB(stakeAmount);
        assertEq(core.unclaimedFeesB(), 1e18);
    }

    function testWithdrawBMatureMidTier() public {
        uint256 stakeAmount = 100e18;
        _fundAndSchedule(Pool.B, 86400e18, 8640000);
        _stakeB(bob, stakeAmount);

        uint256 coreBalanceBefore = tokenB.balanceOf(address(core));
        vm.warp(block.timestamp + 100 days);
        vm.prank(bob);
        core.withdrawB(stakeAmount);
        assertEq(core.unclaimedFeesB(), 5e17);
        assertEq(tokenB.balanceOf(bob), stakeAmount - 5e17);
        assertEq(tokenB.balanceOf(address(core)), coreBalanceBefore - stakeAmount + 5e17);
    }

    function testWithdrawBMatureNoFee() public {
        uint256 stakeAmount = 100e18;
        _fundAndSchedule(Pool.B, 86400e18, 8640000);
        _stakeB(bob, stakeAmount);

        vm.warp(block.timestamp + 200 days);
        vm.prank(bob);
        core.withdrawB(stakeAmount);
        assertEq(core.unclaimedFeesB(), 0);
    }

    function testWithdrawBMatureKeepsRewards() public {
        uint256 stakeAmount = 100e18;
        _fundAndSchedule(Pool.B, 86400e18, 8640000);
        _stakeB(bob, stakeAmount);

        vm.warp(block.timestamp + 100 days);
        vm.prank(bob);
        core.withdrawB(50e18);

        uint256 before = tokenB.balanceOf(bob);
        vm.prank(bob);
        core.claimB();
        assertGt(tokenB.balanceOf(bob), before);
    }

    function testWithdrawBMaturePartialKeepsLockAndWadp() public {
        uint256 stakeAmount = 100e18;
        _fundAndSchedule(Pool.B, 86400e18, 8640000);
        _stakeB(bob, stakeAmount);

        vm.warp(block.timestamp + 8 days);

        vm.prank(bob);
        core.withdrawB(50e18);

        assertGt(core.unlockTimeB(bob), 0);
        assertGt(core.stakeTimestampB(bob), 0);
        assertEq(core.unclaimedFeesB(), 0.5e18);
    }

    function testWithdrawBMatureFullClearsLockAndWadp() public {
        uint256 stakeAmount = 100e18;
        _fundAndSchedule(Pool.B, 86400e18, 8640000);
        _stakeB(bob, stakeAmount);

        vm.warp(block.timestamp + 8 days);

        vm.prank(bob);
        core.withdrawB(stakeAmount);
        assertEq(core.unlockTimeB(bob), 0);
        assertEq(core.stakeTimestampB(bob), 0);
    }

    function testWithdrawBRevertsOnZero() public {
        uint256 stakeAmount = 100e18;
        _fundAndSchedule(Pool.B, 86400e18, 8640000);
        _stakeB(bob, stakeAmount);

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.InvalidAmount.selector);
        core.withdrawB(0);
    }

    function testWithdrawBRevertsAboveStaked() public {
        uint256 stakeAmount = 100e18;
        _fundAndSchedule(Pool.B, 86400e18, 8640000);
        _stakeB(bob, stakeAmount);

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.InvalidAmount.selector);
        core.withdrawB(101e18);
    }

    function testWithdrawBRevertsWithoutStake() public {
        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.InvalidAmount.selector);
        core.withdrawB(101e18);
    }

    function testWithdrawBRevertsWhenPaused() public {
        uint256 stakeAmount = 100e18;
        _fundAndSchedule(Pool.B, 86400e18, 8640000);
        _stakeB(bob, stakeAmount);

        vm.prank(ops);
        core.pause();

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.PausedStatus.selector);
        core.withdrawB(10e18);
    }

    function testWithdrawBRevertsInEmergency() public {
        uint256 stakeAmount = 100e18;
        _fundAndSchedule(Pool.B, 86400e18, 8640000);
        _stakeB(bob, stakeAmount);

        vm.prank(ops);
        core.enableEmergencyMode();

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.EmergencyStatus.selector);
        core.withdrawB(10e18);
    }

    function testWithdrawBWorksInShutdown() public {
        uint256 stakeAmount = 100e18;
        _fundAndSchedule(Pool.B, 86400e18, 8640000);
        _stakeB(bob, stakeAmount);

        vm.warp(block.timestamp + 100 days);

        _forceShutdown();

        vm.prank(bob);
        core.withdrawB(stakeAmount);
        assertEq(core.unclaimedFeesB(), 5e17);
    }

    function testWithdrawBRevertsOnPrincipalDeficit() public {
        uint256 stakeAmount = 100e18;
        _fundAndSchedule(Pool.B, 86400e18, 8640000);
        _stakeB(bob, stakeAmount);

        vm.warp(block.timestamp + 100 days);

        deal(address(tokenB), address(core), 0);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(DualPoolRewardEngine.PrincipalDeficit.selector, Pool.B, 0, stakeAmount));
        core.withdrawB(stakeAmount);
    }

    function testWithdrawBRevertsOnZeroStakeTimestamp() public {
        uint256 stakeAmount = 100e18;
        _fundAndSchedule(Pool.B, 86400e18, 8640000);
        _stakeB(bob, stakeAmount);

        vm.warp(block.timestamp + 100 days);

        uint256 STAKE_TIMESTAMP_B_SLOT = 41;
        bytes32 slot = keccak256(abi.encode(bob, STAKE_TIMESTAMP_B_SLOT));
        vm.store(address(core), slot, bytes32(0));
        assertEq(core.stakeTimestampB(bob), 0);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.InvalidStakeTimestamp.selector);
        core.withdrawB(stakeAmount);
    }

    function testWithdrawBEarlyFull() public {
        uint256 stakeAmount = 100e18;
        _fundAndSchedule(Pool.B, 86400e18, 8640000);
        _stakeB(bob, stakeAmount);

        vm.warp(block.timestamp + 3 days);

        PoolInfo memory pBefore = core.getPool(Pool.B);

        vm.prank(bob);
        core.withdrawB(stakeAmount);

        PoolInfo memory pAfter = core.getPool(Pool.B);

        (, uint256 rewards,) = core.userInfoB(bob);
        assertEq(pAfter.availableRewards - pBefore.availableRewards, 10e18);
        assertEq(rewards, 0);
        assertEq(core.unlockTimeB(bob), 0);
        assertEq(core.stakeTimestampB(bob), 0);
    }

    function testWithdrawBEarlyPartialStillForfeitsAll() public {
        uint256 stakeAmount = 100e18;
        _fundAndSchedule(Pool.B, 86400e18, 8640000);
        _stakeB(bob, stakeAmount);

        vm.warp(block.timestamp + 3 days);

        uint256 beforeUnlockTimeB = core.unlockTimeB(bob);
        uint256 beforeStakeTimestampB = core.stakeTimestampB(bob);

        vm.prank(bob);
        core.withdrawB(50e18);

        uint256 afterUnlockTimeB = core.unlockTimeB(bob);
        uint256 afterStakeTimestampB = core.stakeTimestampB(bob);

        (, uint256 rewards,) = core.userInfoB(bob);
        assertEq(rewards, 0);
        assertEq(beforeUnlockTimeB, afterUnlockTimeB);
        assertEq(beforeStakeTimestampB, afterStakeTimestampB);
    }

    function testWithdrawBEarlyBelowMinAmount() public {
        uint256 stakeAmount = 100e18;
        _fundAndSchedule(Pool.B, 86400e18, 8640000);
        _stakeB(bob, stakeAmount);

        vm.warp(block.timestamp + 3 days);

        vm.prank(alice);
        core.setMinEarlyExitAmountB(10e18);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.BelowMinEarlyExitB.selector);
        core.withdrawB(5e18);
    }

    function testWithdrawBEarlyZeroPenaltyStillForfeits() public {
        uint256 stakeAmount = 100e18;
        _fundAndSchedule(Pool.B, 86400e18, 8640000);
        _stakeB(bob, stakeAmount);

        vm.warp(block.timestamp + 3 days);

        vm.prank(alice);
        core.setFees(0, 100, 50);

        vm.prank(bob);
        core.withdrawB(stakeAmount);
        (, uint256 rewards,) = core.userInfoB(bob);
        assertEq(rewards, 0);
    }

    function testWithdrawBEarlyPenaltyGoesToBudget() public {
        uint256 stakeAmount = 100e18;
        _fundAndSchedule(Pool.B, 86400e18, 8640000);
        _stakeB(bob, stakeAmount);

        PoolInfo memory beforePoolInfo = core.getPool(Pool.B);
        vm.warp(block.timestamp + 3 days);

        vm.prank(bob);
        core.withdrawB(stakeAmount);

        PoolInfo memory afterPoolInfo = core.getPool(Pool.B);

        vm.prank(bob);
        assertGt(afterPoolInfo.availableRewards, beforePoolInfo.availableRewards);
    }

    function testWithdrawBEarlyEmitsRewardForfeited() public {
        uint256 stakeAmount = 100e18;
        _fundAndSchedule(Pool.B, 86400e18, 8640000);
        _stakeB(bob, stakeAmount);

        vm.warp(block.timestamp + 3 days);

        // 把 poolB.badDebt 和 totalPending 真的设到 core 上
        vm.store(address(core), bytes32(uint256(31)), bytes32(uint256(100e18))); // badDebt
        vm.store(address(core), bytes32(uint256(32)), bytes32(uint256(100e18))); // totalPending
        // 注意：totalPending 要 >= badDebt + 即将被扣的 forfeited

        uint256 expectedForfeited = 2592e18;

        vm.prank(bob);
        vm.expectEmit(true, true, false, true, address(core));
        emit DualPoolRewardEngine.RewardForfeited(bob, Pool.B, expectedForfeited, 100e18, 0, 2492e18);
        core.withdrawB(stakeAmount);
    }

    function _seedBadDebt(Pool debtPool) internal returns (EngineHarness) {
        EngineHarness harness = new EngineHarness(address(tokenA), address(tokenB), CAP, 24 hours);
        harness.setUserModule(address(userModule));
        harness.seedDebt(debtPool, 1e18);
        harness.seedPending(debtPool, 1e18);

        PoolInfo memory p = harness.getPool(debtPool);
        assertEq(p.badDebt, 1e18);
        assertEq(p.totalPending, 1e18);

        return harness;
    }
}
