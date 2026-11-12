// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BaseTest} from "./BaseTest.sol";
import {DualPoolRewardEngine} from "../src/core/DualPoolRewardEngine.sol";

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
}
