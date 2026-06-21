// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";

import {MockERC20} from "../src/MockERC20.sol";
import {TestnetTokenAirdropFaucet} from "../src/TestnetTokenAirdropFaucet.sol";

contract MockERC20Test is Test {
    MockERC20 internal token;
    address internal owner = address(this);
    address internal alice = makeAddr("alice");

    function setUp() public {
        token = new MockERC20("TKA", "TKA");
    }

    function test_ownerCanMint() public {
        token.mint(alice, 1 ether);
        assertEq(token.balanceOf(alice), 1 ether);
        assertEq(token.totalSupply(), 1 ether);
    }

    function test_nonOwnerCannotMint() public {
        vm.prank(alice);
        vm.expectRevert();
        token.mint(alice, 1 ether);
    }

    function test_transferAfterMint() public {
        token.mint(alice, 2 ether);
        vm.prank(alice);
        assertTrue(token.transfer(owner, 1 ether));
        assertEq(token.balanceOf(alice), 1 ether);
        assertEq(token.balanceOf(owner), 1 ether);
    }
}

contract TestnetTokenAirdropFaucetTest is Test {
    uint256 internal constant CLAIM_AMOUNT = 1000 ether;
    uint256 internal constant MAX_CLAIMS = 3;

    MockERC20 internal token;
    TestnetTokenAirdropFaucet internal faucet;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        token = new MockERC20("TKA", "TKA");
        faucet = new TestnetTokenAirdropFaucet(address(token), CLAIM_AMOUNT, MAX_CLAIMS);
        token.mint(address(faucet), CLAIM_AMOUNT * MAX_CLAIMS);
    }

    function test_claimOncePerWallet() public {
        vm.prank(alice);
        faucet.claim();
        assertEq(token.balanceOf(alice), CLAIM_AMOUNT);
        assertTrue(faucet.claimed(alice));
        assertEq(faucet.claimCount(), 1);
        assertEq(faucet.remainingClaims(), 2);

        vm.prank(alice);
        vm.expectRevert("already claimed");
        faucet.claim();
    }

    function test_capReached() public {
        for (uint256 i = 0; i < MAX_CLAIMS; i++) {
            address user = address(uint160(1000 + i));
            vm.prank(user);
            faucet.claim();
        }
        assertEq(faucet.remainingClaims(), 0);

        vm.prank(bob);
        vm.expectRevert("cap reached");
        faucet.claim();
    }
}
