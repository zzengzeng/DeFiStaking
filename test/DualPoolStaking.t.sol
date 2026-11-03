// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BaseTest} from "./BaseTest.sol";
import {DualPoolStaking} from "../src/core/DualPoolStaking.sol";
import {Pool} from "../src/StakeTypes.sol";

contract TestDualPoolStaking is BaseTest {
    function testSmoke() public view {
        assertTrue(core.hasRole(core.DEFAULT_ADMIN_ROLE(), deployer));
        assertEq(core.owner(), deployer);
        assertEq(address(core.getPool(Pool.A).stakingToken), address(tokenA));
    }
}

