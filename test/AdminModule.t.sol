// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {BaseTest} from "./BaseTest.sol";
import {DualPoolStorageLayout} from "../src/core/DualPoolStorageLayout.sol";
import {Pool} from "../src/StakeTypes.sol";

contract TestAdminModule is BaseTest {
    function testSetLockDurationSucceeds() public {
        vm.prank(alice);
        vm.expectEmit(false, false, false, true);
        emit DualPoolStorageLayout.LockDurationUpdated(7 days, 10 days, block.timestamp);
        core.setLockDuration(10 days);
        assertEq(core.lockDuration(), 10 days);
    }

    function testSetLockDurationAtMax() public {
        vm.prank(alice);
        core.setLockDuration(90 days);
        assertEq(core.lockDuration(), 90 days);
    }

    function testSetLockDurationRevertsOnZero() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStorageLayout.InvalidLockDuration.selector);
        core.setLockDuration(0);
    }

    function testSetLockDurationRevertsAboveMax() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStorageLayout.InvalidLockDuration.selector);
        core.setLockDuration(90 days + 1);
    }

    function testSetFeeRecipientSucceeds() public {
        vm.prank(alice);
        core.setFeeRecipient(bob);
        assertEq(core.feeRecipient(), bob);
    }

    function testSetFeeRecipientRevertsOnZero() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStorageLayout.ZeroAddress.selector);
        core.setFeeRecipient(address(0));
    }

    function testSetFeeRecipientRevertsOnSelf() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStorageLayout.InvalidFeeRecipient.selector);
        core.setFeeRecipient(address(core));
    }

    function testSetMaxTransferFeeBPSucceeds() public {
        vm.prank(alice);
        vm.expectEmit(false, false, false, true);
        emit DualPoolStorageLayout.MaxTransferFeeBPUpdated(1000, 500, block.timestamp);
        core.setMaxTransferFeeBP(500);
    }

    function testSetMaxTransferFeeBPAtMax() public {
        vm.prank(alice);
        core.setMaxTransferFeeBP(10000);
        assertEq(core.maxTransferFeeBP(), 10000);
    }

    function testSetMaxTransferFeeBPRevertsAboveMax() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStorageLayout.InvalidMaxTransferFeeBP.selector);
        core.setMaxTransferFeeBP(10001);
    }

    function testSetMinClaimAmountSucceeds() public {
        vm.prank(alice);
        core.setMinClaimAmount(1e16);
        assertEq(core.minClaimAmount(), 1e16);
    }

    function testSetMinClaimAmountAtMax() public {
        vm.prank(alice);
        core.setMinClaimAmount(1e17);
        assertEq(core.minClaimAmount(), 1e17);
    }

    function testSetMinClaimAmountRevertsAboveMax() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStorageLayout.InvalidMinClaimAmount.selector);
        core.setMinClaimAmount(1e17 + 1);
    }

    function testSetMaxTVLCapPoolA() public {
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit DualPoolStorageLayout.MaxTVLCapUpdated(Pool.A, 0, 1e24, block.timestamp);
        core.setMaxTVLCap(Pool.A, 1e24);
        assertEq(core.getPool(Pool.A).maxTVLCap, 1e24);
    }

    function testSetMaxTVLCapPoolB() public {
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit DualPoolStorageLayout.MaxTVLCapUpdated(Pool.B, 0, 1e24, block.timestamp);
        core.setMaxTVLCap(Pool.B, 1e24);
        assertEq(core.getPool(Pool.B).maxTVLCap, 1e24);
    }

    function testSetMinStakeAmountPoolA() public {
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit DualPoolStorageLayout.MinStakeAmountUpdated(Pool.A, 0, 1e18, block.timestamp);
        core.setMinStakeAmount(Pool.A, 1e18);
    }

    function testSetMinStakeAmountPoolB() public {
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit DualPoolStorageLayout.MinStakeAmountUpdated(Pool.B, 0, 1e18, block.timestamp);
        core.setMinStakeAmount(Pool.B, 1e18);
    }

    function testSetRewardDurationSucceeds() public {
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit DualPoolStorageLayout.RewardDurationUpdated(Pool.A, 0, 30 days, block.timestamp);
        core.setRewardDuration(Pool.A, 30 days);
    }

    function testSetRewardDurationZeroAllowed() public {
        vm.startPrank(alice);
        core.setRewardDuration(Pool.A, 30 days);
        assertEq(core.getPool(Pool.A).rewardDuration, 30 days);
        core.setRewardDuration(Pool.A, 0);
        assertEq(core.getPool(Pool.A).rewardDuration, 0);
        vm.stopPrank();
    }

    function testSetRewardDurationRevertsBelowMin() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStorageLayout.InvalidRewardDuration.selector);
        core.setRewardDuration(Pool.A, 1 days - 1);
    }

    function testSetRewardDurationRevertsAboveMax() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStorageLayout.InvalidRewardDuration.selector);
        core.setRewardDuration(Pool.A, 365 days + 1);
    }

    function testSetFeesSucceeds() public {
        vm.prank(alice);
        vm.expectEmit(false, false, false, true);
        emit DualPoolStorageLayout.FeesUpdated(1500, 100, 50, block.timestamp);
        core.setFees(1500, 100, 50);
    }

    function testSetFeesAtBoundaries() public {
        vm.prank(alice);
        core.setFees(2000, 500, 500);
        assertEq(core.penaltyFeeBP(), 2000);
        assertEq(core.withdrawFeeBP(), 500);
        assertEq(core.midTermFeeBP(), 500);
    }

    function testSetFeesRevertsPenaltyTooHigh() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStorageLayout.InvalidPenaltyFee.selector);
        core.setFees(2001, 100, 100);
    }

    function testSetFeesRevertsWithdrawTooHigh() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStorageLayout.InvalidWithdrawFee.selector);
        core.setFees(2000, 501, 100);
    }

    function testSetFeesRevertsMidTermTooHigh() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStorageLayout.InvalidMidTermFee.selector);
        core.setFees(2000, 200, 501);
    }

    function testSetFeesRevertsCrossConstraint() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStorageLayout.InvalidPenaltyFee.selector);
        core.setFees(500, 200, 200);
    }

    function testSetMinEarlyExitAmountBSucceeds() public {
        vm.prank(alice);
        core.setMinEarlyExitAmountB(15);
        assertEq(core.minEarlyExitAmountB(), 15);
    }

    function testSetMinEarlyExitAmountBAtBoundary() public {
        vm.prank(alice);
        core.setMinEarlyExitAmountB(10);
        assertEq(core.minEarlyExitAmountB(), 10);
    }

    function testSetMinEarlyExitAmountBRevertsBelowMin() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStorageLayout.InvalidMinEarlyExitAmount.selector);
        core.setMinEarlyExitAmountB(9);
    }

    function testSetMinEarlyExitAmountBAfterPenaltyZeroed() public {
        vm.startPrank(alice);
        core.setFees(0, 100, 50);
        core.setMinEarlyExitAmountB(0);
        assertEq(core.minEarlyExitAmountB(), 0);
    }
}
