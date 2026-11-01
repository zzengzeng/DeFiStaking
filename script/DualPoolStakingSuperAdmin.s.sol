// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {DualPoolStakingSuperAdmin} from "../src/DualPoolStakingSuperAdmin.sol";

contract DeployDualPoolSuperAdmin is Script {
    function run() external {
        address initialOwner = _readAddrOrSender("SUPER_ADMIN_INITIAL_OWNER");

        vm.startBroadcast();

        DualPoolStakingSuperAdmin superAdmin = new DualPoolStakingSuperAdmin(initialOwner);

        vm.stopBroadcast();

        console.log("DualPoolStakingSuperAdmin deployed at:", address(superAdmin));
    }

    function _readAddrOrSender(string memory envKey) internal view returns (address) {
        address v = vm.envOr(envKey, address(0));
        if (v != address(0)) return v;
        address a = vm.envOr("DEPLOYER_ADDRESS", address(0));
        if (a != address(0)) return a;
        return msg.sender;
    }
}
