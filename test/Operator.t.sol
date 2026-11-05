// SPDX-License-Idetifier: MIT
pragma solidity ^0.8.20;
import {BaseTest} from "./BaseTest.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {DualPoolStaking} from "../src/core/DualPoolStaking.sol";
import {Pool} from "../src/StakeTypes.sol";
import {MockFOTERC20} from "./mocks/MockFOTERC20.sol";
import {MockMintOnTransferERC20} from "./mocks/MockMintOnTransferERC20.sol";
import {MockSenderFeeERC20} from "./mocks/MockSenderFeeERC20.sol";

contract TestOperator is BaseTest {
    function testPauseByOperator() public {
        vm.prank(ops);
        vm.expectEmit(false, false, false, true, address(core));
        emit Pausable.Paused(ops);

        core.pause();
        assertEq(core.paused(), true);
        assertEq(core.pausedAt(), block.timestamp);
        assertEq(core.unpauseAt(), block.timestamp + core.UNPAUSE_COOLDOWN());
    }

    function testPauseRevertNonOperator() public {
        vm.prank(bob);
        vm.expectRevert();
        core.pause();
    }

    function testPauseRevertAlreadyPaused() public {
        vm.startPrank(ops);
        core.pause();
        vm.expectRevert(DualPoolStaking.ContractPaused.selector);
        core.pause();
        vm.stopPrank();
    }

    function testPauseRevertEmergencyMode() public {
        vm.startPrank(ops);
        core.enableEmergencyMode();
        vm.expectRevert(DualPoolStaking.WrongState.selector);
        core.pause();
        vm.stopPrank();
    }

    function testEnableEmergencyModeFromNormal() public {
        vm.prank(ops);
        core.enableEmergencyMode();
        assertEq(core.paused(), true);
        assertEq(core.terminalRewardTime(), block.timestamp);
    }

    function testEnableEmergencyModeFromPaused() public {
        vm.startPrank(ops);
        core.pause();
        vm.warp(block.timestamp + 1 hours);
        core.enableEmergencyMode();
        assertEq(core.terminalRewardTime(), core.pausedAt());
        assertFalse(core.terminalRewardTime() == block.timestamp);
        vm.stopPrank();
    }

    function testEnableEmergencyModeRevertNonOperator() public {
        vm.prank(bob);
        vm.expectRevert();
        core.enableEmergencyMode();
    }

    function testEnableEmergencyModeRevertAlreadyEmergency() public {
        vm.startPrank(ops);
        core.enableEmergencyMode();
        vm.expectRevert(DualPoolStaking.AlreadyEmergencyMode.selector);
        core.enableEmergencyMode();
        vm.stopPrank();
    }

    function testEnableEmergencyModeSetsPausedAt() public {
        vm.prank(ops);
        core.enableEmergencyMode();
        assertEq(core.terminalRewardTime(), core.pausedAt());
    }

    function _expectRewardFunded(Pool pool, address payer, uint256 amount, uint256 received) internal {
        vm.expectEmit(true, false, false, true, address(core));
        emit DualPoolStaking.RewardsFunded(pool, payer, amount, received, block.timestamp);
    }

    function testFundRewardsPoolA() public {
        uint256 amount = 100e18;
        vm.startPrank(ops);
        deal(address(tokenB), ops, amount);
        tokenB.approve(address(core), amount);
        _expectRewardFunded(Pool.A, ops, amount, amount);
        core.fundRewards(Pool.A, amount);
        assertEq(core.getPool(Pool.A).availableRewards, amount);
        assertEq(tokenB.balanceOf(address(core)), amount);
        assertEq(tokenB.balanceOf(ops), 0);
        vm.stopPrank();
    }

    function testFundRewardsPoolB() public {
        uint256 amount = 100e18;
        vm.startPrank(ops);
        deal(address(tokenB), ops, amount);
        tokenB.approve(address(core), amount);
        _expectRewardFunded(Pool.B, ops, amount, amount);
        core.fundRewards(Pool.B, amount);
        assertEq(core.getPool(Pool.B).availableRewards, amount);
        assertEq(tokenB.balanceOf(address(core)), amount);
        assertEq(tokenB.balanceOf(ops), 0);
        vm.stopPrank();
    }

    function testFundRewardsRevertNonOperator() public {
        uint256 amount = 100e18;
        vm.prank(bob);
        vm.expectRevert();
        core.fundRewards(Pool.B, amount);

        vm.prank(alice);
        vm.expectRevert();
        core.fundRewards(Pool.B, amount);
    }

    function testFundRewardsRevertZeroAmount() public {
        vm.prank(ops);
        vm.expectRevert(DualPoolStaking.ZeroAmount.selector);
        core.fundRewards(Pool.B, 0);
    }

    function testFundRewardsRevertPaused() public {
        vm.startPrank(ops);
        core.pause();
        vm.expectRevert(DualPoolStaking.WrongState.selector);
        core.fundRewards(Pool.B, 100e18);
        vm.stopPrank();
    }

    function testFundRewardsRevertEmergency() public {
        vm.startPrank(ops);
        core.enableEmergencyMode();
        vm.expectRevert(DualPoolStaking.WrongState.selector);
        core.fundRewards(Pool.B, 100e18);
        vm.stopPrank();
    }

    function testFundRewardsFOTWithinCap() public {
        uint256 feeBP = 500;
        (DualPoolStaking fotCore, MockFOTERC20 fotToken) = _deployFOTCore(feeBP);
        uint256 amount = 100e18;
        fotToken.mint(ops, amount);
        vm.startPrank(ops);
        fotToken.approve(address(fotCore), amount);
        uint256 expectReceived = amount * (BASIS_POINTS - feeBP) / BASIS_POINTS;
        vm.expectEmit(true, false, false, true, address(fotCore));
        emit DualPoolStaking.RewardsFunded(Pool.A, ops, amount, expectReceived, block.timestamp);
        fotCore.fundRewards(Pool.A, amount);
        assertEq(fotCore.getPool(Pool.A).availableRewards, expectReceived);
        assertEq(fotToken.balanceOf(address(fotCore)), expectReceived);
        assertEq(fotToken.balanceOf(ops), 0);
        vm.stopPrank();
    }

    function testFundRewardsFOTAtCap() public {
        uint256 feeBP = 1000;
        (DualPoolStaking fotCore, MockFOTERC20 fotToken) = _deployFOTCore(feeBP);
        uint256 amount = 100e18;
        fotToken.mint(ops, amount);
        vm.startPrank(ops);
        fotToken.approve(address(fotCore), amount);
        uint256 expectReceived = amount * (BASIS_POINTS - feeBP) / BASIS_POINTS;
        vm.expectEmit(true, false, false, true, address(fotCore));
        emit DualPoolStaking.RewardsFunded(Pool.A, ops, amount, expectReceived, block.timestamp);
        fotCore.fundRewards(Pool.A, amount);
        assertEq(fotCore.getPool(Pool.A).availableRewards, expectReceived);
        assertEq(fotToken.balanceOf(address(fotCore)), expectReceived);
        assertEq(fotToken.balanceOf(ops), 0);
        vm.stopPrank();
    }

    function testFundRewardsFOTExceedsCap() public {
        uint256 feeBP = 1500;
        (DualPoolStaking fotCore, MockFOTERC20 fotToken) = _deployFOTCore(feeBP);
        uint256 amount = 100e18;
        fotToken.mint(ops, amount);
        vm.startPrank(ops);
        fotToken.approve(address(fotCore), amount);
        vm.expectRevert(DualPoolStaking.FeeExceedsCap.selector);
        fotCore.fundRewards(Pool.A, amount);
        vm.stopPrank();
    }

    function _forceShutdown() internal {
        // slot 46: emergencyMode (byte 0), shutdownMode (byte 1)
        vm.store(address(core), bytes32(uint256(46)), bytes32(uint256(0x0101)));
        assertTrue(core.emergencyMode());
        assertTrue(core.shutdownMode());
    }

    function testPauseRevertShutdownMode() public {
        vm.startPrank(ops);
        _forceShutdown();
        vm.expectRevert(DualPoolStaking.WrongState.selector);
        core.pause();
        vm.stopPrank();
    }

    function testEnableEmergencyModeRevertShutdownMode() public {
        vm.startPrank(ops);
        _forceShutdown();
        vm.expectRevert(DualPoolStaking.AlreadyEmergencyMode.selector);
        core.enableEmergencyMode();
        vm.stopPrank();
    }

    function testFundRewardsRevertShutdownMode() public {
        vm.startPrank(ops);
        _forceShutdown();
        vm.expectRevert(DualPoolStaking.WrongState.selector);
        core.fundRewards(Pool.A, 100);
        vm.stopPrank();
    }

    function testFundRewardsRevertReceivedExceedsAmount() public {
        uint256 mintExtraBP = 1000;
        (DualPoolStaking fotCore, MockMintOnTransferERC20 fotToken) = _deployMintOnTransferCore(mintExtraBP);
        uint256 amount = 100e18;
        fotToken.mint(ops, amount);
        vm.startPrank(ops);
        fotToken.approve(address(fotCore), amount);
        vm.expectRevert(DualPoolStaking.ReceivedExceedsAmount.selector);
        fotCore.fundRewards(Pool.A, amount);
        vm.stopPrank();
    }

    function testRewardRevertPayerDeductionMismatch() public {
        uint256 feeBP = 1000;
        (DualPoolStaking fotCore, MockSenderFeeERC20 fotToken) = _deploySenderFeeERC20(feeBP);
        uint256 amount = 100e18;
        uint256 fee = amount * feeBP / BASIS_POINTS;
        fotToken.mint(ops, amount + fee);
        vm.startPrank(ops);
        fotToken.approve(address(fotCore), amount);
        vm.expectRevert(DualPoolStaking.PayerDeductionMismatch.selector);
        fotCore.fundRewards(Pool.A, amount);
        vm.stopPrank();
    }
}
