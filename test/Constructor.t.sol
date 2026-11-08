// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BaseTest} from "./BaseTest.sol";
import {DualPoolStorageLayout} from "../src/core/DualPoolStorageLayout.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

import {DualPoolStaking} from "../src/core/DualPoolStaking.sol";
import {Pool} from "../src/StakeTypes.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract TestConstructor is BaseTest {
    function testConstructorRolesAndOwner() public {
        vm.startPrank(deployer);
        assertTrue(core.hasRole(core.DEFAULT_ADMIN_ROLE(), deployer));
        assertEq(core.owner(), deployer);
        vm.stopPrank();
    }

    function testConstructorRevertsOnZeroToken() public {
        vm.expectRevert(DualPoolStorageLayout.ZeroAddress.selector);
        new DualPoolStaking(address(0), address(tokenB), CAP, 24 hours);

        vm.expectRevert(DualPoolStorageLayout.ZeroAddress.selector);
        new DualPoolStaking(address(tokenA), address(0), CAP, 24 hours);
    }

    function testConstructorRevertsOnSameToken() public {
        vm.expectRevert(DualPoolStaking.SameToken.selector);
        new DualPoolStaking(address(tokenA), address(tokenA), CAP, 24 hours);
    }

    function testConstructorRevertsOnTokenWithoutCode() public {
        vm.expectRevert(DualPoolStaking.NotAContract.selector);
        new DualPoolStaking(address(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266), address(tokenB), CAP, 24 hours);
    }

    function testConstructorRevertsOnTokenBWrongDecimals() public {
        tokenB = new MockERC20("TokenB", "TKB", BAD_DECIMALS);
        vm.expectRevert(DualPoolStaking.InvalidTokenDecimals.selector);
        new DualPoolStaking(address(tokenA), address(tokenB), CAP, 24 hours);
    }

    function testConstructorRevertsOnZeroCap() public {
        vm.expectRevert(DualPoolStaking.CapZero.selector);
        new DualPoolStaking(address(tokenA), address(tokenB), 0, 24 hours);
    }

    function testConstructorRevertsWhenRateTooSmall() public {
        vm.expectRevert(DualPoolStaking.RateTooSmall.selector);
        new DualPoolStaking(address(tokenA), address(tokenB), MIN_CAP_FOR_NONZERO_RATE - 1, 24 hours);
    }

    function testConstructorBindsTokens() public view {
        assertEq(address(core.getPool(Pool.A).stakingToken), address(tokenA));
        assertEq(address(core.getPool(Pool.B).stakingToken), address(tokenB));
        assertEq(address(core.rewardTokenB()), address(tokenB));
    }

    function testConstructorDerivesRateCap() public view {
        assertEq(core.maxTotalSupplyBForRewardRateCap(), CAP);
        uint256 maxRate = Math.mulDiv(CAP, MAX_APR_BP, BASIS_POINTS * SECONDS_PER_YEAR);
        assertEq(core.maxRewardRateA(), maxRate);
        assertEq(core.maxRewardRateB(), maxRate);
    }

    function testConstructorDefaults() public view {
        assertEq(core.lockDuration(), 7 days);
        assertEq(core.penaltyFeeBP(), 1000);
        assertEq(core.withdrawFeeBP(), 100);
        assertEq(core.midTermFeeBP(), 50);
        assertEq(core.minEarlyExitAmountB(), 10);
        assertEq(core.maxTransferFeeBP(), 1000);
        assertEq(core.minClaimAmount(), 0);
    }
}
