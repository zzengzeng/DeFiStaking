// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Pool, PoolInfo, UserInfo} from "../src/StakeTypes.sol";
import {DualPoolStaking} from "../src/core/DualPoolStaking.sol";
import {BaseTest} from "./BaseTest.sol";
import {DualPoolRewardEngine} from "../src/core/DualPoolRewardEngine.sol";
import {MockFOTERC20} from "./mocks/MockFOTERC20.sol";
import {DualPoolAdminModule} from "../src/core/DualPoolAdminModule.sol";
import {DualPoolUserModule} from "../src/core/DualPoolUserModule.sol";

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
        vm.expectRevert(DualPoolRewardEngine.PausedStatus.selector);
        core.withdrawA(20e18);
    }

    function _forceShutdown() internal {
        // slot 44: emergencyMode(byte0), shutdownMode(byte1)
        vm.store(address(core), bytes32(uint256(44)), bytes32(uint256(0x0101)));
        assertTrue(core.shutdownMode());
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

        vm.prank(ops);
        core.enableEmergencyMode();

        vm.prank(alice);
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
}
