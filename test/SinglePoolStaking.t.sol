// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {SinglePoolStaking} from "../src/SinglePoolStaking.sol";

contract SinglePoolStakingTest is Test {
    MockERC20 stakingToken;
    MockERC20 rewardToken;

    SinglePoolStaking singlePoolStaking;

    address user = address(1);

    function setUp() public {
        stakingToken = new MockERC20("Staking Token", "STK");
        rewardToken = new MockERC20("Reward Token", "RWD");

        singlePoolStaking = new SinglePoolStaking(address(stakingToken), address(rewardToken));

        stakingToken.mint(user, 1000 * 1e18);
        rewardToken.mint(address(this), 1000 * 1e18);

        rewardToken.approve(address(singlePoolStaking), 1000 ether);
        singlePoolStaking.notifyRewardAmount(1000 ether, 1000);
    }

    function testStake() public {
        vm.startPrank(user);

        stakingToken.approve(address(singlePoolStaking), 100 * 1e18);
        singlePoolStaking.stake(100 * 1e18);

        uint256 stakedAmount = singlePoolStaking.userStaked(user);
        assertEq(stakedAmount, 100 * 1e18);

        vm.stopPrank();
    }

    function testMultipleStakes() public {
        address user1 = address(1);
        address user2 = address(2);

        stakingToken.mint(user1, 100 * 1e18);
        stakingToken.mint(user2, 200 * 1e18);

        vm.startPrank(user1);
        stakingToken.approve(address(singlePoolStaking), 100 * 1e18);
        singlePoolStaking.stake(100 * 1e18);
        vm.stopPrank();

        vm.startPrank(user2);
        stakingToken.approve(address(singlePoolStaking), 200 * 1e18);
        singlePoolStaking.stake(200 * 1e18);
        vm.stopPrank();

        uint256 user1Staked = singlePoolStaking.userStaked(user1);
        uint256 user2Staked = singlePoolStaking.userStaked(user2);
        assertEq(user1Staked, 100 * 1e18);
        assertEq(user2Staked, 200 * 1e18);

        uint256 totalStaked = singlePoolStaking.totalStaked();
        assertEq(totalStaked, 300 * 1e18);
    }

    function testWithdraw() public {
        vm.startPrank(user);

        stakingToken.approve(address(singlePoolStaking), 100 * 1e18);
        singlePoolStaking.stake(100 * 1e18);

        singlePoolStaking.withdraw(50 * 1e18);

        uint256 stakedAmount = singlePoolStaking.userStaked(user);
        assertEq(stakedAmount, 50 * 1e18);

        vm.stopPrank();
    }

    function testClaim() public {
        vm.startPrank(user);

        stakingToken.approve(address(singlePoolStaking), 100 * 1e18);
        singlePoolStaking.stake(100 * 1e18);

        // Simulate time passing
        vm.warp(block.timestamp + 100);

        singlePoolStaking.claim();

        uint256 rewardBalance = rewardToken.balanceOf(user);
        assertEq(rewardBalance, 100 * 1e18);

        vm.stopPrank();
    }
}
