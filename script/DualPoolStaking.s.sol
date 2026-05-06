// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

import {MockERC20} from "../src/MockERC20.sol";
import {DualPoolStaking} from "../src/DualPoolStaking.sol";
import {DualPoolStakingAdmin} from "../src/DualPoolStakingAdmin.sol";
import {DualPoolUserModule} from "../src/modules/DualPoolUserModule.sol";
import {DualPoolAdminModule} from "../src/modules/DualPoolAdminModule.sol";

/// @title DeployDualPoolStaking
/// @notice Foundry broadcast script: deploys mock ERC20s, `DualPoolStaking`, delegate modules, admin facade, and a `TimelockController` wired as `DualPoolStakingAdmin` owner.
/// @dev For production, replace `proposers` / `executors` with multisigs; Timelock `admin` is `address(0)` (self-administered timelock). `OPERATOR_ROLE` remains on the broadcaster from the core constructor for hot-path ops.
/// @custom:security After `grantRole(ADMIN_ROLE, admin)` the script revokes `ADMIN_ROLE` from `deployer`; operator hot-path role intentionally remains on `deployer` until explicitly revoked elsewhere.
contract DeployDualPoolStaking is Script {
    /// @notice Executes the full deployment graph inside `vm.startBroadcast()` / `vm.stopBroadcast()`.
    /// @dev Deployment order: tokens → core → modules → wire `setUserModule` / `setAdminModule` → admin facade → timelock → transfer admin facade ownership to timelock → role handover on core.
    function run() external {
        vm.startBroadcast();

        address deployer = msg.sender;

        MockERC20 tokenA = new MockERC20("ZTokenA", "ZTKA");
        MockERC20 tokenB = new MockERC20("ZTokenB", "ZTKB");

        // TokenB max supply cap for reward-rate ceiling (PRD); align with your tokenomics / mint cap.
        uint256 maxTotalSupplyBForRewardRateCap = 10_000_000 * 1e18;
        DualPoolStaking dualPoolStaking =
            new DualPoolStaking(address(tokenA), address(tokenB), maxTotalSupplyBForRewardRateCap);
        DualPoolUserModule userModule = new DualPoolUserModule();
        DualPoolAdminModule adminModule = new DualPoolAdminModule();
        DualPoolStakingAdmin admin = new DualPoolStakingAdmin(address(dualPoolStaking));
        dualPoolStaking.setUserModule(address(userModule));
        dualPoolStaking.setAdminModule(address(adminModule));

        // Governance: TimelockController is the delay layer; admin facade holds ADMIN on core, owner = timelock.
        address[] memory proposers = new address[](1);
        proposers[0] = deployer;
        address[] memory executors = new address[](1);
        executors[0] = deployer;
        uint256 minDelay = 48 hours;
        TimelockController timelock = new TimelockController(minDelay, proposers, executors, address(0));

        dualPoolStaking.grantRole(dualPoolStaking.ADMIN_ROLE(), address(admin));
        dualPoolStaking.revokeRole(dualPoolStaking.ADMIN_ROLE(), deployer);
        // `OPERATOR_ROLE` remains on `deployer` from the core constructor (pause / notify / emergency).

        admin.transferOwnership(address(timelock));

        console.log("TokenA deployed at:", address(tokenA));
        console.log("TokenB deployed at:", address(tokenB));
        console.log("DualPoolStaking deployed at:", address(dualPoolStaking));
        console.log("DualPoolUserModule deployed at:", address(userModule));
        console.log("DualPoolAdminModule deployed at:", address(adminModule));
        console.log("DualPoolStakingAdmin deployed at:", address(admin));
        console.log("TimelockController deployed at:", address(timelock));
        console.log("Timelock minDelay (seconds):", minDelay);
        console.log("OPERATOR_ROLE holder (hot ops, 0h):", deployer);

        vm.stopBroadcast();
    }
}
