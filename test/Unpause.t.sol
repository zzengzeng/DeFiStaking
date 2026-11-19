// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {stdStorage, StdStorage} from "forge-std/StdStorage.sol";
import {BaseTest} from "./BaseTest.sol";
import {Pool, PoolInfo, UserInfo} from "../src/StakeTypes.sol";
import {DualPoolRewardEngine} from "../src/core/DualPoolRewardEngine.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract TestUnpause is BaseTest {
    using stdStorage for StdStorage;

    function testUnpauseResumesClock() public {
        _fundAndSchedule(Pool.B, 86400e18, 40 days);

        vm.warp(block.timestamp + 10 days);

        PoolInfo memory beforeInfo = core.getPool(Pool.B);

        vm.prank(ops);
        core.pause();

        uint256 frozenAt = core.pausedAt();

        vm.warp(block.timestamp + 30 days);

        vm.prank(alice);
        core.unpause();

        PoolInfo memory afterInfo = core.getPool(Pool.B);

        assertEq(beforeInfo.rewardRate, afterInfo.rewardRate);
        assertEq(afterInfo.periodFinish, beforeInfo.periodFinish + 30 days);
        assertEq(afterInfo.lastUpdateTime, block.timestamp);
        assertEq(afterInfo.periodFinish - afterInfo.lastUpdateTime, beforeInfo.periodFinish - frozenAt);
    }

    function testUnpauseResetsAnchors() public {
        _fundAndSchedule(Pool.B, 86400e18, 40 days);

        vm.warp(block.timestamp + 10 days);

        vm.prank(ops);
        core.pause();

        vm.warp(block.timestamp + 30 days);

        vm.prank(alice);
        core.unpause();

        assertEq(core.pausedAt(), 0);
        assertEq(core.unpauseAt(), 0);
        assertEq(core.paused(), false);
    }

    function testUnpauseDoesNotAccruePausePeriod() public {
        _fundAndSchedule(Pool.B, 86400e18, 100 days);

        deal(address(tokenB), bob, 100e18);
        vm.prank(bob);
        tokenB.approve(address(core), 100e18);

        vm.prank(bob);
        core.stakeB(100e18);

        vm.prank(ops);
        core.pause();

        vm.warp(block.timestamp + 30 days);

        vm.prank(alice);
        core.unpause();

        vm.warp(block.timestamp + 10 days);

        deal(address(tokenB), bob, 1);
        vm.prank(bob);
        tokenB.approve(address(core), 1);
        vm.prank(bob);
        core.stakeB(1);

        (, uint256 rewards,) = core.userInfoB(bob);

        assertEq(rewards, 8.64e21);
    }

    function testUnpauseShiftsBothPoolsIndependently() public {
        uint256 t0 = block.timestamp;
        _fundAndSchedule(Pool.A, 864 * 3e18, 30 days);
        _fundAndSchedule(Pool.B, 864 * 6e18, 60 days);

        vm.warp(block.timestamp + 20 days);

        vm.prank(ops);
        core.pause();

        vm.warp(block.timestamp + 30 days);

        vm.prank(alice);
        core.unpause();

        PoolInfo memory poolAInfo = core.getPool(Pool.A);
        PoolInfo memory poolBInfo = core.getPool(Pool.B);

        assertEq(poolAInfo.periodFinish, t0 + 60 days);
        assertEq(poolBInfo.periodFinish, t0 + 90 days);
    }

    function testUnpauseEndedWindowDoesNotShift() public {
        _fundAndSchedule(Pool.A, 864 * 3e18, 30 days);

        vm.warp(block.timestamp + 35 days);

        vm.prank(ops);
        core.pause();

        vm.warp(block.timestamp + 10 days);

        vm.prank(alice);
        core.unpause();

        PoolInfo memory poolInfo = core.getPool(Pool.A);
        assertEq(poolInfo.periodFinish, poolInfo.lastUpdateTime);
    }

    function testUnpauseNeverScheduledDoesNotShift() public {
        _fundAndSchedule(Pool.B, 864 * 3e18, 30 days);

        vm.warp(block.timestamp + 10 days);

        vm.prank(ops);
        core.pause();

        vm.warp(block.timestamp + 20 days);

        vm.prank(alice);
        core.unpause();

        PoolInfo memory poolInfo = core.getPool(Pool.A);
        assertEq(poolInfo.periodFinish, 0);
    }

    function testUnpauseRevertsWhenNotPaused() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.WrongState.selector);
        core.unpause();
    }

    function testUnpauseRevertsInEmergency() public {
        vm.prank(ops);
        core.enableEmergencyMode();

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.WrongState.selector);
        core.unpause();
    }

    function testUnpauseRevertsInShutdown() public {
        _forceShutdown();

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.WrongState.selector);
        core.unpause();
    }

    function testUnpauseRevertsBeforeCooldown() public {
        vm.prank(ops);
        core.pause();

        vm.warp(core.pausedAt() + 24 hours - 1);

        bytes memory err = abi.encodeWithSelector(DualPoolRewardEngine.UnpauseCooldownActive.selector, core.unpauseAt());

        vm.prank(alice);
        vm.expectRevert(err);
        core.unpause();
    }

    function testUnpauseRevertsForNonAdmin() public {
        vm.prank(bob);
        vm.expectRevert();
        core.unpause();
    }

    function testUnpauseRevertsWhenPausedAtZero() public {
        vm.prank(ops);
        core.pause();

        stdstore.target(address(core)).sig("pausedAt()").checked_write(uint256(0));

        vm.warp(core.unpauseAt());

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.WrongState.selector);
        core.unpause();
    }

    function testUnpauseRevertsOnLargeCatchUpGap() public {
        uint256 t0 = block.timestamp;

        vm.store(address(core), bytes32(uint256(25)), bytes32(uint256(100e18)));
        vm.store(address(core), bytes32(uint256(27)), bytes32(uint256(t0)));
        vm.store(address(core), bytes32(uint256(30)), bytes32(uint256(t0 + 2000 days)));

        PoolInfo memory p = core.getPool(Pool.B);
        assertEq(p.totalStaked, 100e18);
        assertEq(p.lastUpdateTime, t0);
        assertEq(p.periodFinish, t0 + 2000 days);

        vm.warp(t0 + 1520 days);
        vm.prank(ops);
        core.pause();

        vm.warp(t0 + 1530 days);

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.CatchUpIncomplete.selector);
        core.unpause();
    }

    function testUnpauseAfterCrankSucceeds() public {
        uint256 t0 = block.timestamp;

        vm.store(address(core), bytes32(uint256(25)), bytes32(uint256(100e18)));
        vm.store(address(core), bytes32(uint256(27)), bytes32(uint256(t0)));
        vm.store(address(core), bytes32(uint256(30)), bytes32(uint256(t0 + 2000 days)));

        PoolInfo memory p = core.getPool(Pool.B);
        assertEq(p.totalStaked, 100e18);
        assertEq(p.lastUpdateTime, t0);
        assertEq(p.periodFinish, t0 + 2000 days);

        vm.warp(t0 + 1520 days);
        vm.prank(ops);
        core.pause();

        vm.warp(t0 + 1530 days);

        core.crankCatchUpPool(Pool.B);

        vm.prank(alice);
        core.unpause();

        PoolInfo memory poolInfo = core.getPool(Pool.B);
        assertEq(poolInfo.lastUpdateTime, block.timestamp);
        assertFalse(core.paused());
        assertEq(poolInfo.periodFinish, t0 + 2010 days);
    }

    function testUnpauseEmitsUnpaused() public {
        _fundAndSchedule(Pool.B, 864 * 3e18, 30 days);

        vm.prank(ops);
        core.pause();

        vm.warp(block.timestamp + 10 days);

        vm.prank(alice);
        vm.expectEmit(false, false, false, true, address(core));
        emit Pausable.Unpaused(alice);
        core.unpause();
    }

    function testUnpauseEmitsUnpausedAt() public {
        _fundAndSchedule(Pool.B, 864 * 3e18, 30 days);

        vm.prank(ops);
        core.pause();

        vm.warp(block.timestamp + 10 days);

        uint256 frozenAt = core.pausedAt();

        vm.prank(alice);
        vm.expectEmit(true, false, false, true, address(core));
        emit DualPoolRewardEngine.UnpausedAt(alice, frozenAt, 10 days, block.timestamp);
        core.unpause();
    }

    function testUnpausePreservesEmissionSchedule() public {
        _fundAndSchedule(Pool.B, 6000e18, 60 days);

        deal(address(tokenB), bob, 100e18);
        vm.prank(bob);
        tokenB.approve(address(core), 100e18);

        vm.prank(bob);
        core.stakeB(100e18);

        PoolInfo memory beforePause = core.getPool(Pool.B);

        vm.warp(block.timestamp + 20 days);

        vm.prank(ops);
        core.pause();

        vm.warp(block.timestamp + 30 days);

        vm.prank(alice);
        core.unpause();

        PoolInfo memory afterUnpause = core.getPool(Pool.B);
        assertEq(afterUnpause.periodFinish, beforePause.periodFinish + 30 days);
        assertEq(afterUnpause.lastUpdateTime, block.timestamp);
        assertEq(afterUnpause.rewardRate, beforePause.rewardRate);

        vm.warp(block.timestamp + 40 days);

        vm.prank(bob);
        core.claimB();

        PoolInfo memory poolInfo = core.getPool(Pool.B);
        (, uint256 rewards,) = core.userInfoB(bob);

        assertEq(poolInfo.totalPending, 0);
        assertEq(poolInfo.bookedUserRewards, 0);
        assertEq(rewards, 0);
    }
}
