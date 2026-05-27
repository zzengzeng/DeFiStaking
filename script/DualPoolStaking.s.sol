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
/// @notice Foundry broadcast script: deploys or reuses ERC20s, `DualPoolStaking`, delegate modules, admin facade, and dual `TimelockController`s (48h governance + 72h super).
/// @dev Set env `TOKEN_A` / `TOKEN_B` to reuse existing Sepolia mocks; omit both to deploy fresh `MockERC20`s.
///      For production, replace `proposers` / `executors` with multisigs. `OPERATOR_ROLE` remains on the broadcaster from the core constructor for hot-path ops.
/// @custom:security After wiring, `ADMIN_ROLE` and `DEFAULT_ADMIN_ROLE` on the core are held by `DualPoolStakingAdmin`; both are revoked from `deployer`. Module swaps and role changes require the 72h timelock; parameter changes use the 48h timelock.
contract DeployDualPoolStaking is Script {
    uint256 internal constant GOVERNANCE_MIN_DELAY = 48 hours;
    uint256 internal constant SUPER_MIN_DELAY = 72 hours;

    struct Deployment {
        address tokenA;
        address tokenB;
        DualPoolStaking core;
        DualPoolUserModule userModule;
        DualPoolAdminModule adminModule;
        DualPoolStakingAdmin admin;
        TimelockController timelockGovernance;
        TimelockController timelockSuper;
    }

    /// @notice Resolves pool token address from env, or deploys a new `MockERC20`.
    /// @dev Reusing `TOKEN_A` / `TOKEN_B` keeps the **on-chain** `name` / `symbol` from the first deploy (e.g. ZTKA).
    ///      For ZZTKA / ZZTKB, omit both env vars (or `make deploy-fresh-tokens`) so new mocks are created.
    function _resolveToken(string memory envKey, string memory name, string memory symbol) internal returns (address) {
        try vm.envAddress(envKey) returns (address existing) {
            require(existing != address(0), "token env is zero");
            MockERC20 token = MockERC20(existing);
            console.log(string.concat(envKey, " reused:"), existing);
            console.log(string.concat(envKey, " on-chain name:"), token.name());
            console.log(string.concat(envKey, " on-chain symbol:"), token.symbol());
            if (keccak256(bytes(token.symbol())) != keccak256(bytes(symbol))) {
                console.log(string.concat("WARN: ", envKey, " symbol is not "), symbol);
                console.log("      unset TOKEN_A/TOKEN_B in .env to deploy fresh mocks with ZZTKA/ZZTKB");
            }
            return existing;
        } catch {
            address token = address(new MockERC20(name, symbol));
            console.log(string.concat(envKey, " deployed:"), token);
            console.log(string.concat(envKey, " name:"), name);
            console.log(string.concat(envKey, " symbol:"), symbol);
            return token;
        }
    }

    function _wireAdminRoles(DualPoolStaking core, address adminFacade, address deployer) internal {
        core.grantRole(core.ADMIN_ROLE(), adminFacade);
        core.revokeRole(core.ADMIN_ROLE(), deployer);
        core.grantRole(core.DEFAULT_ADMIN_ROLE(), adminFacade);
        core.revokeRole(core.DEFAULT_ADMIN_ROLE(), deployer);
    }

    function _deployAll(address deployer) internal returns (Deployment memory d) {
        d.tokenA = _resolveToken("TOKEN_A", "ZZTokenA", "ZZTKA");
        d.tokenB = _resolveToken("TOKEN_B", "ZZTokenB", "ZZTKB");
        require(d.tokenA != d.tokenB, "TOKEN_A == TOKEN_B");

        d.core = new DualPoolStaking(d.tokenA, d.tokenB, 10_000_000 * 1e18);
        d.userModule = new DualPoolUserModule();
        d.adminModule = new DualPoolAdminModule();

        address[] memory proposers = new address[](1);
        proposers[0] = deployer;
        address[] memory executors = new address[](1);
        executors[0] = deployer;

        d.timelockGovernance = new TimelockController(GOVERNANCE_MIN_DELAY, proposers, executors, address(0));
        d.timelockSuper = new TimelockController(SUPER_MIN_DELAY, proposers, executors, address(0));
        d.admin = new DualPoolStakingAdmin(address(d.core), address(d.timelockGovernance), address(d.timelockSuper));

        d.core.setUserModule(address(d.userModule));
        d.core.setAdminModule(address(d.adminModule));
        _wireAdminRoles(d.core, address(d.admin), deployer);
    }

    function _logDeployment(Deployment memory d, address deployer) internal pure {
        console.log("DualPoolStaking deployed at:", address(d.core));
        console.log("DualPoolUserModule deployed at:", address(d.userModule));
        console.log("DualPoolAdminModule deployed at:", address(d.adminModule));
        console.log("DualPoolStakingAdmin deployed at:", address(d.admin));
        console.log("TimelockController (governance 48h) at:", address(d.timelockGovernance));
        console.log("TimelockController (super 72h) at:", address(d.timelockSuper));
        console.log("Governance minDelay (seconds):", GOVERNANCE_MIN_DELAY);
        console.log("Super minDelay (seconds):", SUPER_MIN_DELAY);
        console.log("OPERATOR_ROLE holder (hot ops, 0h):", deployer);
    }

    /// @notice Executes the full deployment graph inside `vm.startBroadcast()` / `vm.stopBroadcast()`.
    function run() external {
        vm.startBroadcast();
        Deployment memory d = _deployAll(msg.sender);
        _logDeployment(d, msg.sender);
        vm.stopBroadcast();
    }
}
