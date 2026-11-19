// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockFOTERC20} from "./mocks/MockFOTERC20.sol";
import {MockMintOnTransferERC20} from "./mocks/MockMintOnTransferERC20.sol";
import {MockSenderFeeERC20} from "./mocks/MockSenderFeeERC20.sol";

import {DualPoolStaking} from "../src/core/DualPoolStaking.sol";
import {DualPoolAdminModule} from "../src/core/DualPoolAdminModule.sol";
import {DualPoolUserModule} from "../src/core/DualPoolUserModule.sol";

import {Constants} from "./utils/Constants.sol";
import {Pool} from "../src/StakeTypes.sol";

abstract contract BaseTest is Test, Constants {
    MockERC20 public tokenA;
    MockERC20 public tokenB;
    DualPoolStaking public core;
    DualPoolAdminModule public adminModule;
    DualPoolUserModule public userModule;

    address deployer = makeAddr("deployer");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address ops = makeAddr("ops");
    address treasury = makeAddr("treasury");
    bytes32 public ADMIN_ROLE;
    bytes32 public OPERATOR_ROLE;

    function setUp() public virtual {
        tokenA = new MockERC20("TokenA", "TKA", GOOD_DECIMALS);
        tokenB = new MockERC20("TokenB", "TKB", GOOD_DECIMALS);
        vm.startPrank(deployer);
        core = new DualPoolStaking(address(tokenA), address(tokenB), CAP, 24 hours);
        adminModule = new DualPoolAdminModule();
        userModule = new DualPoolUserModule();
        core.setAdminModule(address(adminModule));
        core.setUserModule(address(userModule));
        core.setAdmin(alice, true);
        core.setOperator(ops, true);
        ADMIN_ROLE = core.ADMIN_ROLE();
        OPERATOR_ROLE = core.OPERATOR_ROLE();
        vm.stopPrank();
    }

    function _deployCoreWithToken(address _tokenB) internal returns (DualPoolStaking newCore) {
        vm.startPrank(deployer);
        newCore = new DualPoolStaking(address(tokenA), _tokenB, CAP, 24 hours);
        newCore.setAdminModule(address(adminModule));
        newCore.setUserModule(address(userModule));
        newCore.setOperator(ops, true);
        vm.stopPrank();
    }

    function _deployFOTCore(uint256 feeBP) internal returns (DualPoolStaking fotCore, MockFOTERC20 fotToken) {
        fotToken = new MockFOTERC20("FOT", "FOT", GOOD_DECIMALS);
        fotToken.setFee(feeBP);
        fotCore = _deployCoreWithToken(address(fotToken));
    }

    function _deployFOTACore(uint256 feeBP) internal returns (DualPoolStaking fotCore, MockFOTERC20 fotToken) {
        fotToken = new MockFOTERC20("FOTA", "FOTA", GOOD_DECIMALS);
        fotToken.setFee(feeBP);
        vm.startPrank(deployer);
        fotCore = new DualPoolStaking(
            address(fotToken), // ← TokenA = FOT
            address(tokenB), // ← TokenB = 标准
            CAP,
            24 hours
        );
        fotCore.setAdminModule(address(adminModule));
        fotCore.setUserModule(address(userModule));
        fotCore.setOperator(ops, true);
        vm.stopPrank();
    }

    function _deployFOTBCore(uint256 feeBP) internal returns (DualPoolStaking fotCore, MockFOTERC20 fotToken) {
        fotToken = new MockFOTERC20("FOTB", "FOTB", GOOD_DECIMALS);
        fotToken.setFee(feeBP);
        vm.startPrank(deployer);
        fotCore = new DualPoolStaking(
            address(tokenA), // ← TokenA = 标准
            address(fotToken), // ← TokenB = FOT
            CAP,
            24 hours
        );
        fotCore.setAdminModule(address(adminModule));
        fotCore.setUserModule(address(userModule));
        fotCore.setOperator(ops, true);
        fotCore.setAdmin(alice, true);
        vm.stopPrank();
    }

    function _deployMintOnTransferCore(uint256 mintExtraBP)
        internal
        returns (DualPoolStaking fotCore, MockMintOnTransferERC20 fotToken)
    {
        fotToken = new MockMintOnTransferERC20("MTA", "MTA", GOOD_DECIMALS);
        fotToken.setMintExtraBP(mintExtraBP);
        fotCore = _deployCoreWithToken(address(fotToken));
    }

    function _deploySenderFeeERC20(uint256 feeBP)
        internal
        returns (DualPoolStaking fotCore, MockSenderFeeERC20 fotToken)
    {
        fotToken = new MockSenderFeeERC20("SFT", "SFT", GOOD_DECIMALS);
        fotToken.setFee(feeBP);
        fotCore = _deployCoreWithToken(address(fotToken));
    }

    function _forceShutdown() internal virtual {
        vm.prank(ops);
        core.enableEmergencyMode();

        vm.prank(alice);
        core.activateShutdown();
    }

    function _fundAndSchedule(Pool pool, uint256 amount, uint256 duration) internal {
        deal(address(tokenB), ops, amount);
        vm.prank(ops);
        tokenB.approve(address(core), amount);

        vm.prank(ops);
        core.fundRewards(pool, amount);

        vm.prank(alice);
        core.scheduleRewards(pool, duration);
    }
}
