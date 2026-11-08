// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BaseTest} from "./BaseTest.sol";
import {DualPoolStaking} from "../src/core/DualPoolStaking.sol";
import {Pool, PoolInfo} from "../src/StakeTypes.sol";
import {DualPoolAdminModule} from "../src/core/DualPoolAdminModule.sol";

contract TestRewardSchedule is BaseTest {
    function testScheduleSucceeds() public {
        uint256 amount = 999e18;
        uint256 duration = 30 days;
        deal(address(tokenB), ops, amount);

        vm.prank(ops);
        tokenB.approve(address(core), amount);

        vm.prank(ops);
        core.fundRewards(Pool.A, amount);

        uint256 expectedRate = amount / duration;

        vm.prank(alice);
        vm.expectEmit(true, false, false, true, address(core));
        emit DualPoolAdminModule.RewardScheduled(
            Pool.A, duration, expectedRate, block.timestamp, block.timestamp + duration
        );
        core.scheduleRewards(Pool.A, duration);

        PoolInfo memory p = core.getPool(Pool.A);
        assertEq(p.rewardRate, expectedRate);
        assertEq(p.periodFinish, block.timestamp + duration);
        assertEq(p.lastUpdateTime, block.timestamp);
        assertEq(p.availableRewards, amount);
    }
}
