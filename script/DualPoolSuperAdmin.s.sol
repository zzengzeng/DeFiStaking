// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {DualPoolSuperAdmin} from "../src/DualPoolSuperAdmin.sol";

contract DeployDualPoolSuperAdmin is Script {
    function run() external {
        address initialOwner = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

        vm.startBroadcast();

        DualPoolSuperAdmin superAdmin = new DualPoolSuperAdmin(initialOwner);

        vm.stopBroadcast();

        console.log(
            "DualPoolSuperAdmin deployed at:",
            address(superAdmin)
        );
    }
}
