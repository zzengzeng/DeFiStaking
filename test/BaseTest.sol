// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {DualPoolStaking} from "../src/core/DualPoolStaking.sol";
import {DualPoolAdminModule} from "../src/core/DualPoolAdminModule.sol";
import {Constants} from "./utils/Constants.sol";

abstract contract BaseTest is Test, Constants {
    MockERC20 public tokenA;
    MockERC20 public tokenB;
    DualPoolStaking public core;
    DualPoolAdminModule public adminModule;

    address deployer = makeAddr("deployer");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address ops = makeAddr("ops");
    address treasury = makeAddr("treasury");
    bytes32 public ADMIN_ROLE;
    bytes32 public OPERATOR_ROLE;

    function setUp() public {
        tokenA = new MockERC20("TokenA", "TKA", GOOD_DECIMALS);
        tokenB = new MockERC20("TokenB", "TKB", GOOD_DECIMALS);
        vm.startPrank(deployer);
        core = new DualPoolStaking(address(tokenA), address(tokenB), CAP);
        adminModule = new DualPoolAdminModule();
        core.setAdminModule(address(adminModule));
        core.setAdmin(alice, true);
        core.setOperator(ops, true);
        ADMIN_ROLE = core.ADMIN_ROLE();
        OPERATOR_ROLE = core.OPERATOR_ROLE();
        vm.stopPrank();
    }
}
