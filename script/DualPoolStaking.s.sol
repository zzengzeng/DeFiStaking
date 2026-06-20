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
///      Governance envs:
///      `GOVERNANCE_PROPOSER`, `GOVERNANCE_EXECUTOR`, `SUPER_PROPOSER`, `SUPER_EXECUTOR`, `OPERATOR`.
///      Set `PRODUCTION=true` to reject deployer/zero addresses for these privileged roles.
/// @custom:security After wiring, `ADMIN_ROLE` and `DEFAULT_ADMIN_ROLE` on the core are held by `DualPoolStakingAdmin`; both are revoked from `deployer`. `OPERATOR_ROLE` is moved to the configured operations address. Module swaps and role changes require the 72h timelock; parameter changes use the 48h timelock.
contract DeployDualPoolStaking is Script {
    uint256 internal constant GOVERNANCE_MIN_DELAY = 48 hours;
    uint256 internal constant SUPER_MIN_DELAY = 72 hours;

    struct GovernanceConfig {
        address governanceProposer;
        address governanceExecutor;
        address superProposer;
        address superExecutor;
        address operator;
        bool production;
    }

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

    function _singleton(address account) internal pure returns (address[] memory list) {
        list = new address[](1);
        list[0] = account;
    }

    function _requireNonZero(address account, string memory label) internal pure {
        require(account != address(0), string.concat(label, " is zero"));
    }

    function _requireProductionAddress(address account, address deployer, string memory label) internal pure {
        _requireNonZero(account, label);
        require(account != deployer, string.concat(label, " must not be deployer in production"));
    }

    function _resolveGovernanceConfig(address deployer) internal view returns (GovernanceConfig memory cfg) {
        cfg.production = vm.envOr("PRODUCTION", false);
        cfg.governanceProposer = vm.envOr("GOVERNANCE_PROPOSER", deployer);
        cfg.governanceExecutor = vm.envOr("GOVERNANCE_EXECUTOR", deployer);
        cfg.superProposer = vm.envOr("SUPER_PROPOSER", deployer);
        cfg.superExecutor = vm.envOr("SUPER_EXECUTOR", deployer);
        cfg.operator = vm.envOr("OPERATOR", deployer);

        _requireNonZero(cfg.governanceProposer, "GOVERNANCE_PROPOSER");
        _requireNonZero(cfg.governanceExecutor, "GOVERNANCE_EXECUTOR");
        _requireNonZero(cfg.superProposer, "SUPER_PROPOSER");
        _requireNonZero(cfg.superExecutor, "SUPER_EXECUTOR");
        _requireNonZero(cfg.operator, "OPERATOR");

        if (cfg.production) {
            _requireProductionAddress(cfg.governanceProposer, deployer, "GOVERNANCE_PROPOSER");
            _requireProductionAddress(cfg.governanceExecutor, deployer, "GOVERNANCE_EXECUTOR");
            _requireProductionAddress(cfg.superProposer, deployer, "SUPER_PROPOSER");
            _requireProductionAddress(cfg.superExecutor, deployer, "SUPER_EXECUTOR");
            _requireProductionAddress(cfg.operator, deployer, "OPERATOR");
        }
    }

    function _wireAdminRoles(DualPoolStaking core, address adminFacade, address deployer, address operator) internal {
        if (operator != deployer) {
            core.grantRole(core.OPERATOR_ROLE(), operator);
            core.revokeRole(core.OPERATOR_ROLE(), deployer);
        }
        core.grantRole(core.ADMIN_ROLE(), adminFacade);
        core.revokeRole(core.ADMIN_ROLE(), deployer);
        core.grantRole(core.DEFAULT_ADMIN_ROLE(), adminFacade);
        core.revokeRole(core.DEFAULT_ADMIN_ROLE(), deployer);
        core.transferOwnership(adminFacade);
    }

    function _deployAll(address deployer) internal returns (Deployment memory d) {
        GovernanceConfig memory cfg = _resolveGovernanceConfig(deployer);
        d.tokenA = _resolveToken("TOKEN_A", "ZZTokenA", "ZZTKA");
        d.tokenB = _resolveToken("TOKEN_B", "ZZTokenB", "ZZTKB");
        require(d.tokenA != d.tokenB, "TOKEN_A == TOKEN_B");

        d.core = new DualPoolStaking(d.tokenA, d.tokenB, 10_000_000 * 1e18);
        d.userModule = new DualPoolUserModule();
        d.adminModule = new DualPoolAdminModule();

        d.timelockGovernance = new TimelockController(
            GOVERNANCE_MIN_DELAY, _singleton(cfg.governanceProposer), _singleton(cfg.governanceExecutor), address(0)
        );
        d.timelockSuper = new TimelockController(
            SUPER_MIN_DELAY, _singleton(cfg.superProposer), _singleton(cfg.superExecutor), address(0)
        );
        d.admin = new DualPoolStakingAdmin(address(d.core), address(d.timelockGovernance), address(d.timelockSuper));

        d.core.setUserModule(address(d.userModule));
        d.core.setAdminModule(address(d.adminModule));
        _wireAdminRoles(d.core, address(d.admin), deployer, cfg.operator);
    }

    function _logDeployment(Deployment memory d, address deployer) internal view {
        GovernanceConfig memory cfg = _resolveGovernanceConfig(deployer);
        console.log("DualPoolStaking deployed at:", address(d.core));
        console.log("DualPoolUserModule deployed at:", address(d.userModule));
        console.log("DualPoolAdminModule deployed at:", address(d.adminModule));
        console.log("DualPoolStakingAdmin deployed at:", address(d.admin));
        console.log("TimelockController (governance 48h) at:", address(d.timelockGovernance));
        console.log("TimelockController (super 72h) at:", address(d.timelockSuper));
        console.log("Governance minDelay (seconds):", GOVERNANCE_MIN_DELAY);
        console.log("Super minDelay (seconds):", SUPER_MIN_DELAY);
        console.log("Governance proposer:", cfg.governanceProposer);
        console.log("Governance executor:", cfg.governanceExecutor);
        console.log("Super proposer:", cfg.superProposer);
        console.log("Super executor:", cfg.superExecutor);
        console.log("OPERATOR_ROLE holder (hot ops, 0h):", cfg.operator);
        console.log("PRODUCTION guard:", cfg.production);
    }

    /// @notice Executes the full deployment graph inside `vm.startBroadcast()` / `vm.stopBroadcast()`.
    function run() external {
        vm.startBroadcast();
        Deployment memory d = _deployAll(msg.sender);
        _logDeployment(d, msg.sender);
        vm.stopBroadcast();
    }
}
