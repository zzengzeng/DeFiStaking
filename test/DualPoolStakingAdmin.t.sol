// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {DualPoolStakingAdmin} from "../src/DualPoolStakingAdmin.sol";
import {DualPoolStakingSuperAdmin} from "../src/DualPoolStakingSuperAdmin.sol";
import {Pool} from "../src/StakeTypes.sol";

contract DualPoolStakingAdminTest is Test {
    DualPoolStakingSuperAdmin internal superAdmin;
    DualPoolStakingAdmin internal admin;

    address internal deployer = makeAddr("deployer");
    address internal initialOwner = makeAddr("initialOwner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal lucy = makeAddr("lucy");

    function setUp() public {
        vm.startPrank(deployer);
        superAdmin = new DualPoolStakingSuperAdmin(deployer);
        superAdmin.setAdmin(alice, true);
        admin = new DualPoolStakingAdmin(address(superAdmin));
        vm.stopPrank();
    }

    function testSetLockDurationByAdmin() public {
        vm.prank(alice);
        admin.setLockDuration(30 days);
        assertEq(admin.lockDuration(), 30 days);
    }

    function testSetLockDurationRevertWhenNotAdmin() public {
        vm.prank(bob);
        vm.expectRevert(DualPoolStakingAdmin.NotAdmin.selector);
        admin.setLockDuration(30 days);
    }

    function testSetLockDurationRevertWhenZero() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStakingAdmin.InvalidLockDuration.selector);
        admin.setLockDuration(0);
    }

    function testSetLockDurationRevertWhenOverMax() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStakingAdmin.InvalidLockDuration.selector);
        admin.setLockDuration(90 days + 1);
    }

    function testSetLockDurationEmitsEvent() public {
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit DualPoolStakingAdmin.LockDurationUpdated(7 days, 40 days, block.timestamp);
        admin.setLockDuration(40 days);
    }

    function testSetFeeRecipientByAdmin() public {
        vm.prank(alice);
        admin.setFeeRecipient(bob);
        assertEq(admin.feeRecipient(), bob);
    }

    function testSetFeeRecipientRevertWhenNotAdmin() public {
        vm.prank(bob);
        vm.expectRevert(DualPoolStakingAdmin.NotAdmin.selector);
        admin.setFeeRecipient(lucy);
    }

    function testSetFeeRecipientRevertWhenZeroAddress() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStakingAdmin.ZeroAddress.selector);
        admin.setFeeRecipient(address(0));
    }

    function testSetFeeRecipientRevertWhenSelf() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStakingAdmin.InvalidFeeRecipient.selector);
        admin.setFeeRecipient(address(admin));
    }

    function testSetFeeRecipientEmitsEvent() public {
        address oldRecipient = admin.feeRecipient();
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit DualPoolStakingAdmin.FeeRecipientUpdated(oldRecipient, bob, block.timestamp);
        admin.setFeeRecipient(bob);
    }

    function testSetFeeRecipientReplacesOld() public {
        vm.startPrank(alice);
        admin.setFeeRecipient(bob);
        admin.setFeeRecipient(lucy);
        assertEq(admin.feeRecipient(), lucy);
        vm.stopPrank();
    }

    function testSetMaxTransferFeeBPByAdmin() public {
        vm.prank(alice);
        admin.setMaxTransferFeeBP(1500);
        assertEq(admin.maxTransferFeeBP(), 1500);
    }

    function testSetMaxTransferFeeBPRevertWhenNotAdmin() public {
        vm.prank(bob);
        vm.expectRevert(DualPoolStakingAdmin.NotAdmin.selector);
        admin.setMaxTransferFeeBP(1500);
    }

    function testSetMaxTransferFeeBPRevertWhenOverBasisPoints() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStakingAdmin.InvalidMaxTransferFeeBP.selector);
        admin.setMaxTransferFeeBP(10001);
    }

    function testSetMaxTransferFeeBPAtZero() public {
        vm.prank(alice);
        admin.setMaxTransferFeeBP(0);
        assertEq(admin.maxTransferFeeBP(), 0);
    }

    function testSetMaxTransferFeeBPAtMax() public {
        vm.prank(alice);
        admin.setMaxTransferFeeBP(10000);
        assertEq(admin.maxTransferFeeBP(), 10000);
    }

    function testSetMaxTransferFeeBPEmitEvent() public {
        uint256 oldMaxTransferFeeBP = admin.maxTransferFeeBP();
        vm.prank(alice);
        vm.expectEmit(false, false, false, true);
        emit DualPoolStakingAdmin.MaxTransferFeeBPUpdated(oldMaxTransferFeeBP, 500, block.timestamp);
        admin.setMaxTransferFeeBP(500);
    }

    function testSetMinClaimAmountByAdmin() public {
        vm.prank(alice);
        admin.setMinClaimAmount(1e15);
        assertEq(admin.minClaimAmount(), 1e15);
    }

    function testSetMinClaimAmountRevertWhenNotAdmin() public {
        vm.prank(bob);
        vm.expectRevert(DualPoolStakingAdmin.NotAdmin.selector);
        admin.setMinClaimAmount(1e15);
    }

    function testSetMinClaimAmountRevertWhenOverMax() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStakingAdmin.InvalidMinClaimAmount.selector);
        admin.setMinClaimAmount(1e17 + 1);
    }

    function testSetMinClaimAmountAtZero() public {
        vm.prank(alice);
        admin.setMinClaimAmount(0);
        assertEq(admin.minClaimAmount(), 0);
    }

    function testSetMinClaimAmountAtMax() public {
        vm.prank(alice);
        admin.setMinClaimAmount(1e17);
        assertEq(admin.minClaimAmount(), 1e17);
    }

    function testSetMinClaimAmountEmitEvent() public {
        uint256 old = admin.minClaimAmount();
        vm.prank(alice);
        vm.expectEmit(false, false, false, true);
        emit DualPoolStakingAdmin.MinClaimAmountUpdated(old, 1e13, block.timestamp);
        admin.setMinClaimAmount(1e13);
    }

    function testSetTVLCapByAdminPoolA() public {
        vm.prank(alice);
        admin.setTVLCap(Pool.A, 1000);
        assertEq(admin.maxTVLCap(Pool.A), 1000);
        assertEq(admin.maxTVLCap(Pool.B), 0);
    }

    function testSetTVLCapByAdminPoolB() public {
        vm.prank(alice);
        admin.setTVLCap(Pool.B, 2000);
        assertEq(admin.maxTVLCap(Pool.B), 2000);
        assertEq(admin.maxTVLCap(Pool.A), 0);
    }

    function testSetTVLCapRevertWhenNotAdmin() public {
        vm.prank(bob);
        vm.expectRevert(DualPoolStakingAdmin.NotAdmin.selector);
        admin.setTVLCap(Pool.A, 1000);
    }

    function testSetTVLCapZeroMeansUnlimited() public {
        vm.prank(alice);
        admin.setTVLCap(Pool.A, 0);
        assertEq(admin.maxTVLCap(Pool.A), 0);
    }

    function testSetTVLCapEmitsEvent() public {
        uint256 old = admin.maxTVLCap(Pool.A);
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit DualPoolStakingAdmin.TVLCapUpdated(Pool.A, old, 1000, block.timestamp);
        admin.setTVLCap(Pool.A, 1000);
    }

    function testSetMinStakeAmountByAdminPoolA() public {
        vm.prank(alice);
        admin.setMinStakeAmount(Pool.A, 100);
        assertEq(admin.minStakeAmount(Pool.A), 100);
        assertEq(admin.minStakeAmount(Pool.B), 0);
    }

    function testSetMinStakeAmountByAdminPoolB() public {
        vm.prank(alice);
        admin.setMinStakeAmount(Pool.B, 200);
        assertEq(admin.minStakeAmount(Pool.B), 200);
        assertEq(admin.minStakeAmount(Pool.A), 0);
    }

    function testSetMinStakeAmountRevertWhenNotAdmin() public {
        vm.prank(bob);
        vm.expectRevert(DualPoolStakingAdmin.NotAdmin.selector);
        admin.setMinStakeAmount(Pool.A, 100);
    }

    function testSetMinStakeAmountAtZero() public {
        vm.prank(alice);
        admin.setMinStakeAmount(Pool.A, 0);
        assertEq(admin.minStakeAmount(Pool.A), 0);
    }

    function testSetMinStakeAmountEmitsEvent() public {
        uint256 old = admin.minStakeAmount(Pool.A);
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit DualPoolStakingAdmin.MinStakeAmountUpdated(Pool.A, old, 200, block.timestamp);
        admin.setMinStakeAmount(Pool.A, 200);
    }

    function testSetRewardDurationByAdminPoolA() public {
        vm.prank(alice);
        admin.setRewardDuration(Pool.A, 10 days);
        assertEq(admin.rewardDuration(Pool.A), 10 days);
        assertEq(admin.rewardDuration(Pool.B), 0);
    }

    function testSetRewardDurationByAdminPoolB() public {
        vm.prank(alice);
        admin.setRewardDuration(Pool.B, 20 days);
        assertEq(admin.rewardDuration(Pool.B), 20 days);
        assertEq(admin.rewardDuration(Pool.A), 0);
    }

    function testSetRewardDurationZeroClearsDefault() public {
        vm.prank(alice);
        admin.setRewardDuration(Pool.B, 0);
        assertEq(admin.rewardDuration(Pool.B), 0);
    }

    function testSetRewardDurationAtMin() public {
        vm.prank(alice);
        admin.setRewardDuration(Pool.B, 1 days);
        assertEq(admin.rewardDuration(Pool.B), 1 days);
        assertEq(admin.rewardDuration(Pool.A), 0);
    }

    function testSetRewardDurationAtMax() public {
        vm.prank(alice);
        admin.setRewardDuration(Pool.B, 365 days);
        assertEq(admin.rewardDuration(Pool.B), 365 days);
        assertEq(admin.rewardDuration(Pool.A), 0);
    }

    function testSetRewardDurationRevertBelowMin() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStakingAdmin.InvalidRewardDuration.selector);
        admin.setRewardDuration(Pool.B, 1 days - 1);
    }

    function testSetRewardDurationRevertAboveMax() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStakingAdmin.InvalidRewardDuration.selector);
        admin.setRewardDuration(Pool.B, 365 days + 1);
    }

    function testSetRewardDurationRevertWhenNotAdmin() public {
        vm.prank(bob);
        vm.expectRevert(DualPoolStakingAdmin.NotAdmin.selector);
        admin.setRewardDuration(Pool.A, 2 days);
    }

    function testSetMinEarlyExitAmountBByAdmin() public {
        vm.prank(alice);
        admin.setMinEarlyExitAmountB(100);
        assertEq(admin.minEarlyExitAmountB(), 100);
    }

    function testSetMinEarlyExitAmountBRevertWhenNotAdmin() public {
        vm.prank(bob);
        vm.expectRevert(DualPoolStakingAdmin.NotAdmin.selector);
        admin.setMinEarlyExitAmountB(100);
    }

    function testSetMinEarlyExitAmountBAtExactMin() public {
        vm.startPrank(alice);
        admin.setMinEarlyExitAmountB(10);
        assertEq(admin.minEarlyExitAmountB(), 10);
        vm.stopPrank();
    }

    function testSetMinEarlyExitAmountBRevertBelowMin() public {
        vm.startPrank(alice);
        vm.expectRevert(DualPoolStakingAdmin.InvalidMinEarlyExitAmount.selector);
        admin.setMinEarlyExitAmountB(9);
        vm.stopPrank();
    }

    function testSetMinEarlyExitAmountBEmitsEvent() public {
        uint256 old = admin.minEarlyExitAmountB();
        vm.prank(alice);
        vm.expectEmit(false, false, false, true);
        emit DualPoolStakingAdmin.MinEarlyExitAmountBUpdated(old, 50, block.timestamp);
        admin.setMinEarlyExitAmountB(50);
    }

    function testSetFeesByAdmin() public {
        vm.prank(alice);
        admin.setFees(1100, 110, 60);
        assertEq(admin.penaltyFeeBP(), 1100);
        assertEq(admin.withdrawFeeBP(), 110);
        assertEq(admin.midTermFeeBP(), 60);
    }

    function testSetFeesRevertWhenNotAdmin() public {
        vm.prank(bob);
        vm.expectRevert(DualPoolStakingAdmin.NotAdmin.selector);
        admin.setFees(1100, 110, 60);
    }

    function testSetFeesRevertWhenPenaltyOverMax() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStakingAdmin.InvalidPenaltyFee.selector);
        admin.setFees(2100, 110, 60);
    }

    function testSetFeesRevertWhenWithdrawOverMax() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStakingAdmin.InvalidWithdrawFee.selector);
        admin.setFees(1100, 501, 60);
    }

    function testSetFeesRevertWhenMidTermOverMax() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStakingAdmin.InvalidMidTermFee.selector);
        admin.setFees(1100, 110, 501);
    }

    function testSetFeesEmitsEvent() public {
        vm.prank(alice);
        vm.expectEmit(false, false, false, true);
        emit DualPoolStakingAdmin.FeesUpdated(1200, 110, 20, block.timestamp);
        admin.setFees(1200, 110, 20);
    }

    function testSetFeesRevertWhenBreaksMinExit() public {
        vm.prank(alice);
        vm.expectRevert(DualPoolStakingAdmin.InvalidPenaltyFee.selector);
        admin.setFees(500, 110, 40);
    }

    function testSetFeesAllowsPenaltyIncrease() public {
        vm.prank(alice);
        admin.setFees(1900, 110, 40);
        assertEq(admin.penaltyFeeBP(), 1900);
    }

    function testSetFeesToZeroAllowed() public {
        vm.prank(alice);
        admin.setFees(0, 110, 40);
        assertEq(admin.penaltyFeeBP(), 0);
    }
}
