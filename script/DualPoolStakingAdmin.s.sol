// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {DualPoolStakingAdmin} from "../src/DualPoolStakingAdmin.sol";

contract DualPoolStakingAdminScript is Script {
    error ZeroAddress();
    error HasNoCode();

    function run() external {
        address superAdminAddr = vm.envAddress("SUPER_ADMIN_ADDRESS");
        if (superAdminAddr == address(0)) revert ZeroAddress();
        if (superAdminAddr.code.length == 0) revert HasNoCode();

        vm.startBroadcast();
        DualPoolStakingAdmin admin = new DualPoolStakingAdmin(superAdminAddr);
        vm.stopBroadcast();

        console.log("DualPoolStakingAdmin deployed at:", address(admin));
        console.log("  broadcaster:", msg.sender);
        console.logBytes32(admin.ADMIN_ROLE());
    }
}
