// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BaseTest} from "./BaseTest.sol";
import {DualPoolRewardEngine} from "../src/core/DualPoolRewardEngine.sol";
import {DualPoolStaking} from "../src/core/DualPoolStaking.sol";
import {MockFOTERC20} from "./mocks/MockFOTERC20.sol";

import {IDualPoolUserModule} from "../src/interfaces/IDualPoolUserModule.sol";
import {Pool, PoolInfo} from "../src/StakeTypes.sol";

contract TestStake is BaseTest {
    function testStakeA() public {
        uint256 amount = 100e18;

        deal(address(tokenA), bob, amount);
        vm.prank(bob);
        tokenA.approve(address(core), amount);

        vm.prank(bob);
        core.stakeA(amount);

        (uint256 staked,, uint256 paid) = core.userInfoA(bob);

        PoolInfo memory p = core.getPool(Pool.A);
        assertEq(staked, amount);
        assertEq(p.totalStaked, amount);
        assertEq(paid, 0);
        assertEq(tokenA.balanceOf(address(core)), amount);
        assertEq(tokenA.balanceOf(address(bob)), 0);
    }

    function testStakeARevertsOnZero() public {
        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.ZeroAmount.selector);
        core.stakeA(0);
    }

    function testStakeARevertsWhenPaused() public {
        vm.prank(ops);
        core.pause();

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.WrongState.selector);
        core.stakeA(100e18);
    }

    function testStakeARevertsBelowMinStake() public {
        vm.prank(alice);
        core.setMinStakeAmount(Pool.A, 1e18);

        deal(address(tokenA), bob, 200e18);

        vm.prank(bob);
        tokenA.approve(address(core), 200e18);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.BelowMinStake.selector);
        core.stakeA(1e15);
    }

    function testStakeARevertsAboveTVLCap() public {
        vm.prank(alice);
        core.setMaxTVLCap(Pool.A, 100e18);

        deal(address(tokenA), bob, 200e18);
        vm.prank(bob);
        tokenA.approve(address(core), 200e18);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.CapExceeded.selector);
        core.stakeA(200e18);
    }

    function testStakeAEmitsStaked() public {
        deal(address(tokenA), bob, 100e18);
        vm.startPrank(bob);
        tokenA.approve(address(core), 100e18);
        vm.expectEmit(true, true, false, true);
        emit DualPoolRewardEngine.Staked(bob, Pool.A, 100e18, 0);
        core.stakeA(100e18);

        vm.stopPrank();
    }

    function testStakeB() public {
        deal(address(tokenB), bob, 100e18);
        vm.startPrank(bob);
        tokenB.approve(address(core), 100e18);

        core.stakeB(100e18);
        (uint256 staked,,) = core.userInfoB(bob);

        assertEq(staked, 100e18);
        assertEq(core.unlockTimeB(bob), block.timestamp + 7 days);
        assertEq(core.stakeTimestampB(bob), block.timestamp);
        vm.stopPrank();
    }

    function testStakeBExtendsLock() public {
        deal(address(tokenB), bob, 200e18);
        vm.startPrank(bob);
        tokenB.approve(address(core), 200e18);

        core.stakeB(100e18);
        assertEq(core.unlockTimeB(bob), block.timestamp + 7 days);
        core.stakeB(100e18);
        assertEq(core.unlockTimeB(bob), block.timestamp + 7 days);

        vm.stopPrank();
    }

    function testStakeBWADP() public {
        uint256 t0 = block.timestamp;
        deal(address(tokenB), bob, 200e18);
        vm.startPrank(bob);
        tokenB.approve(address(core), 200e18);

        core.stakeB(100e18);
        assertEq(core.stakeTimestampB(bob), t0);

        vm.warp(t0 + 1000);
        core.stakeB(100e18);

        assertEq(core.stakeTimestampB(bob), t0 + 500);

        vm.stopPrank();
    }

    function testStakeBEmitsStaked() public {
        deal(address(tokenB), bob, 100e18);
        vm.startPrank(bob);
        tokenB.approve(address(core), 100e18);

        vm.expectEmit(true, true, false, true);
        emit DualPoolRewardEngine.Staked(bob, Pool.B, 100e18, block.timestamp + 7 days);
        core.stakeB(100e18);
        vm.stopPrank();
    }

    function testStakeBRevertsAboveSharesCap() public {
        deal(address(tokenB), bob, 1e46);
        vm.startPrank(bob);
        tokenB.approve(address(core), 1e46);
        vm.expectRevert(DualPoolRewardEngine.RewardShareLimit.selector);
        core.stakeB(1e46);
        vm.stopPrank();
    }

    function testStakeBRevertsOnZero() public {
        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.ZeroAmount.selector);
        core.stakeB(0);
    }

    function testStakeBRevertsWhenPaused() public {
        vm.prank(ops);
        core.pause();

        deal(address(tokenB), bob, 10e18);
        vm.prank(bob);
        tokenB.approve(bob, 10e18);

        vm.expectRevert(DualPoolRewardEngine.WrongState.selector);
        core.stakeB(10e18);
    }

    function testStakeBRevertsInEmergency() public {
        vm.prank(ops);
        core.enableEmergencyMode();

        deal(address(tokenB), bob, 20e18);
        vm.prank(bob);
        tokenB.approve(bob, 20e18);

        vm.expectRevert(DualPoolRewardEngine.WrongState.selector);
        core.stakeB(20e18);
    }

    function _forceShutdown() internal {
        // slot 44: emergencyMode(byte0), shutdownMode(byte1)
        vm.store(address(core), bytes32(uint256(44)), bytes32(uint256(0x0101)));
        assertTrue(core.shutdownMode());
    }

    function testStakeBRevertsInShutdown() public {
        vm.prank(alice);
        _forceShutdown();

        deal(address(tokenB), bob, 30e18);
        vm.prank(bob);
        tokenB.approve(bob, 30e18);

        vm.expectRevert(DualPoolRewardEngine.WrongState.selector);
        core.stakeB(30e18);
    }

    function testStakeBRevertsBelowMinStake() public {
        vm.prank(alice);
        core.setMinStakeAmount(Pool.B, 1e5);

        deal(address(tokenB), bob, 1e2);
        vm.prank(bob);
        tokenB.approve(address(core), 1e2);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.BelowMinStake.selector);
        core.stakeB(1e2);
    }

    function testStakeBRevertsAboveTVLCap() public {
        vm.prank(alice);
        core.setMaxTVLCap(Pool.B, 1e20);

        deal(address(tokenB), bob, 1e21);
        vm.prank(bob);
        tokenB.approve(address(core), 1e21);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.CapExceeded.selector);
        core.stakeB(1e21);
    }

    function testStakeBUpdatesSnapshot() public {
        deal(address(tokenB), bob, 200e18);
        vm.prank(bob);
        tokenB.approve(address(core), 200e18);

        vm.prank(bob);
        core.stakeB(200e18);
        (,, uint256 rewardPaid) = core.userInfoB(bob);
        PoolInfo memory p = core.getPool(Pool.B);
        assertEq(rewardPaid, p.accRewardPerToken);
    }

    function testStakeBFirstStakeSetsWADP() public {
        deal(address(tokenB), bob, 200e18);
        vm.prank(bob);
        tokenB.approve(address(core), 200e18);

        vm.prank(bob);
        core.stakeB(200e18);
        assertEq(core.stakeTimestampB(bob), block.timestamp);
    }

    function testStakeBSettlesOldRewardsFirst() public {
        deal(address(tokenB), ops, 1000e18);

        vm.prank(ops);
        tokenB.approve(address(core), 1000e18);

        vm.prank(ops);
        core.fundRewards(Pool.B, 1000e18);

        vm.prank(alice);
        core.scheduleRewards(Pool.B, 30 days);

        deal(address(tokenB), bob, 100e18);
        vm.prank(bob);
        tokenB.approve(address(core), 100e18);

        vm.prank(bob);
        core.stakeB(50e18);

        vm.warp(block.timestamp + 1000);

        vm.prank(bob);
        core.stakeB(50e18);

        (, uint256 rewards,) = core.userInfoB(bob);
        assertGt(rewards, 0);
    }

    function testStakeBInvariantHolds() public {
        deal(address(tokenB), ops, 1000e18);
        deal(address(tokenB), bob, 100e18);

        vm.prank(bob);
        tokenB.approve(address(core), 100e18);

        vm.prank(ops);
        tokenB.approve(address(core), 1000e18);

        vm.prank(ops);
        core.fundRewards(Pool.B, 1000e18);

        vm.prank(alice);
        core.scheduleRewards(Pool.B, 30 days);

        vm.prank(bob);
        core.stakeB(100e18);

        vm.warp(block.timestamp + 1000);
        (uint256 staked,,) = core.userInfoB(bob);
        assertEq(staked, 100e18);
    }

    function testStakeBWADPOneWeiAttack() public {
        deal(address(tokenB), ops, 1000e18);
        vm.prank(ops);
        tokenB.approve(address(core), 1000e18);

        deal(address(tokenB), bob, 101e18);
        vm.prank(bob);
        tokenB.approve(address(core), 101e18);

        vm.prank(ops);
        core.fundRewards(Pool.B, 1000e18);

        vm.prank(alice);
        core.scheduleRewards(Pool.B, 30 days);

        vm.prank(bob);
        core.stakeB(100e18);

        uint256 t0 = core.stakeTimestampB(bob);

        vm.warp(block.timestamp + 6 days);

        vm.prank(bob);
        core.stakeB(1 wei);

        assertEq(core.stakeTimestampB(bob), t0 + 1);
    }

    function testStakeBWADPMultipleAdds() public {
        deal(address(tokenB), bob, 600e18);
        vm.prank(bob);
        tokenB.approve(address(core), 600e18);
        uint256 t0 = block.timestamp;

        vm.prank(bob);
        core.stakeB(100e18);
        assertEq(core.stakeTimestampB(bob), t0);

        vm.warp(t0 + 1000);

        vm.prank(bob);
        core.stakeB(100e18);
        assertEq(core.stakeTimestampB(bob), t0 + 500);

        vm.warp(t0 + 3000);

        vm.prank(bob);
        core.stakeB(100e18);
        assertEq(core.stakeTimestampB(bob), t0 + 1334);
    }

    function testStakeBKeepsLongerOldLock() public {
        uint256 t0 = block.timestamp;

        deal(address(tokenB), bob, 600e18);
        vm.prank(bob);
        tokenB.approve(address(core), 600e18);

        vm.prank(bob);
        core.stakeB(100e18);

        vm.warp(block.timestamp + 1 days);

        vm.prank(alice);
        core.setLockDuration(3 days);

        vm.prank(bob);
        core.stakeB(100e18);

        assertEq(core.unlockTimeB(bob), t0 + 7 days);
    }

    function testStakeBNewLockStartsFromNow() public {
        uint256 t0 = block.timestamp;

        deal(address(tokenB), bob, 600e18);
        vm.prank(bob);
        tokenB.approve(address(core), 600e18);

        vm.prank(bob);
        core.stakeB(100e18);

        vm.warp(block.timestamp + 7 days);

        vm.prank(bob);
        core.stakeB(100e18);

        assertEq(core.unlockTimeB(bob), t0 + 14 days);
    }

    function testStakeBWithFOTWithinCap() public {
        uint256 feeBP = 500;
        (DualPoolStaking fotCore, MockFOTERC20 fotToken) = _deployFOTBCore(feeBP);

        deal(address(fotToken), bob, 500e18);
        vm.prank(bob);
        fotToken.approve(address(fotCore), 500e18);

        vm.prank(bob);
        fotCore.stakeB(100e18);
        (uint256 staked,,) = fotCore.userInfoB(bob);
        assertEq(staked, 95e18);
    }

    function testStakeBWithFOTAboveCap() public {
        uint256 feeBP = 1000;
        (DualPoolStaking fotCore, MockFOTERC20 fotToken) = _deployFOTBCore(feeBP);

        deal(address(fotToken), bob, 500e18);
        vm.prank(bob);
        fotToken.approve(address(fotCore), 500e18);

        vm.prank(alice);
        fotCore.setMaxTVLCap(Pool.B, 1e20);

        vm.prank(bob);
        fotCore.stakeB(100e18);

        vm.prank(bob);
        vm.expectRevert(DualPoolRewardEngine.CapExceeded.selector);
        fotCore.stakeB(100e18);
    }
}
