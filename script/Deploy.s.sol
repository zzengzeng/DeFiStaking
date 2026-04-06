// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {SinglePoolStaking} from "../src/SinglePoolStaking.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast();

        MockERC20 tokenA = new MockERC20("TokenA", "TKA");
        MockERC20 tokenB = new MockERC20("TokenB", "TKB");

        SinglePoolStaking staking = new SinglePoolStaking(address(tokenA), address(tokenB));

        console.log("TokenA deployed at:", address(tokenA));
        console.log("TokenB deployed at:", address(tokenB));
        console.log("SinglePoolStaking deployed at:", address(staking));

        vm.stopBroadcast();
    }
}
