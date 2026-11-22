// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BaseTest} from "./BaseTest.sol";
import {Pool, PoolInfo} from "../src/StakeTypes.sol";
import {DualPoolRewardEngine} from "../src/core/DualPoolRewardEngine.sol";
import {EngineHarness} from "./EngineHarness.sol";
import {DualPoolStorageLayout} from "../src/core/DualPoolStorageLayout.sol";
import {MockFOTERC20} from "./mocks/MockFOTERC20.sol";
import {DualPoolStaking} from "../src/core/DualPoolStaking.sol";

contract TestClaimFees is BaseTest {
    function testClaimFeesTransfersToFeeRecipient() public {
        _accrueFees(100e18);

        vm.prank(alice);
        core.claimFees();

        assertEq(core.unclaimedFeesB(), 0);
        assertEq(tokenB.balanceOf(address(treasury)), 1e18);
    }

    function _accrueFees(uint256 stakeAmount) internal returns (uint256 fee) {
        vm.prank(alice);
        core.setFeeRecipient(treasury);

        _fundAndSchedule(Pool.B, 864e18, 86400);

        deal(address(tokenB), bob, stakeAmount);
        vm.startPrank(bob);
        tokenB.approve(address(core), stakeAmount);
        core.stakeB(stakeAmount);
        vm.stopPrank();

        vm.warp(block.timestamp + 8 days);

        fee = stakeAmount * core.withdrawFeeBP() / core.BASIS_POINTS();

        vm.prank(bob);
        core.withdrawB(stakeAmount);

        assertEq(core.unclaimedFeesB(), fee);
    }

    function testClaimFeesEmitsFeesClaimed() public {
        _accrueFees(100e18);

        vm.prank(alice);
        vm.expectEmit(true, true, false, false, address(core));
        emit DualPoolRewardEngine.FeesClaimed(alice, address(treasury), 1e18, block.timestamp);
        core.claimFees();
    }

    function testClaimFeesRevertsWhenNoFees() public {
        vm.prank(alice);
        core.setFeeRecipient(treasury);

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.NothingToClaim.selector);
        core.claimFees();
    }

    function _newHarness() internal returns (EngineHarness harness) {
        harness = new EngineHarness(address(tokenA), address(tokenB), CAP, 24 hours);
        harness.setAdminModule(address(adminModule));
    }

    function _seedDebt(EngineHarness harness, Pool pool) internal {
        harness.seedDebt(pool, 1);
        harness.seedPending(pool, 1);

        PoolInfo memory p = harness.getPool(pool);
        assertEq(p.badDebt, 1);
        assertEq(p.totalPending, 1);
    }

    function testClaimFeesRevertsWhenBadDebtAExists() public {
        EngineHarness harness = _newHarness();
        harness.setAdmin(alice, true);
        vm.prank(alice);
        harness.setFeeRecipient(treasury);

        _seedDebt(harness, Pool.A);

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.BadDebtExists.selector);
        harness.claimFees();
    }

    function testClaimFeesRevertsWhenBadDebtBExists() public {
        EngineHarness harness = _newHarness();
        harness.setAdmin(alice, true);
        vm.prank(alice);
        harness.setFeeRecipient(treasury);

        _seedDebt(harness, Pool.B);

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.BadDebtExists.selector);
        harness.claimFees();
    }

    function testClaimFeesRevertsWhenFeeRecipientNotSet() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStorageLayout.ZeroAddress.selector);
        core.claimFees();
    }

    function testClaimFeesWorksWhenPaused() public {
        _accrueFees(100e18);

        vm.prank(ops);
        core.pause();

        vm.prank(alice);
        core.claimFees();

        assertEq(core.unclaimedFeesB(), 0);
        assertEq(tokenB.balanceOf(address(treasury)), 1e18);
    }

    function testClaimFeesInPausedSettlesToPausedAt() public {
        vm.prank(alice);
        core.setFeeRecipient(treasury);

        uint256 fundAmount = 864e18;
        _fundAndSchedule(Pool.B, fundAmount, 30 days);

        uint256 stakeAmount = 100e18;
        deal(address(tokenB), bob, stakeAmount);
        vm.startPrank(bob);
        tokenB.approve(address(core), stakeAmount);
        core.stakeB(stakeAmount);
        vm.stopPrank();

        vm.warp(block.timestamp + 8 days);

        vm.prank(bob);
        core.withdrawB(stakeAmount);

        uint256 fee = core.unclaimedFeesB();
        assertGt(fee, 0);

        vm.prank(ops);
        core.pause();

        uint256 pausedAt = core.pausedAt();
        assertEq(core.getPool(Pool.B).lastUpdateTime, pausedAt);

        vm.warp(block.timestamp + 10 days);

        uint256 availBefore = core.getPool(Pool.B).availableRewards;

        vm.prank(alice);
        core.claimFees();

        PoolInfo memory poolInfo = core.getPool(Pool.B);
        assertEq(poolInfo.lastUpdateTime, pausedAt);
        assertLt(poolInfo.lastUpdateTime, block.timestamp);

        assertEq(poolInfo.availableRewards, availBefore);
        assertEq(tokenB.balanceOf(treasury), fee);
        assertEq(core.unclaimedFeesB(), 0);
    }

    function testClaimFeesRevertsInEmergency() public {
        _accrueFees(100e18);

        vm.prank(ops);
        core.enableEmergencyMode();

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.WrongState.selector);
        core.claimFees();
    }

    function testClaimFeesRevertsInShutdown() public {
        _accrueFees(100e18);

        vm.prank(ops);
        core.enableEmergencyMode();

        vm.prank(alice);
        core.activateShutdown();

        vm.prank(alice);
        vm.expectRevert(DualPoolRewardEngine.WrongState.selector);
        core.claimFees();
    }

    function testClaimFeesPreservesUserLedgers() public {
        _accrueFees(100e18);

        PoolInfo memory beforePoolInfoA = core.getPool(Pool.A);
        PoolInfo memory beforePoolInfoB = core.getPool(Pool.B);

        vm.prank(alice);
        core.claimFees();

        PoolInfo memory afterPoolInfoA = core.getPool(Pool.A);
        PoolInfo memory afterPoolInfoB = core.getPool(Pool.B);

        assertEq(beforePoolInfoA.totalPending, afterPoolInfoA.totalPending);
        assertEq(beforePoolInfoB.totalPending, afterPoolInfoB.totalPending);
        assertEq(beforePoolInfoA.availableRewards, afterPoolInfoA.availableRewards);
        assertEq(beforePoolInfoB.availableRewards, afterPoolInfoB.availableRewards);
        assertEq(beforePoolInfoB.totalStaked, afterPoolInfoB.totalStaked);
    }

    function testClaimFeesRevertsNonAdmin() public {
        _accrueFees(100e18);

        vm.prank(bob);
        vm.expectRevert();
        core.claimFees();
    }

    function testClaimFeesKeepsInvariantB() public {
        vm.prank(alice);
        core.setFeeRecipient(treasury);

        _fundAndSchedule(Pool.A, 100e18, 30 days);
        _fundAndSchedule(Pool.B, 864e18, 30 days);

        uint256 stakeAmount = 100e18;
        deal(address(tokenB), bob, stakeAmount);
        vm.startPrank(bob);
        tokenB.approve(address(core), stakeAmount);
        core.stakeB(stakeAmount);
        vm.stopPrank();

        vm.warp(block.timestamp + 8 days);
        vm.prank(bob);
        core.withdrawB(40e18);

        uint256 fee = core.unclaimedFeesB();
        assertGt(fee, 0);

        uint256 requiredBefore = _requiredB();
        uint256 actualBefore = _actualB();
        PoolInfo memory aBefore = core.getPool(Pool.A);
        PoolInfo memory bBefore = core.getPool(Pool.B);

        assertGe(actualBefore, requiredBefore);
        assertGt(bBefore.totalStaked, 0);
        assertGt(bBefore.totalPending, 0);
        assertGt(aBefore.availableRewards, 0);
        assertGt(bBefore.availableRewards, 0);

        vm.prank(alice);
        core.claimFees();

        uint256 requiredAfter = _requiredB();
        uint256 actualAfter = _actualB();

        assertEq(requiredAfter, requiredBefore - fee);
        assertEq(actualAfter, actualBefore - fee);
        assertGe(actualAfter, requiredAfter);

        PoolInfo memory aAfter = core.getPool(Pool.A);
        PoolInfo memory bAfter = core.getPool(Pool.B);

        assertEq(aAfter.totalStaked, aBefore.totalStaked);
        assertEq(aAfter.totalPending, aBefore.totalPending);
        assertEq(aAfter.availableRewards, aBefore.availableRewards);
        assertEq(aAfter.bookedUserRewards, aBefore.bookedUserRewards);

        assertEq(bAfter.totalStaked, bBefore.totalStaked);
        assertEq(bAfter.totalPending, bBefore.totalPending);
        assertEq(bAfter.availableRewards, bBefore.availableRewards);
        assertEq(bAfter.bookedUserRewards, bBefore.bookedUserRewards);

        assertEq(core.unclaimedFeesB(), 0);
    }

    function _requiredB() internal view returns (uint256) {
        PoolInfo memory poolInfoA = core.getPool(Pool.A);
        PoolInfo memory poolInfoB = core.getPool(Pool.B);
        return poolInfoB.totalStaked + poolInfoA.totalPending + poolInfoB.totalPending + poolInfoA.availableRewards
            + poolInfoB.availableRewards + core.unclaimedFeesB();
    }

    function _actualB() internal view returns (uint256) {
        return tokenB.balanceOf(address(core)) + core.getPool(Pool.A).badDebt + core.getPool(Pool.B).badDebt;
    }

    function testClaimFeesWithFOTTokenB() public {
        uint256 fotFeeBP = 500;
        uint256 grossAmount = 100e18;
        (DualPoolStaking fotCore, MockFOTERC20 fotToken) = _deployFOTBCore(fotFeeBP);

        vm.prank(alice);
        fotCore.setFeeRecipient(treasury);

        deal(address(fotToken), ops, 864e18);
        vm.prank(ops);
        fotToken.approve(address(fotCore), 864e18);

        vm.prank(ops);
        fotCore.fundRewards(Pool.B, 864e18);

        vm.prank(alice);
        fotCore.scheduleRewards(Pool.B, 86400);

        deal(address(fotToken), bob, grossAmount);
        vm.startPrank(bob);
        fotToken.approve(address(fotCore), grossAmount);
        fotCore.stakeB(grossAmount);
        vm.stopPrank();

        (uint256 staked,,) = fotCore.userInfoB(bob);
        assertEq(staked, grossAmount - grossAmount * fotFeeBP / 10000);

        vm.warp(block.timestamp + 8 days);

        uint256 expectedFee = staked * fotCore.withdrawFeeBP() / fotCore.BASIS_POINTS();

        vm.prank(bob);
        fotCore.withdrawB(staked);

        uint256 treasuryBefore = fotToken.balanceOf(treasury);

        vm.prank(alice);
        fotCore.claimFees();

        assertEq(fotCore.unclaimedFeesB(), 0);

        uint256 expectedToTreasury = expectedFee - expectedFee * fotFeeBP / 10000;
        assertEq(fotToken.balanceOf(treasury) - treasuryBefore, expectedToTreasury);
    }

    function testClaimFeesSettlesBothPools() public {
        vm.prank(alice);
        core.setFeeRecipient(treasury);

        _fundAndSchedule(Pool.A, 864e18, 30 days);
        _fundAndSchedule(Pool.B, 864e18, 30 days);

        deal(address(tokenA), alice, 100e18);
        vm.startPrank(alice);
        tokenA.approve(address(core), 100e18);
        core.stakeA(100e18);
        vm.stopPrank();

        deal(address(tokenB), bob, 100e18);
        vm.startPrank(bob);
        tokenB.approve(address(core), 100e18);
        core.stakeB(100e18);
        vm.stopPrank();

        vm.warp(block.timestamp + 8 days);
        vm.prank(bob);
        core.withdrawB(40e18);

        uint256 fee = core.unclaimedFeesB();
        assertGt(fee, 0);

        vm.warp(block.timestamp + 2 days);

        PoolInfo memory aBefore = core.getPool(Pool.A);
        PoolInfo memory bBefore = core.getPool(Pool.B);

        assertLt(aBefore.lastUpdateTime, block.timestamp);
        assertLt(bBefore.lastUpdateTime, block.timestamp);

        vm.prank(alice);
        core.claimFees();

        PoolInfo memory aAfter = core.getPool(Pool.A);
        PoolInfo memory bAfter = core.getPool(Pool.B);

        assertEq(aAfter.lastUpdateTime, block.timestamp);
        assertEq(bAfter.lastUpdateTime, block.timestamp);

        assertLt(aAfter.availableRewards, aBefore.availableRewards);
        assertGt(aAfter.totalPending, aBefore.totalPending);

        assertLt(bAfter.availableRewards, bBefore.availableRewards);
        assertGt(bAfter.totalPending, bBefore.totalPending);

        assertEq(core.unclaimedFeesB(), 0);
    }
}
