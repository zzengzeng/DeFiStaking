// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, Vm, console} from "forge-std/Test.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {MockERC20} from "../src/MockERC20.sol";
import {MockFOTERC20} from "./mocks/MockFOTERC20.sol";
import {MockERC20WithDecimals} from "./mocks/MockERC20WithDecimals.sol";
import {DualPoolStaking} from "../src/DualPoolStaking.sol";
import {PoolBWadpLib} from "../src/libraries/PoolBWadpLib.sol";
import {DualPoolStakingAdmin} from "../src/DualPoolStakingAdmin.sol";
import {DualPoolUserModule} from "../src/modules/DualPoolUserModule.sol";
import {DualPoolAdminModule} from "../src/modules/DualPoolAdminModule.sol";
import {Pool, PoolInfo} from "../src/StakeTypes.sol";
import {StakingExecutionErrors} from "../src/StakingExecutionErrors.sol";
import {RewardReanchorLib} from "../src/libraries/RewardReanchorLib.sol";

contract ReanchorHarness {
    PoolInfo internal pool;

    function seed(uint256 availableRewards, uint256 periodFinish, uint256 lastUpdateTime) external {
        pool.availableRewards = availableRewards;
        pool.periodFinish = periodFinish;
        pool.lastUpdateTime = lastUpdateTime;
    }

    function applyActive(uint256 remainingTime) external {
        RewardReanchorLib.applyCappedRateForRemainingWindow(
            pool, remainingTime, 10_000_000 ether, 20_000, 10_000, 31_536_000
        );
    }

    function snapshot()
        external
        view
        returns (uint256 rewardRate, uint256 periodFinish, uint256 lastUpdateTime, uint256 availableRewards)
    {
        return (pool.rewardRate, pool.periodFinish, pool.lastUpdateTime, pool.availableRewards);
    }
}

/// @title DualPoolStakingTest
/// @notice Foundry tests for `DualPoolStaking` with `DualPoolUserModule` / `DualPoolAdminModule` wired similarly to `script/DualPoolStaking.s.sol`.
/// @dev `setUp` omits `TimelockController`; `stakingAdmin` receives `ADMIN_ROLE` on the core while this `Test` contract retains `DEFAULT_ADMIN_ROLE` / `OPERATOR_ROLE` for `notifyReward*` helpers. Grant `DEFAULT_ADMIN_ROLE` to `stakingAdmin` when testing timelocked governance facade super-paths (matches `script/DualPoolStaking.s.sol`).
contract DualPoolStakingTest is Test {
    MockERC20 stakingToken;
    MockERC20 rewardToken;

    DualPoolStaking dualPoolStaking;
    DualPoolStakingAdmin stakingAdmin;

    address user = address(1);
    uint256 internal constant SAFE_REWARD_AMOUNT = 5 ether;
    uint256 internal constant SAFE_DURATION = 1 days;
    uint256 internal constant DEFAULT_STAKE = 100 ether;
    uint256 internal constant HALF_STAKE = 50 ether;
    uint256 internal constant SHORT_WARP = 100;

    /// @notice Deploys mock tokens, core, modules, admin facade; mints test balances and approves the core for reward funding.
    function setUp() public {
        stakingToken = new MockERC20("Staking Token", "STK");
        rewardToken = new MockERC20("Reward Token", "RWD");

        dualPoolStaking = new DualPoolStaking(address(stakingToken), address(rewardToken), 10_000_000 * 1e18);

        // Align with `script/DualPoolStaking.s.sol`: wire delegate modules + admin facade (no Timelock in tests).
        DualPoolUserModule userModule = new DualPoolUserModule();
        DualPoolAdminModule adminModule = new DualPoolAdminModule();
        stakingAdmin = new DualPoolStakingAdmin(address(dualPoolStaking), address(this), address(this));
        dualPoolStaking.setUserModule(address(userModule));
        dualPoolStaking.setAdminModule(address(adminModule));
        dualPoolStaking.grantRole(dualPoolStaking.ADMIN_ROLE(), address(stakingAdmin));
        // Script later revokes deployer roles; tests keep `OPERATOR_ROLE` on this contract for `notifyReward*`.

        _mintStaking(user, 1000 * 1e18);
        _mintReward(user, 1000 * 1e18);
        _mintReward(address(this), 1000 * 1e18);

        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
    }

    function _mintStaking(address to, uint256 amount) internal {
        (VmSafe.CallerMode mode, address caller,) = vm.readCallers();
        if (mode != VmSafe.CallerMode.None) vm.stopPrank();
        stakingToken.mint(to, amount);
        if (mode == VmSafe.CallerMode.RecurrentPrank) vm.startPrank(caller);
    }

    function _mintReward(address to, uint256 amount) internal {
        (VmSafe.CallerMode mode, address caller,) = vm.readCallers();
        if (mode != VmSafe.CallerMode.None) vm.stopPrank();
        rewardToken.mint(to, amount);
        if (mode == VmSafe.CallerMode.RecurrentPrank) vm.startPrank(caller);
    }

    /// @dev Funds Pool A twice with a warp in between to simulate back-to-back `notifyRewardAmountA` operator flows.
    function _queueAndExecuteNotifyRewardAmountA(uint256 rewardAmount, uint256 duration) internal {
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);
        vm.warp(block.timestamp + duration + 1);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);
    }

    /// @dev Same as `_queueAndExecuteNotifyRewardAmountA` but for Pool B notify path.
    function _queueAndExecuteNotifyRewardAmountB(uint256 rewardAmount, uint256 duration) internal {
        dualPoolStaking.notifyRewardAmountB(rewardAmount, duration);
        vm.warp(block.timestamp + duration + 1);
        dualPoolStaking.notifyRewardAmountB(rewardAmount, duration);
    }

    /// @dev Enables `forceClaimAll` and shutdown withdrawals in tests. Clears any active `vm.prank` (must re-prank user afterward).
    function _activateShutdownForTests() internal {
        vm.stopPrank();
        dualPoolStaking.enableEmergencyMode();
        stakingAdmin.activateShutdown();
    }

    /// @dev Mirrors `RewardReanchorLib.deriveMaxRewardRate` for notify / re-anchor cap assertions.
    function _maxRewardRate(DualPoolStaking s) internal view returns (uint256) {
        return RewardReanchorLib.deriveMaxRewardRate(
            s.maxTotalSupplyBForRewardRateCap(), s.MAX_APR_BP(), s.BASIS_POINTS(), s.SECONDS_PER_YEAR()
        );
    }

    /// @dev Same TokenB backing check as `DualPoolUserModule._assertInvariantB` (`DUST_TOLERANCE == 10`).
    function _assertTokenBBalanceInvariant(DualPoolStaking s) internal view {
        PoolInfo memory pa = s.poolA();
        PoolInfo memory pb = s.poolB();
        IERC20 tok = IERC20(address(s.rewardToken()));
        uint256 actual = tok.balanceOf(address(s)) + pa.badDebt + pb.badDebt;
        uint256 required = pb.totalStaked + pa.totalPending + pb.totalPending + pa.availableRewards
            + pb.availableRewards + s.unclaimedFeesB() + pa.dust + pb.dust;
        assertGe(actual + 10, required, "TokenB invariant (balance+badDebt >= liabilities)");
    }

    /// @dev Mirrors `StakingAdminLib._movableRebalanceBudget` (call after the same `_updateGlobal*` snapshot rebalance uses).
    function _movableRebalanceBudget(PoolInfo memory pool) internal pure returns (uint256) {
        if (pool.periodFinish <= pool.lastUpdateTime) return pool.availableRewards;
        uint256 reserved = (pool.periodFinish - pool.lastUpdateTime) * pool.rewardRate;
        return pool.availableRewards > reserved ? pool.availableRewards - reserved : 0;
    }

    function testStakeA() public {
        vm.startPrank(user);

        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        (uint256 stakedAmount,,) = dualPoolStaking.userInfoA(user);
        assertEq(stakedAmount, DEFAULT_STAKE);

        vm.stopPrank();
    }

    function testWithdrawA() public {
        vm.startPrank(user);

        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        dualPoolStaking.withdrawA(HALF_STAKE);

        (uint256 stakedAmount,,) = dualPoolStaking.userInfoA(user);
        assertEq(stakedAmount, HALF_STAKE);

        vm.stopPrank();
    }

    function testClaimA() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        // Fast forward time to accumulate rewards
        vm.warp(block.timestamp + duration);

        uint256 rewardBefore = rewardToken.balanceOf(user);
        dualPoolStaking.claimA();
        uint256 rewardAfter = rewardToken.balanceOf(user);

        assertGt(rewardAfter, rewardBefore, "User should have received rewards");

        vm.stopPrank();
    }

    function testNotifyRewardAmountA() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;

        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);

        PoolInfo memory p = dualPoolStaking.poolA();
        uint256 rewardRate = p.rewardRate;
        uint256 availableRewards = p.availableRewards;
        console.log("rewardRate", rewardRate);
        console.log("availableRewards", availableRewards);
        assertEq(availableRewards, rewardAmount);
        assertEq(rewardRate, rewardAmount / duration);
    }

    /// @notice `totalPending` must track only index-attributable rewards; single-staker ledger matches after settle.
    function testTotalPendingMatchesUserRewardsSingleStakerA() public {
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(SAFE_REWARD_AMOUNT, SAFE_DURATION);
        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.warp(block.timestamp + SAFE_DURATION / 2);
        _mintStaking(user, 1 ether);
        stakingToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeA(1 wei);
        (, uint256 rew,) = dualPoolStaking.userInfoA(user);
        uint256 tp = dualPoolStaking.poolA().totalPending;
        assertEq(tp, rew);
        vm.stopPrank();
    }

    /// @notice `pendingRewardA` accrues without an extra settle tx; matches `userInfoA.rewards` after the next stake.
    function testPendingRewardAViewMatchesSettleAfterWarp() public {
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(SAFE_REWARD_AMOUNT, SAFE_DURATION);
        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.warp(block.timestamp + SAFE_DURATION / 2);

        (, uint256 settledBefore,) = dualPoolStaking.userInfoA(user);
        uint256 pending = dualPoolStaking.pendingRewardA(user);
        assertEq(settledBefore, 0);
        assertGt(pending, 0);

        stakingToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeA(1 wei);
        (, uint256 settledAfter,) = dualPoolStaking.userInfoA(user);
        assertApproxEqAbs(settledAfter, pending, 1);
        assertApproxEqAbs(dualPoolStaking.pendingRewardA(user), settledAfter, 1);
        vm.stopPrank();
    }

    /// @notice `pendingRewardB` mirrors Pool B settlement semantics.
    function testPendingRewardBViewMatchesSettleAfterWarp() public {
        _mintReward(address(this), SAFE_REWARD_AMOUNT);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountB(SAFE_REWARD_AMOUNT, SAFE_DURATION);
        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);
        vm.warp(block.timestamp + SAFE_DURATION / 2);

        (, uint256 settledBefore,) = dualPoolStaking.userInfoB(user);
        uint256 pending = dualPoolStaking.pendingRewardB(user);
        assertEq(settledBefore, 0);
        assertGt(pending, 0);

        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeB(1 wei);
        (, uint256 settledAfter,) = dualPoolStaking.userInfoB(user);
        assertApproxEqAbs(settledAfter, pending, 1);
        assertApproxEqAbs(dualPoolStaking.pendingRewardB(user), settledAfter, 1);
        vm.stopPrank();
    }

    function testRewardAccuracy() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;

        _mintReward(address(this), rewardAmount);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountB(rewardAmount, duration);

        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);

        vm.warp(block.timestamp + duration);

        uint256 beforeBal = rewardToken.balanceOf(user);
        dualPoolStaking.claimB();
        uint256 afterBal = rewardToken.balanceOf(user);

        uint256 claimed = afterBal - beforeBal;
        assertApproxEqAbs(claimed, rewardAmount, 1e12);

        vm.stopPrank();
    }

    function testRewardExhausted() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;

        _mintReward(address(this), rewardAmount);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountB(rewardAmount, duration);

        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);

        vm.warp(block.timestamp + duration * 2);

        uint256 beforeBal = rewardToken.balanceOf(user);
        dualPoolStaking.claimB();
        uint256 afterBal = rewardToken.balanceOf(user);

        uint256 claimed = afterBal - beforeBal;
        assertApproxEqAbs(claimed, rewardAmount, 1e12);

        vm.stopPrank();
    }

    function testStakeTwiceRewardNotLost() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;

        _mintReward(address(this), rewardAmount);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), 1000 * 1e18);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        vm.warp(block.timestamp + SHORT_WARP);

        // Stake again before claiming
        dualPoolStaking.stakeA(HALF_STAKE);

        vm.warp(block.timestamp + SHORT_WARP);

        dualPoolStaking.claimA();
        uint256 reward = rewardToken.balanceOf(user);
        assertGt(reward, 0);
        vm.stopPrank();
    }

    function testClaimResetRewards() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;

        _mintReward(address(this), rewardAmount);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        vm.warp(block.timestamp + SHORT_WARP);

        dualPoolStaking.claimA();

        PoolInfo memory p = dualPoolStaking.poolA();
        uint256 lastUpdateTime = p.lastUpdateTime;
        uint256 availableRewards = p.availableRewards;
        console.log("availableRewards after claim", availableRewards);
        console.log("lastUpdateTime after claim", lastUpdateTime);
        assertApproxEqAbs(availableRewards, rewardAmount - (rewardAmount * 100 / duration), 100);
    }

    function testStakeB() public {
        vm.startPrank(user);

        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);

        (uint256 stakedAmount,,) = dualPoolStaking.userInfoB(user);
        assertEq(stakedAmount, DEFAULT_STAKE);

        vm.stopPrank();
    }

    function testWithdrawB() public {
        vm.startPrank(user);

        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);

        dualPoolStaking.withdrawB(HALF_STAKE);

        (uint256 stakedAmount,,) = dualPoolStaking.userInfoB(user);
        assertEq(stakedAmount, HALF_STAKE);

        vm.stopPrank();
    }

    function testClaimB() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountB(rewardAmount, duration);

        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);

        // Fast forward time to accumulate rewards
        vm.warp(block.timestamp + duration);

        uint256 rewardBefore = rewardToken.balanceOf(user);
        dualPoolStaking.claimB();
        uint256 rewardAfter = rewardToken.balanceOf(user);

        assertGt(rewardAfter, rewardBefore, "User should have received rewards");

        vm.stopPrank();
    }

    function testNotifyRewardAmountB() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;

        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountB(rewardAmount, duration);

        PoolInfo memory p = dualPoolStaking.poolB();
        uint256 rewardRate = p.rewardRate;
        uint256 availableRewards = p.availableRewards;
        console.log("rewardRate", rewardRate);
        console.log("availableRewards", availableRewards);
        assertEq(availableRewards, rewardAmount);
        assertEq(rewardRate, rewardAmount / duration);
    }

    function testCompoundFromAIntoB() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;

        _mintReward(address(this), rewardAmount);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);

        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        vm.warp(block.timestamp + SHORT_WARP);

        dualPoolStaking.compoundB();

        (uint256 stakedB,,) = dualPoolStaking.userInfoB(user);
        assertGt(stakedB, 0);

        (, uint256 rewardsA,) = dualPoolStaking.userInfoA(user);
        assertEq(rewardsA, 0);

        vm.stopPrank();
    }

    function testCompoundOnlyA() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;

        _mintReward(address(this), rewardAmount);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);

        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        vm.warp(block.timestamp + SHORT_WARP);

        dualPoolStaking.compoundB();

        (uint256 stakedB,,) = dualPoolStaking.userInfoB(user);
        assertGt(stakedB, 0, "B stake should increase");

        vm.stopPrank();
    }

    function testCompoundOnlyB() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;

        _mintReward(address(this), rewardAmount);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountB(rewardAmount, duration);

        vm.startPrank(user);

        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);

        vm.warp(block.timestamp + SHORT_WARP);

        (uint256 before,,) = dualPoolStaking.userInfoB(user);

        dualPoolStaking.compoundB();

        (uint256 afterStake,,) = dualPoolStaking.userInfoB(user);

        assertGt(afterStake, before, "B stake should increase");

        vm.stopPrank();
    }

    function testCompoundAandB() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;

        _mintReward(address(this), rewardAmount * 2);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);

        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);
        _queueAndExecuteNotifyRewardAmountB(rewardAmount, duration);

        vm.startPrank(user);

        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);

        vm.warp(block.timestamp + SHORT_WARP);

        dualPoolStaking.compoundB();

        (uint256 stakedB,,) = dualPoolStaking.userInfoB(user);

        assertGt(stakedB, DEFAULT_STAKE);

        vm.stopPrank();
    }

    function testCompoundResetRewards() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;

        _mintReward(address(this), rewardAmount);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);

        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        vm.warp(block.timestamp + SHORT_WARP);

        dualPoolStaking.compoundB();

        (, uint256 rewardA,) = dualPoolStaking.userInfoA(user);
        (, uint256 rewardB,) = dualPoolStaking.userInfoB(user);

        assertEq(rewardA, 0, "A rewards should be cleared");
        assertEq(rewardB, 0, "B rewards should be cleared");

        vm.stopPrank();
    }

    function testCompoundReducePending() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;

        _mintReward(address(this), rewardAmount * 2);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);

        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);
        _queueAndExecuteNotifyRewardAmountB(rewardAmount, duration);

        vm.startPrank(user);

        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);

        vm.warp(block.timestamp + SHORT_WARP);

        dualPoolStaking.compoundB();

        uint256 pendingAAfter = dualPoolStaking.poolA().totalPending;
        uint256 pendingBAfter = dualPoolStaking.poolB().totalPending;

        assertLe(pendingAAfter, 1, "A pending should be zero after compound");
        assertLe(pendingBAfter, 1, "B pending should be zero after compound");

        vm.stopPrank();
    }

    function testCompoundNoRewardsShouldRevert() public {
        vm.startPrank(user);
        vm.expectRevert(StakingExecutionErrors.NoRewardsToCompound.selector);
        dualPoolStaking.compoundB();
        vm.stopPrank();
    }

    function testCompoundCooldownActive() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;

        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);

        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        vm.warp(block.timestamp + SHORT_WARP);

        dualPoolStaking.compoundB();

        vm.expectRevert();
        dualPoolStaking.compoundB();

        vm.stopPrank();
    }

    function testCompoundUpdatesUnlockTimeB() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;

        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);

        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        vm.warp(block.timestamp + SHORT_WARP);

        dualPoolStaking.compoundB();

        uint256 unlockTime = dualPoolStaking.unlockTimeB(user);
        assertGt(unlockTime, block.timestamp, "unlockTimeB should be in future");

        vm.stopPrank();
    }

    function testCompoundUpdatesStakeTimestampB() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;

        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);

        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        vm.warp(block.timestamp + SHORT_WARP);

        dualPoolStaking.compoundB();

        uint256 ts = dualPoolStaking.stakeTimestampB(user);
        assertEq(ts, block.timestamp, "stakeTimestampB should be updated to current time for first B position");

        vm.stopPrank();
    }

    function testCompoundUpdatesRewardPaidB() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;

        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);

        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        vm.warp(block.timestamp + SHORT_WARP);

        dualPoolStaking.compoundB();

        (,, uint256 rewardPaidB) = dualPoolStaking.userInfoB(user);
        uint256 accRewardPerTokenB = dualPoolStaking.poolB().accRewardPerToken;

        assertEq(rewardPaidB, accRewardPerTokenB, "rewardPaidB should equal current accRewardPerTokenB");

        vm.stopPrank();
    }

    function testCompoundDoesNotDoubleCountOldRewards() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;

        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);

        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        vm.warp(block.timestamp + SHORT_WARP);

        dualPoolStaking.compoundB();

        vm.warp(block.timestamp + dualPoolStaking.claimCooldown() + 1);
        vm.expectRevert(StakingExecutionErrors.NoRewardsToClaim.selector);
        dualPoolStaking.claimB();

        vm.stopPrank();
    }

    function testCompoundIntoEmptyBPoolReanchor() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;

        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);

        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        vm.warp(block.timestamp + SHORT_WARP);

        dualPoolStaking.compoundB();

        uint256 totalStaked = dualPoolStaking.poolB().totalStaked;
        assertGt(totalStaked, 0, "compound should bootstrap poolB");

        vm.stopPrank();
    }

    function testWithdrawBEarlyWithPenalty() public {
        uint256 amount = DEFAULT_STAKE;

        vm.startPrank(user);

        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeB(amount);

        uint256 beforeBal = rewardToken.balanceOf(user);

        dualPoolStaking.withdrawB(amount);

        uint256 afterBal = rewardToken.balanceOf(user);
        uint256 received = afterBal - beforeBal;

        assertEq(received, 90 ether);

        vm.stopPrank();
    }

    function testPenaltyFlowsToAvailableRewards() public {
        uint256 amount = DEFAULT_STAKE;

        vm.startPrank(user);

        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeB(amount);

        uint256 beforeRewards = dualPoolStaking.poolB().availableRewards;

        dualPoolStaking.withdrawB(amount);

        uint256 afterRewards = dualPoolStaking.poolB().availableRewards;

        assertEq(afterRewards - beforeRewards, 10 ether);

        vm.stopPrank();
    }

    function testWithdrawBAfterUnlockNoPenalty() public {
        uint256 amount = DEFAULT_STAKE;

        vm.startPrank(user);

        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeB(amount);

        uint256 start = dualPoolStaking.stakeTimestampB(user);
        uint256 unlock = dualPoolStaking.unlockTimeB(user);

        vm.warp(unlock);

        uint256 beforeBal = rewardToken.balanceOf(user);

        dualPoolStaking.withdrawB(amount);

        uint256 afterBal = rewardToken.balanceOf(user);
        uint256 received = afterBal - beforeBal;

        uint256 holdingDuration = unlock - start;

        uint256 expectedFeeBp;
        if (holdingDuration < 90 days) {
            expectedFeeBp = dualPoolStaking.withdrawFeeBP();
        } else if (holdingDuration <= 180 days) {
            expectedFeeBp = dualPoolStaking.midTermFeeBP();
        } else {
            expectedFeeBp = 0;
        }

        uint256 expectedFee = amount * expectedFeeBp / 10000;
        uint256 expectedNet = amount - expectedFee;

        assertApproxEqAbs(received, expectedNet, 1e12);

        vm.stopPrank();
    }

    function testWithdrawBReducesTotalStakedByGrossAmount() public {
        uint256 amount = DEFAULT_STAKE;

        vm.startPrank(user);

        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeB(amount);

        dualPoolStaking.withdrawB(amount);

        uint256 totalStakedB = dualPoolStaking.poolB().totalStaked;
        assertEq(totalStakedB, 0);

        vm.stopPrank();
    }

    function testStakeBUpdatesLockAndTimestamp() public {
        uint256 amount = DEFAULT_STAKE;

        vm.startPrank(user);

        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeB(amount);

        uint256 unlock = dualPoolStaking.unlockTimeB(user);
        uint256 ts = dualPoolStaking.stakeTimestampB(user);

        assertGt(unlock, block.timestamp);
        assertEq(ts, block.timestamp);

        vm.stopPrank();
    }

    function testWithdrawBFeeShortTerm() public {
        uint256 amount = DEFAULT_STAKE;

        vm.startPrank(user);

        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeB(amount);

        vm.warp(block.timestamp + 30 days);

        uint256 beforeBal = rewardToken.balanceOf(user);

        dualPoolStaking.withdrawB(amount);

        uint256 afterBal = rewardToken.balanceOf(user);
        uint256 feeBp = dualPoolStaking.withdrawFeeBP();
        uint256 expectedFee = amount * feeBp / 10000;
        uint256 expectedNet = amount - expectedFee;

        assertApproxEqAbs(afterBal - beforeBal, expectedNet, 1e12);
        assertEq(dualPoolStaking.unclaimedFeesB(), expectedFee);
        vm.stopPrank();
    }

    function testInvariantNormalFlow() public {
        uint256 amount = DEFAULT_STAKE;

        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeB(amount);

        vm.warp(block.timestamp + SHORT_WARP);

        dualPoolStaking.withdrawB(amount);

        vm.stopPrank();
    }

    /// @dev PRD §7.1: in Shutdown, standard claim must remain available (emergency alone blocks it).
    function testClaimAAllowedWhenShutdownAfterEmergency() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.warp(block.timestamp + duration);
        vm.stopPrank();

        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();
        stakingAdmin.activateShutdown();

        vm.startPrank(user);
        uint256 balBefore = rewardToken.balanceOf(user);
        dualPoolStaking.claimA();
        assertGt(rewardToken.balanceOf(user), balBefore);
        vm.stopPrank();
    }

    // ==================== Pool A Edge Cases ====================

    function testStakeAZeroAmountReverts() public {
        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        vm.expectRevert(StakingExecutionErrors.ZeroAmount.selector);
        dualPoolStaking.stakeA(0);
        vm.stopPrank();
    }

    function testStakeABelowMinStakeReverts() public {
        // Set minStakeAmount to 10 ether
        stakingAdmin.setMinStakeAmountA(10 ether);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), 5 ether);
        vm.expectRevert(StakingExecutionErrors.BelowMinStake.selector);
        dualPoolStaking.stakeA(5 ether);
        vm.stopPrank();
    }

    function testStakeAExceedsTVLCapReverts() public {
        // Set TVL cap to 50 ether
        stakingAdmin.setTVLCapA(50 ether);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), 100 ether);
        vm.expectRevert(StakingExecutionErrors.ExceedsTVLCap.selector);
        dualPoolStaking.stakeA(100 ether);
        vm.stopPrank();
    }

    function testWithdrawAZeroReverts() public {
        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        vm.expectRevert(StakingExecutionErrors.ZeroAmount.selector);
        dualPoolStaking.withdrawA(0);
        vm.stopPrank();
    }

    function testWithdrawAExceedsStakeReverts() public {
        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        vm.expectRevert(
            abi.encodeWithSelector(StakingExecutionErrors.InsufficientBalance.selector, 200 ether, DEFAULT_STAKE)
        );
        dualPoolStaking.withdrawA(200 ether);
        vm.stopPrank();
    }

    function testWithdrawAMidRewardPeriodPreservesRewards() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        vm.warp(block.timestamp + SHORT_WARP);

        // Withdraw half before claiming
        dualPoolStaking.withdrawA(HALF_STAKE);

        (uint256 stakedAmount, uint256 rewards,) = dualPoolStaking.userInfoA(user);
        assertEq(stakedAmount, HALF_STAKE);
        // Rewards should have been settled before withdraw
        assertGt(rewards, 0, "Rewards should remain after partial withdraw");

        vm.stopPrank();
    }

    function testStakeAWithTVLCapZeroIsUncapped() public {
        // TVL cap of 0 means uncapped
        stakingAdmin.setTVLCapA(0);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), 1000 ether);
        dualPoolStaking.stakeA(1000 ether);
        (uint256 stakedAmount,,) = dualPoolStaking.userInfoA(user);
        assertEq(stakedAmount, 1000 ether);
        vm.stopPrank();
    }

    // ==================== Pool B Edge Cases ====================

    function testStakeBZeroAmountReverts() public {
        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        vm.expectRevert(StakingExecutionErrors.ZeroAmount.selector);
        dualPoolStaking.stakeB(0);
        vm.stopPrank();
    }

    function testStakeBBelowMinStakeReverts() public {
        stakingAdmin.setMinStakeAmountB(10 ether);

        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), 5 ether);
        vm.expectRevert(StakingExecutionErrors.BelowMinStake.selector);
        dualPoolStaking.stakeB(5 ether);
        vm.stopPrank();
    }

    function testStakeBExceedsTVLCapReverts() public {
        stakingAdmin.setTVLCapB(50 ether);

        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), 100 ether);
        vm.expectRevert(StakingExecutionErrors.ExceedsTVLCap.selector);
        dualPoolStaking.stakeB(100 ether);
        vm.stopPrank();
    }

    function testWithdrawBZeroReverts() public {
        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);

        vm.expectRevert(StakingExecutionErrors.ZeroAmount.selector);
        dualPoolStaking.withdrawB(0);
        vm.stopPrank();
    }

    function testWithdrawBExceedsStakeReverts() public {
        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);

        vm.expectRevert(
            abi.encodeWithSelector(StakingExecutionErrors.InsufficientBalance.selector, 200 ether, DEFAULT_STAKE)
        );
        dualPoolStaking.withdrawB(200 ether);
        vm.stopPrank();
    }

    function testWithdrawBNothingToWithdrawReverts() public {
        vm.startPrank(user);
        vm.expectRevert(abi.encodeWithSelector(StakingExecutionErrors.InsufficientBalance.selector, 1 ether, 0));
        dualPoolStaking.withdrawB(1 ether);
        vm.stopPrank();
    }

    function testStakeBSecondStakeUpdatesWADP() public {
        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);

        uint256 firstTimestamp = dualPoolStaking.stakeTimestampB(user);
        vm.warp(block.timestamp + 100);

        // Additional stake
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);

        uint256 secondTimestamp = dualPoolStaking.stakeTimestampB(user);
        // WADP should be between the two timestamps
        assertGt(secondTimestamp, firstTimestamp);
        assertLt(secondTimestamp, block.timestamp);

        vm.stopPrank();
    }

    /// @notice WADP uses ceiling division so integer truncation cannot systematically pull `stakeTimestampB` down (which inflated holdingDuration / fee-tier jumps under many small stakes).
    function testStakeBWadpUsesCeilWhenRemainder() public {
        vm.warp(100);
        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeB(2 ether);
        assertEq(dualPoolStaking.stakeTimestampB(user), 100);
        vm.warp(200);
        dualPoolStaking.stakeB(1 ether);
        // (2 * 100 + 1 * 200) / 3 = 133.33… → ceil 134 (floor would be 133)
        assertEq(dualPoolStaking.stakeTimestampB(user), 134);
        vm.stopPrank();
    }

    function testStakeBRollingLockDoesNotShorten() public {
        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);

        uint256 firstUnlock = dualPoolStaking.unlockTimeB(user);

        // Wait and stake more — unlock time should not move earlier
        vm.warp(block.timestamp + 2 days);
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);

        uint256 secondUnlock = dualPoolStaking.unlockTimeB(user);
        assertGe(secondUnlock, firstUnlock, "Rolling lock must never shorten");

        vm.stopPrank();
    }

    function testWithdrawBMidTermFee() public {
        uint256 amount = DEFAULT_STAKE;

        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeB(amount);

        // Warp to 120 days (mid-term: 90d < x <= 180d, uses midTermFeeBP = 50)
        vm.warp(block.timestamp + 120 days);

        uint256 beforeBal = rewardToken.balanceOf(user);
        dualPoolStaking.withdrawB(amount);
        uint256 afterBal = rewardToken.balanceOf(user);

        uint256 expectedFee = amount * dualPoolStaking.midTermFeeBP() / 10000;
        uint256 expectedNet = amount - expectedFee;

        assertApproxEqAbs(afterBal - beforeBal, expectedNet, 1e12);
        assertEq(dualPoolStaking.unclaimedFeesB(), expectedFee);
        vm.stopPrank();
    }

    function testWithdrawBNoFeeAfter180Days() public {
        uint256 amount = DEFAULT_STAKE;

        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeB(amount);

        // Warp to 200 days (> 180 days, no fee)
        vm.warp(block.timestamp + 200 days);

        uint256 beforeBal = rewardToken.balanceOf(user);
        dualPoolStaking.withdrawB(amount);
        uint256 afterBal = rewardToken.balanceOf(user);

        // Should receive full amount since fee is 0 after 180 days
        assertApproxEqAbs(afterBal - beforeBal, amount, 1e12);
        assertEq(dualPoolStaking.unclaimedFeesB(), 0);
        vm.stopPrank();
    }

    function testWithdrawBEarlyForfeitsRewards() public {
        // Use a simple single-notify setup to avoid leftover merge complexity.
        // Stake TokenB, then early-withdraw (before unlockTimeB) to trigger forfeiture.
        // The forfeited rewards + penalty should increase availableRewardsB.
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountB(rewardAmount, duration);

        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);

        // Warp within the reward period
        uint256 periodFinish = dualPoolStaking.poolB().periodFinish;
        vm.warp(periodFinish - 1);

        uint256 availableBefore = dualPoolStaking.poolB().availableRewards;

        // Early exit within lock period (7 days from stake) — forfeits rewards
        dualPoolStaking.withdrawB(DEFAULT_STAKE);

        // Forfeited rewards + penalty should flow into availableRewardsB
        uint256 availableAfter = dualPoolStaking.poolB().availableRewards;
        assertGt(availableAfter, availableBefore, "Penalty should increase availableRewardsB");

        vm.stopPrank();
    }

    /// @notice When `penaltyfeeBP == 0`, forfeited rewards still increase `availableRewards` and must re-anchor `rewardRate`.
    function testWithdrawBEarlyZeroPenaltyRecomputesRewardRate() public {
        stakingAdmin.setFees(100, 50, 0);

        uint256 rewardAmount = 1000 ether;
        uint256 duration = 2 days;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountB(rewardAmount, duration);

        address user2 = address(2);
        _mintReward(user2, 1000 ether);

        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeB(HALF_STAKE);
        vm.stopPrank();

        vm.startPrank(user2);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeB(HALF_STAKE);
        vm.stopPrank();

        vm.warp(block.timestamp + 1 days);

        uint256 remTime = dualPoolStaking.poolB().periodFinish - block.timestamp;
        uint256 notifyRate = rewardAmount / duration;

        vm.startPrank(user);
        dualPoolStaking.withdrawB(HALF_STAKE);
        vm.stopPrank();

        PoolInfo memory poolAfter = dualPoolStaking.poolB();
        assertEq(poolAfter.rewardRate, poolAfter.availableRewards / remTime, "rewardRate must track enlarged budget");
        assertGt(poolAfter.rewardRate, notifyRate, "stale notify rate would under-emit forfeited rewards");
    }

    // ==================== Notification Boundary Tests ====================

    function testNotifyRewardAmountAZeroAmountReverts() public {
        vm.expectRevert(StakingExecutionErrors.ZeroAmount.selector);
        dualPoolStaking.notifyRewardAmountA(0, SAFE_DURATION);
    }

    function testNotifyRewardAmountAInvalidDurationTooShort() public {
        vm.expectRevert(StakingExecutionErrors.InvalidRewardDuration.selector);
        dualPoolStaking.notifyRewardAmountA(SAFE_REWARD_AMOUNT, 1 hours);
    }

    function testNotifyRewardAmountAInvalidDurationTooLong() public {
        vm.expectRevert(StakingExecutionErrors.InvalidRewardDuration.selector);
        dualPoolStaking.notifyRewardAmountA(SAFE_REWARD_AMOUNT, 400 days);
    }

    function testNotifyRewardAmountAMergedBudgetTooSmallForDurationReverts() public {
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        vm.expectRevert(
            abi.encodeWithSelector(StakingExecutionErrors.ZeroRewardRate.selector, uint256(1), uint256(1 days))
        );
        dualPoolStaking.notifyRewardAmountA(1, 1 days);
    }

    function testNotifyRewardAmountBMergedBudgetTooSmallForDurationReverts() public {
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        vm.expectRevert(
            abi.encodeWithSelector(StakingExecutionErrors.ZeroRewardRate.selector, uint256(1), uint256(1 days))
        );
        dualPoolStaking.notifyRewardAmountB(1, 1 days);
    }

    function testNotifyRewardAmountAAfterEmergencyModeReverts() public {
        dualPoolStaking.enableEmergencyMode();
        vm.expectRevert();
        dualPoolStaking.notifyRewardAmountA(SAFE_REWARD_AMOUNT, SAFE_DURATION);
    }

    function testNotifyRewardAmountBAfterShutdownReverts() public {
        // Shutdown requires emergency mode first; emergency mode blocks notify first.
        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();
        stakingAdmin.activateShutdown();

        vm.expectRevert(); // EmergencyModeActive (checked before shutdown in admin module)
        dualPoolStaking.notifyRewardAmountB(SAFE_REWARD_AMOUNT, SAFE_DURATION);
    }

    function testNotifyRewardAmountLeftoverMerge() public {
        // First notify: fund for 10 days
        uint256 firstAmount = 10 ether;
        uint256 firstDuration = 10 days;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(firstAmount, firstDuration);

        // Warp 3 days into the period (7 days remaining)
        vm.warp(block.timestamp + 3 days);

        // Second notify: add more rewards — rate should merge leftover
        uint256 secondAmount = 5 ether;
        uint256 secondDuration = 10 days;
        dualPoolStaking.notifyRewardAmountA(secondAmount, secondDuration);

        PoolInfo memory p = dualPoolStaking.poolA();
        // leftover = 7 days * (10 ether / 10 days) = 7 ether
        // newRate = (5 ether + 7 ether) / 10 days = 1.2 ether / 10 days
        uint256 expectedRate = (5 ether + 7 ether) / secondDuration;
        assertEq(p.rewardRate, expectedRate);
    }

    // ==================== Claim / Cooldown / BadDebt Tests ====================

    function testClaimACooldownReverts() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        vm.warp(block.timestamp + duration);

        // First claim succeeds
        dualPoolStaking.claimA();

        // Second claim within cooldown reverts
        vm.warp(block.timestamp + 1 hours); // only 1 hour later
        vm.expectRevert();
        dualPoolStaking.claimA();

        vm.stopPrank();
    }

    function testClaimBNoRewardsReverts() public {
        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);

        vm.expectRevert(StakingExecutionErrors.NoRewardsToClaim.selector);
        dualPoolStaking.claimB();

        vm.stopPrank();
    }

    function testClaimABadDebtReverts() public {
        // Set up a normal reward notification and user stake.
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        // Warp to distribute rewards to users
        vm.warp(block.timestamp + 1 hours);

        // Verify user has rewards before the badDebt check
        // A global update + settle will happen during claimA

        // Use vm.store to directly set badDebt on poolA (slot 17 + offset 7 = slot 24).
        // This simulates bad debt created when distribution exceeds available rewards.
        bytes32 badDebtSlot = bytes32(uint256(24));
        vm.store(address(dualPoolStaking), badDebtSlot, bytes32(uint256(1)));

        assertGt(dualPoolStaking.poolA().badDebt, 0, "Should have badDebt");

        vm.expectRevert(StakingExecutionErrors.BadDebtExists.selector);
        dualPoolStaking.claimA();

        vm.stopPrank();
    }

    function testClaimBelowMinClaimAmountReverts() public {
        // minClaimAmount defaults to 0. Warp forward and claim to get small rewards,
        // then set minClaimAmount to a valid value and try to claim with rewards below it.
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        // Claim first to set lastClaimTime (first claim exempt from cooldown)
        vm.warp(block.timestamp + duration);
        dualPoolStaking.claimA();
        vm.stopPrank();

        // Now set a valid minClaimAmount (max is 1e17) - called by test contract (admin)
        stakingAdmin.setMinClaimAmount(1e16);

        vm.startPrank(user);
        // Wait for cooldown (1 day)
        vm.warp(block.timestamp + dualPoolStaking.claimCooldown() + 1);

        // Notify more rewards - called by test contract (operator), not user
        vm.stopPrank();
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(SAFE_REWARD_AMOUNT, duration);

        vm.startPrank(user);
        // Wait only 1 second — rewards won't reach 1e16
        // With 5 ether / 1 day and 100 ether stake: ~57870370370370 wei/sec
        // After 1 sec, earned ≈ 57870370370370 which is below 1e16 (10000000000000000)
        // Actually 57870370370370 > 1e16, so we need an even shorter wait.
        // But block.timestamp only advances in whole seconds. Set minClaimAmount higher instead.
        vm.stopPrank();

        // Re-set minClaimAmount to a very high value
        stakingAdmin.setMinClaimAmount(1e17); // max allowed

        vm.startPrank(user);
        vm.warp(block.timestamp + 1);

        // Now the user's rewards (57870370370370) are below minClaimAmount (1e17)
        vm.expectRevert();
        dualPoolStaking.claimA();

        vm.stopPrank();
    }

    // ==================== Pause / Unpause Tests ====================

    function testFirstClaimExemptFromCooldown() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        vm.warp(block.timestamp + duration);

        // First claim always succeeds (lastClaimTime is 0)
        dualPoolStaking.claimA();

        // Verify lastClaimTime was set
        assertGt(dualPoolStaking.lastClaimTime(user), 0);

        vm.stopPrank();
    }

    function testPauseBlocksStakeA() public {
        dualPoolStaking.pause();

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        vm.expectRevert();
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();
    }

    function testPauseBlocksStakeB() public {
        dualPoolStaking.pause();

        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        vm.expectRevert();
        dualPoolStaking.stakeB(DEFAULT_STAKE);
        vm.stopPrank();
    }

    function testPauseBlocksWithdrawA() public {
        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();

        dualPoolStaking.pause();

        vm.startPrank(user);
        vm.expectRevert();
        dualPoolStaking.withdrawA(DEFAULT_STAKE);
        vm.stopPrank();
    }

    function testPauseBlocksWithdrawB() public {
        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);
        vm.stopPrank();

        dualPoolStaking.pause();

        vm.startPrank(user);
        vm.expectRevert();
        dualPoolStaking.withdrawB(DEFAULT_STAKE);
        vm.stopPrank();
    }

    function testPauseBlocksClaimA() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.warp(block.timestamp + duration);
        vm.stopPrank();

        dualPoolStaking.pause();

        vm.startPrank(user);
        vm.expectRevert();
        dualPoolStaking.claimA();
        vm.stopPrank();
    }

    function testPauseBlocksCompoundB() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.warp(block.timestamp + SHORT_WARP);
        vm.stopPrank();

        dualPoolStaking.pause();

        vm.startPrank(user);
        vm.expectRevert();
        dualPoolStaking.compoundB();
        vm.stopPrank();
    }

    function testUnpauseAfterCooldown() public {
        dualPoolStaking.pause();
        uint256 unpauseAt = dualPoolStaking.unpauseAt();

        // Warp to exactly unpause time
        vm.warp(unpauseAt);

        stakingAdmin.unpause();
        assertEq(dualPoolStaking.paused(), false);
    }

    function testUnpauseBeforeCooldownReverts() public {
        dualPoolStaking.pause();
        uint256 unpauseAt = dualPoolStaking.unpauseAt();

        // Warp to just before cooldown
        vm.warp(unpauseAt - 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                bytes4(keccak256("UnpauseCooldownPending(uint256,uint256)")), unpauseAt, block.timestamp
            )
        );
        stakingAdmin.unpause();
    }

    function testUnpauseExtendsRewardPeriods() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);

        uint256 originalFinish = dualPoolStaking.poolA().periodFinish;

        // Warp 1 day and pause
        vm.warp(block.timestamp + 1 days);
        dualPoolStaking.pause();

        // Wait cooldown and unpause
        vm.warp(dualPoolStaking.unpauseAt());
        stakingAdmin.unpause();

        // Period finish should be extended by the pause duration
        uint256 newFinish = dualPoolStaking.poolA().periodFinish;
        assertGt(newFinish, originalFinish);
    }

    /// @notice Long idle + pause + unpause must not skip pre-pause rewards into orphan `availableRewards`.
    function testPauseCatchUpAfterLongIdlePreservesRewards() public {
        uint256 rewardAmount = 36_500 ether;
        uint256 duration = 365 days;
        uint256 idle = 100 days;
        _mintReward(address(this), rewardAmount);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();

        uint256 pauseAt = block.timestamp + idle;
        vm.warp(pauseAt);
        dualPoolStaking.pause();

        PoolInfo memory poolAtPause = dualPoolStaking.poolA();
        assertEq(poolAtPause.lastUpdateTime, pauseAt, "pause must catch up accrual to pause time");

        uint256 expectedAccrued = rewardAmount * idle / duration;
        assertApproxEqAbs(poolAtPause.totalPending, expectedAccrued, 1 ether, "totalPending reflects full idle window");

        vm.warp(dualPoolStaking.unpauseAt());
        stakingAdmin.unpause();

        uint256 balBefore = rewardToken.balanceOf(user);
        vm.prank(user);
        dualPoolStaking.claimA();
        uint256 claimed = rewardToken.balanceOf(user) - balBefore;

        assertApproxEqAbs(claimed, expectedAccrued, 1 ether, "user receives full idle-window rewards after unpause");

        PoolInfo memory poolAfter = dualPoolStaking.poolA();
        uint256 orphanIfSkipped = rewardAmount * (idle - 30 days) / duration;
        assertLt(
            _movableRebalanceBudget(poolAfter),
            1 ether,
            "movable budget must not include multi-day skipped-accrual orphan"
        );
        assertGt(orphanIfSkipped, 1000 ether, "sanity: pre-fix orphan would have been thousands of tokens");
    }

    function testCannotPauseWhenAlreadyPaused() public {
        dualPoolStaking.pause();
        vm.expectRevert();
        dualPoolStaking.pause();
    }

    function testCannotUnpauseWhenNotPaused() public {
        vm.prank(address(stakingAdmin));
        vm.expectRevert();
        dualPoolStaking.unpause();
    }

    // ==================== Emergency Mode Tests ====================

    function testEnableEmergencyMode() public {
        dualPoolStaking.enableEmergencyMode();
        assertEq(dualPoolStaking.emergencyMode(), true);
        assertGt(dualPoolStaking.emergencyActivatedAt(), 0);
    }

    function testEmergencyModeBlocksStakeA() public {
        dualPoolStaking.enableEmergencyMode();

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        vm.expectRevert();
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();
    }

    function testEmergencyModeBlocksStakeB() public {
        dualPoolStaking.enableEmergencyMode();

        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        vm.expectRevert();
        dualPoolStaking.stakeB(DEFAULT_STAKE);
        vm.stopPrank();
    }

    function testEmergencyModeBlocksCompound() public {
        dualPoolStaking.enableEmergencyMode();

        vm.startPrank(user);
        vm.expectRevert();
        dualPoolStaking.compoundB();
        vm.stopPrank();
    }

    function testEmergencyModeBlocksNotifyReward() public {
        dualPoolStaking.enableEmergencyMode();

        vm.expectRevert();
        dualPoolStaking.notifyRewardAmountA(SAFE_REWARD_AMOUNT, SAFE_DURATION);
    }

    function testEmergencyWithdrawA() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        vm.warp(block.timestamp + SHORT_WARP);
        vm.stopPrank();

        // Enable emergency mode
        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();

        vm.startPrank(user);
        uint256 tokenABefore = stakingToken.balanceOf(user);
        dualPoolStaking.emergencyWithdrawA();
        uint256 tokenAAfter = stakingToken.balanceOf(user);

        // User should get their full principal back
        assertEq(tokenAAfter - tokenABefore, DEFAULT_STAKE);

        // User stake should be zeroed
        (uint256 staked,,) = dualPoolStaking.userInfoA(user);
        assertEq(staked, 0);

        vm.stopPrank();
    }

    function testEmergencyWithdrawAForfeitsRewardsToPoolB() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);

        // Stake and warp to accumulate rewards
        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        // Warp to well within the reward period
        vm.warp(block.timestamp + 1 hours);

        // Do a tiny stake to trigger global update + settle (distributes rewards)
        _mintStaking(user, 1 ether);
        stakingToken.approve(address(dualPoolStaking), 1 ether);
        dualPoolStaking.stakeA(1 wei);

        // Now the user has poolA rewards that will be forfeited
        uint256 poolBAvailableBefore = dualPoolStaking.poolB().availableRewards;

        vm.stopPrank();

        // Enable emergency mode
        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();

        // Emergency withdraw forfeits poolA rewards to poolB
        vm.prank(user);
        dualPoolStaking.emergencyWithdrawA();

        // Pool B should have more availableRewards from the forfeited A rewards
        uint256 poolBAvailableAfter = dualPoolStaking.poolB().availableRewards;
        assertGt(poolBAvailableAfter, poolBAvailableBefore, "Forfeited A rewards should go to B");
    }

    /// @notice Second staker triggers global accrual while the first user’s `rewards` row is stale; emergency must settle before forfeiting.
    function testEmergencyWithdrawAAccruesBeforeForfeitTwoStakers() public {
        address other = address(0x2222);
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();

        _mintStaking(other, 1000 ether);
        vm.startPrank(other);
        stakingToken.approve(address(dualPoolStaking), 10 ether);
        dualPoolStaking.stakeA(10 ether);
        vm.stopPrank();

        vm.warp(block.timestamp + 1 days);

        vm.startPrank(other);
        stakingToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeA(1 wei);
        vm.stopPrank();

        (, uint256 u1RewBefore,) = dualPoolStaking.userInfoA(user);
        assertEq(u1RewBefore, 0, "user1 rewards unsettled until next touch");

        uint256 poolBAvailableBefore = dualPoolStaking.poolB().availableRewards;
        uint256 pendingABefore = dualPoolStaking.poolA().totalPending;

        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();

        vm.prank(user);
        dualPoolStaking.emergencyWithdrawA();

        (, uint256 u1RewAfter,) = dualPoolStaking.userInfoA(user);
        assertEq(u1RewAfter, 0);
        assertGt(dualPoolStaking.poolB().availableRewards, poolBAvailableBefore, "forfeited accrual to pool B");
        assertLt(dualPoolStaking.poolA().totalPending, pendingABefore, "pending debited for forfeited amount");
    }

    function testEmergencyWithdrawB() public {
        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);

        uint256 balBefore = rewardToken.balanceOf(user);
        vm.stopPrank();

        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();

        vm.startPrank(user);
        dualPoolStaking.emergencyWithdrawB();
        uint256 balAfter = rewardToken.balanceOf(user);

        // User gets principal back (no penalty in emergency)
        assertEq(balAfter - balBefore, DEFAULT_STAKE);

        (uint256 staked,,) = dualPoolStaking.userInfoB(user);
        assertEq(staked, 0);

        vm.stopPrank();
    }

    function testEmergencyWithdrawANoStakeReverts() public {
        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();

        vm.startPrank(user);
        vm.expectRevert(StakingExecutionErrors.NothingToWithdraw.selector);
        dualPoolStaking.emergencyWithdrawA();
        vm.stopPrank();
    }

    function testEmergencyWithdrawBNoStakeReverts() public {
        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();

        vm.startPrank(user);
        vm.expectRevert(StakingExecutionErrors.NothingToWithdraw.selector);
        dualPoolStaking.emergencyWithdrawB();
        vm.stopPrank();
    }

    function testEmergencyWithdrawNotAllowedInShutdown() public {
        // First stake
        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();

        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();
        stakingAdmin.activateShutdown();

        // In shutdown mode (with emergency active), emergencyWithdraw should revert with ShutdownModeActive
        vm.startPrank(user);
        vm.expectRevert(StakingExecutionErrors.ShutdownModeActive.selector);
        dualPoolStaking.emergencyWithdrawA();
        vm.stopPrank();
    }

    function testEmergencyModeIsIrreversible() public {
        dualPoolStaking.enableEmergencyMode();
        // Try to enable again — should revert
        vm.expectRevert();
        dualPoolStaking.enableEmergencyMode();
    }

    function testPauseDuringEmergencyStillAllowsEmergencyWithdraw() public {
        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();

        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();
        dualPoolStaking.pause();

        // Emergency withdraw should still work despite pause
        vm.prank(user);
        dualPoolStaking.emergencyWithdrawA();

        (uint256 staked,,) = dualPoolStaking.userInfoA(user);
        assertEq(staked, 0);
    }

    // ==================== Admin / Setter Tests ====================

    function testSetTVLCapA() public {
        stakingAdmin.setTVLCapA(100 ether);
        assertEq(dualPoolStaking.poolA().tvlCap, 100 ether);
    }

    function testSetTVLCapB() public {
        stakingAdmin.setTVLCapB(200 ether);
        assertEq(dualPoolStaking.poolB().tvlCap, 200 ether);
    }

    function testSetMinStakeAmountA() public {
        stakingAdmin.setMinStakeAmountA(5 ether);
        assertEq(dualPoolStaking.poolA().minStakeAmount, 5 ether);
    }

    function testSetMinStakeAmountB() public {
        stakingAdmin.setMinStakeAmountB(8 ether);
        assertEq(dualPoolStaking.poolB().minStakeAmount, 8 ether);
    }

    function testSetFees() public {
        stakingAdmin.setFees(200, 100, 1500);
        assertEq(dualPoolStaking.withdrawFeeBP(), 200);
        assertEq(dualPoolStaking.midTermFeeBP(), 100);
        assertEq(dualPoolStaking.penaltyfeeBP(), 1500);
    }

    function testSetFeesExceedsMaxReverts() public {
        // withdrawFeeBP > MAX_WITHDRAW_BP (500)
        vm.expectRevert();
        stakingAdmin.setFees(600, 50, 1000);
    }

    function testSetFeesMidTermExceedsMaxReverts() public {
        vm.expectRevert();
        stakingAdmin.setFees(100, 600, 1000);
    }

    function testSetFeesPenaltyExceedsMaxReverts() public {
        vm.expectRevert();
        stakingAdmin.setFees(100, 50, 2500);
    }

    function testSetLockDuration() public {
        stakingAdmin.setLockDuration(14 days);
        assertEq(dualPoolStaking.lockDuration(), 14 days);
    }

    function testSetLockDurationExceedsMaxReverts() public {
        vm.expectRevert();
        stakingAdmin.setLockDuration(100 days);
    }

    function testSetLockDurationZeroReverts() public {
        vm.expectRevert();
        stakingAdmin.setLockDuration(0);
    }

    function testSetMinClaimAmount() public {
        stakingAdmin.setMinClaimAmount(1e15);
        assertEq(dualPoolStaking.minClaimAmount(), 1e15);
    }

    function testSetMinClaimAmountExceedsMaxReverts() public {
        vm.expectRevert();
        stakingAdmin.setMinClaimAmount(1e18); // > MAX_MIN_CLAIM_AMOUNT (1e17)
    }

    function testSetFeeRecipient() public {
        address newRecipient = address(0x1234);
        stakingAdmin.setFeeRecipient(newRecipient);
        assertEq(dualPoolStaking.feeRecipient(), newRecipient);
    }

    function testSetFeeRecipientZeroReverts() public {
        vm.expectRevert(StakingExecutionErrors.ZeroAddress.selector);
        stakingAdmin.setFeeRecipient(address(0));
    }

    function testSetFeeRecipientCoreReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(StakingExecutionErrors.InvalidRecipient.selector, address(dualPoolStaking))
        );
        stakingAdmin.setFeeRecipient(address(dualPoolStaking));
    }

    function testSetRewardDurationA() public {
        stakingAdmin.setRewardDurationA(30 days);
        assertEq(dualPoolStaking.poolA().rewardDuration, 30 days);
    }

    function testSetRewardDurationB() public {
        stakingAdmin.setRewardDurationB(60 days);
        assertEq(dualPoolStaking.poolB().rewardDuration, 60 days);
    }

    function testSetRewardDurationAOutOfBoundsReverts() public {
        vm.expectRevert(StakingExecutionErrors.InvalidRewardDuration.selector);
        stakingAdmin.setRewardDurationA(1 hours);
    }

    function testNotifyRewardAmountAUsesConfiguredRewardDurationWhenArgZero() public {
        stakingAdmin.setRewardDurationA(30 days);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        uint256 t0 = block.timestamp;
        dualPoolStaking.notifyRewardAmountA(SAFE_REWARD_AMOUNT, 0);
        assertEq(dualPoolStaking.poolA().periodFinish, t0 + 30 days);
    }

    function testNotifyRewardAmountAZeroDurationRevertsWhenRewardDurationUnset() public {
        assertEq(dualPoolStaking.poolA().rewardDuration, 0);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        vm.expectRevert(StakingExecutionErrors.InvalidRewardDuration.selector);
        dualPoolStaking.notifyRewardAmountA(SAFE_REWARD_AMOUNT, 0);
    }

    function testSetMaxTransferFeeBP() public {
        stakingAdmin.setMaxTransferFeeBP(500);
        assertEq(dualPoolStaking.maxTransferFeeBP(), 500);
    }

    function testSetMaxTransferFeeBPExceedsBasisPointsReverts() public {
        vm.expectRevert(StakingExecutionErrors.InvalidMaxTransferFeeBp.selector);
        stakingAdmin.setMaxTransferFeeBP(10001);
    }

    function testSetMinEarlyExitAmountB() public {
        stakingAdmin.setMinEarlyExitAmountB(100);
        assertEq(dualPoolStaking.minEarlyExitAmountB(), 100);
    }

    function testSetMinEarlyExitAmountBTooLowReverts() public {
        // With penaltyfeeBP = 1000, minRequired = (10000 + 1000 - 1) / 1000 = 10
        vm.expectRevert();
        stakingAdmin.setMinEarlyExitAmountB(5);
    }

    function testSetMinEarlyExitAmountBZeroReverts() public {
        vm.expectRevert(StakingExecutionErrors.ZeroAmount.selector);
        stakingAdmin.setMinEarlyExitAmountB(0);
    }

    function testNonAdminCannotSetFees() public {
        vm.startPrank(user);
        vm.expectRevert();
        stakingAdmin.setFees(100, 50, 1000);
        vm.stopPrank();
    }

    function testNonAdminCannotSetTVLCap() public {
        vm.startPrank(user);
        vm.expectRevert();
        stakingAdmin.setTVLCapA(100 ether);
        vm.stopPrank();
    }

    function testSetUserModuleZeroReverts() public {
        vm.expectRevert(StakingExecutionErrors.ZeroAddress.selector);
        dualPoolStaking.setUserModule(address(0));
    }

    function testSetAdminModuleZeroReverts() public {
        vm.expectRevert(StakingExecutionErrors.ZeroAddress.selector);
        dualPoolStaking.setAdminModule(address(0));
    }

    function testSetUserModuleNotAContractReverts() public {
        address eoa = makeAddr("user-module-eoa");
        vm.expectRevert(abi.encodeWithSelector(StakingExecutionErrors.NotAContract.selector, eoa));
        dualPoolStaking.setUserModule(eoa);
    }

    function testSetAdminModuleNotAContractReverts() public {
        address empty = address(0xBEEF);
        vm.expectRevert(abi.encodeWithSelector(StakingExecutionErrors.NotAContract.selector, empty));
        dualPoolStaking.setAdminModule(empty);
    }

    function testSetUserModuleViaAdminFacadeNotAContractReverts() public {
        dualPoolStaking.grantRole(dualPoolStaking.DEFAULT_ADMIN_ROLE(), address(stakingAdmin));
        address eoa = makeAddr("facade-user-module-eoa");
        vm.expectRevert(abi.encodeWithSelector(StakingExecutionErrors.NotAContract.selector, eoa));
        stakingAdmin.setUserModule(eoa);
    }

    /// @dev Regression: bad module pointer must not be written; existing delegate path keeps working.
    function testSetUserModuleNotAContractPreservesPointerAndStakeWorks() public {
        address moduleBefore = dualPoolStaking.userModule();
        address eoa = makeAddr("bad-module-pointer");
        vm.expectRevert(abi.encodeWithSelector(StakingExecutionErrors.NotAContract.selector, eoa));
        dualPoolStaking.setUserModule(eoa);
        assertEq(dualPoolStaking.userModule(), moduleBefore);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        (uint256 stakedAmount,,) = dualPoolStaking.userInfoA(user);
        assertEq(stakedAmount, DEFAULT_STAKE);
        vm.stopPrank();
    }

    function testSetAdmin() public {
        address newAdmin = address(0xABCD);
        dualPoolStaking.setAdmin(newAdmin, true);
        assertTrue(dualPoolStaking.hasRole(dualPoolStaking.ADMIN_ROLE(), newAdmin));

        dualPoolStaking.setAdmin(newAdmin, false);
        assertFalse(dualPoolStaking.hasRole(dualPoolStaking.ADMIN_ROLE(), newAdmin));
    }

    /// @notice Governance facade must hold `DEFAULT_ADMIN_ROLE` on core for `setAdmin` / `setOperator` / module pointer updates (see deploy script).
    function testStakingAdminSuperPathsWithDefaultAdminRole() public {
        dualPoolStaking.grantRole(dualPoolStaking.DEFAULT_ADMIN_ROLE(), address(stakingAdmin));
        address newAdmin = address(0xCAFE);
        stakingAdmin.setAdmin(newAdmin, true);
        assertTrue(dualPoolStaking.hasRole(dualPoolStaking.ADMIN_ROLE(), newAdmin));
        stakingAdmin.setAdmin(newAdmin, false);
        assertFalse(dualPoolStaking.hasRole(dualPoolStaking.ADMIN_ROLE(), newAdmin));

        address newOp = address(0xD00D);
        stakingAdmin.setOperator(newOp, true);
        assertTrue(dualPoolStaking.hasRole(dualPoolStaking.OPERATOR_ROLE(), newOp));
        stakingAdmin.setOperator(newOp, false);
        assertFalse(dualPoolStaking.hasRole(dualPoolStaking.OPERATOR_ROLE(), newOp));

        DualPoolUserModule freshUser = new DualPoolUserModule();
        stakingAdmin.setUserModule(address(freshUser));
        assertEq(dualPoolStaking.userModule(), address(freshUser));
        DualPoolAdminModule freshAdmin = new DualPoolAdminModule();
        stakingAdmin.setAdminModule(address(freshAdmin));
        assertEq(dualPoolStaking.adminModule(), address(freshAdmin));
    }

    function testSetOperator() public {
        address newOp = address(0xBEEF);
        dualPoolStaking.setOperator(newOp, true);
        assertTrue(dualPoolStaking.hasRole(dualPoolStaking.OPERATOR_ROLE(), newOp));

        dualPoolStaking.setOperator(newOp, false);
        assertFalse(dualPoolStaking.hasRole(dualPoolStaking.OPERATOR_ROLE(), newOp));
    }

    function testNonOperatorNotifyRewardReverts() public {
        vm.startPrank(user);
        vm.expectRevert();
        dualPoolStaking.notifyRewardAmountA(SAFE_REWARD_AMOUNT, SAFE_DURATION);
        vm.stopPrank();
    }

    // ==================== Shutdown Lifecycle Tests ====================

    function testActivateShutdownNotInEmergencyReverts() public {
        vm.expectRevert(StakingExecutionErrors.NotInEmergency.selector);
        stakingAdmin.activateShutdown();
    }

    function testActivateShutdownAlreadyActiveReverts() public {
        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();
        stakingAdmin.activateShutdown();

        vm.expectRevert();
        stakingAdmin.activateShutdown();
    }

    function testForceShutdownFinalizeNotShutdownReverts() public {
        vm.expectRevert(StakingExecutionErrors.NotShutdown.selector);
        stakingAdmin.forceShutdownFinalize();
    }

    function testForceShutdownFinalizeGracePeriodNotMet() public {
        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();
        stakingAdmin.activateShutdown();

        // Grace period is 365 days
        vm.warp(dualPoolStaking.shutdownAt() + 364 days);

        vm.expectRevert(StakingExecutionErrors.GracePeriodNotMet.selector);
        stakingAdmin.forceShutdownFinalize();
    }

    function testForceShutdownFinalizeStillStaked() public {
        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();

        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();
        stakingAdmin.activateShutdown();

        // Warp to just past grace period (365 days)
        vm.warp(dualPoolStaking.shutdownAt() + 365 days + 1);

        // Should fail because there's still stake
        vm.expectRevert(StakingExecutionErrors.StillStaked.selector);
        stakingAdmin.forceShutdownFinalize();
    }

    function testForceShutdownFinalizeSuccess() public {
        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();
        stakingAdmin.activateShutdown();

        // Warp past grace period
        vm.warp(dualPoolStaking.shutdownAt() + 365 days + 1);

        // No staked principal — should succeed
        stakingAdmin.forceShutdownFinalize();

        // Verify buckets are zeroed
        assertEq(dualPoolStaking.poolA().totalPending, 0);
        assertEq(dualPoolStaking.poolB().totalPending, 0);
        assertEq(dualPoolStaking.poolA().availableRewards, 0);
        assertEq(dualPoolStaking.poolB().availableRewards, 0);
        assertEq(dualPoolStaking.unclaimedFeesB(), 0);
    }

    /// @notice After finalize, `totalPending` must still cover booked user rewards so a user who exited principal during shutdown can `claimA`.
    function testForceShutdownFinalizeRetainsBookedPendingForClaimAfterWithdrawA() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();

        vm.warp(block.timestamp + duration / 2);

        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();
        stakingAdmin.activateShutdown();

        vm.startPrank(user);
        dualPoolStaking.withdrawA(DEFAULT_STAKE);
        (, uint256 rewardsBeforeFinalize,) = dualPoolStaking.userInfoA(user);
        assertGt(rewardsBeforeFinalize, 0);
        vm.stopPrank();

        assertEq(dualPoolStaking.bookedUserRewardsA(), rewardsBeforeFinalize);

        vm.warp(dualPoolStaking.shutdownAt() + 365 days + 1);
        stakingAdmin.forceShutdownFinalize();

        assertEq(dualPoolStaking.poolA().totalPending, rewardsBeforeFinalize);
        assertEq(dualPoolStaking.bookedUserRewardsA(), rewardsBeforeFinalize);

        uint256 balBefore = rewardToken.balanceOf(user);
        vm.prank(user);
        dualPoolStaking.claimA();
        assertGt(rewardToken.balanceOf(user), balBefore);
        (, uint256 rewardsAfter,) = dualPoolStaking.userInfoA(user);
        assertEq(rewardsAfter, 0);
        assertEq(dualPoolStaking.poolA().totalPending, 0);
        assertEq(dualPoolStaking.bookedUserRewardsA(), 0);
    }

    function testWithdrawAllowedDuringShutdown() public {
        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();

        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();
        stakingAdmin.activateShutdown();

        // During shutdown, normal withdraw should be allowed
        vm.startPrank(user);
        dualPoolStaking.withdrawA(DEFAULT_STAKE);
        (uint256 staked,,) = dualPoolStaking.userInfoA(user);
        assertEq(staked, 0);
        vm.stopPrank();
    }

    // ==================== Rebalance / ClaimFees / ResolveBadDebt / RecoverToken Tests ====================

    function testRebalanceBudgets() public {
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(SAFE_REWARD_AMOUNT, SAFE_DURATION);
        vm.warp(block.timestamp + SAFE_DURATION + 1);

        uint256 poolABefore = dualPoolStaking.poolA().availableRewards;
        uint256 poolBBefore = dualPoolStaking.poolB().availableRewards;

        stakingAdmin.rebalanceBudgets(Pool.A, Pool.B, 1 ether);

        assertEq(dualPoolStaking.poolA().availableRewards, poolABefore - 1 ether);
        assertEq(dualPoolStaking.poolB().availableRewards, poolBBefore + 1 ether);
    }

    function testRebalanceDuringActiveEmissionReverts() public {
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(SAFE_REWARD_AMOUNT, SAFE_DURATION);

        PoolInfo memory pa = dualPoolStaking.poolA();
        uint256 movable = _movableRebalanceBudget(pa);
        assertLt(movable, 1 ether, "active schedule must reserve nearly all budget");

        vm.expectRevert(
            abi.encodeWithSelector(StakingExecutionErrors.RebalanceExceedsMovableBudget.selector, 1 ether, movable)
        );
        stakingAdmin.rebalanceBudgets(Pool.A, Pool.B, 1 ether);
    }

    function testRebalanceFromActivePoolDoesNotCauseBadDebt() public {
        uint256 rewardAmount = 100 ether;
        uint256 duration = 10 days;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();

        PoolInfo memory pa = dualPoolStaking.poolA();
        uint256 movable = _movableRebalanceBudget(pa);
        assertLt(movable, 80 ether, "active schedule must reserve emission budget");

        vm.expectRevert(
            abi.encodeWithSelector(StakingExecutionErrors.RebalanceExceedsMovableBudget.selector, 80 ether, movable)
        );
        stakingAdmin.rebalanceBudgets(Pool.A, Pool.B, 80 ether);

        vm.warp(block.timestamp + duration);
        vm.prank(user);
        dualPoolStaking.claimA();
        assertEq(dualPoolStaking.poolA().badDebt, 0, "blocked rebalance must not leave latent badDebt");
    }

    function testRebalanceZeroAmountReverts() public {
        vm.expectRevert(StakingExecutionErrors.ZeroAmount.selector);
        stakingAdmin.rebalanceBudgets(Pool.A, Pool.B, 0);
    }

    function testRebalanceAfterEmergencyModeReverts() public {
        dualPoolStaking.enableEmergencyMode();
        vm.expectRevert(DualPoolStaking.EmergencyModeActive.selector);
        stakingAdmin.rebalanceBudgets(Pool.A, Pool.B, 1 ether);
    }

    function testRebalanceAfterShutdownReverts() public {
        dualPoolStaking.enableEmergencyMode();
        stakingAdmin.activateShutdown();
        vm.expectRevert(DualPoolStaking.EmergencyModeActive.selector);
        stakingAdmin.rebalanceBudgets(Pool.A, Pool.B, 1 ether);
    }

    function testRebalanceSamePoolReverts() public {
        vm.expectRevert(StakingExecutionErrors.SamePool.selector);
        stakingAdmin.rebalanceBudgets(Pool.A, Pool.A, 1 ether);
    }

    function testRebalanceInsufficientBalanceReverts() public {
        vm.expectRevert();
        stakingAdmin.rebalanceBudgets(Pool.A, Pool.B, 1000 ether);
    }

    function testRebalanceBadDebtExistsReverts() public {
        // Set up a normal notification, then use vm.store to create bad debt.
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);

        bytes32 badDebtSlot = bytes32(uint256(24));
        vm.store(address(dualPoolStaking), badDebtSlot, bytes32(uint256(1)));

        assertGt(dualPoolStaking.poolA().badDebt, 0, "Should have badDebt");

        vm.expectRevert(StakingExecutionErrors.BadDebtExists.selector);
        stakingAdmin.rebalanceBudgets(Pool.A, Pool.B, 1 wei);
    }

    function testClaimFees() public {
        // First, create some fees by withdrawing from Pool B
        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);

        // Warp 30 days for short-term fee
        vm.warp(block.timestamp + 30 days);
        dualPoolStaking.withdrawB(DEFAULT_STAKE);
        vm.stopPrank();

        uint256 fees = dualPoolStaking.unclaimedFeesB();
        assertGt(fees, 0, "Should have unclaimed fees");

        address feeRecipient = dualPoolStaking.feeRecipient();
        uint256 recipientBefore = rewardToken.balanceOf(feeRecipient);

        stakingAdmin.claimFees();

        assertEq(dualPoolStaking.unclaimedFeesB(), 0);
        assertEq(rewardToken.balanceOf(feeRecipient), recipientBefore + fees);
    }

    function testClaimFeesNoFeesReverts() public {
        vm.expectRevert(StakingExecutionErrors.NoFeesToClaim.selector);
        stakingAdmin.claimFees();
    }

    function testResolveBadDebt() public {
        // Set up a normal notification, then use vm.store to create bad debt.
        uint256 rewardAmount = 100 ether;
        uint256 duration = 30 days;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);

        // Set badDebt directly via vm.store (slot 17 + offset 7 = slot 24)
        bytes32 badDebtSlot = bytes32(uint256(24));
        uint256 badDebtAmount = 1 ether;
        vm.store(address(dualPoolStaking), badDebtSlot, bytes32(uint256(badDebtAmount)));

        uint256 badDebtBefore = dualPoolStaking.poolA().badDebt;
        assertEq(badDebtBefore, badDebtAmount, "Should have badDebt");

        // Resolve bad debt: tokens are pulled from timelockGovernance (facade passes msg.sender as payer).
        _mintReward(address(this), badDebtBefore);
        stakingAdmin.resolveBadDebt(badDebtBefore);

        assertEq(dualPoolStaking.poolA().badDebt, 0);
    }

    function testResolveBadDebtNoBadDebtReverts() public {
        rewardToken.approve(address(dualPoolStaking), 1 ether);
        vm.expectRevert(StakingExecutionErrors.NoBadDebt.selector);
        stakingAdmin.resolveBadDebt(1 ether);
    }

    function testEmergencyWithdrawARecomputesPoolBRewardRate() public {
        _mintReward(address(this), 2000 ether);
        uint256 rewardB = 1000 ether;
        uint256 durationB = 2 days;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountB(rewardB, durationB);

        address user2 = address(2);
        _mintReward(user2, 1000 ether);
        vm.startPrank(user2);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeB(HALF_STAKE);
        vm.stopPrank();

        dualPoolStaking.notifyRewardAmountA(SAFE_REWARD_AMOUNT, SAFE_DURATION);
        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.warp(block.timestamp + 1 hours);
        _mintStaking(user, 1 ether);
        stakingToken.approve(address(dualPoolStaking), 1 ether);
        dualPoolStaking.stakeA(1 wei);
        vm.stopPrank();

        vm.warp(block.timestamp + 1 days - 1 hours);

        uint256 remTime = dualPoolStaking.poolB().periodFinish - block.timestamp;
        uint256 rateBefore = dualPoolStaking.poolB().rewardRate;

        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();
        vm.prank(user);
        dualPoolStaking.emergencyWithdrawA();

        PoolInfo memory pb = dualPoolStaking.poolB();
        assertEq(pb.rewardRate, pb.availableRewards / remTime, "pool B rate must track forfeited A rewards");
        assertGt(pb.rewardRate, rateBefore, "stale rate would under-emit forfeited rewards");
    }

    function testEmergencyWithdrawBRecomputesRewardRate() public {
        stakingAdmin.setFees(100, 50, 0);

        uint256 rewardB = 1000 ether;
        uint256 durationB = 2 days;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountB(rewardB, durationB);

        address user2 = address(2);
        _mintReward(user2, 1000 ether);

        vm.startPrank(user2);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeB(HALF_STAKE);
        vm.stopPrank();

        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeB(HALF_STAKE);
        vm.stopPrank();

        vm.warp(block.timestamp + 1 days);

        uint256 remTime = dualPoolStaking.poolB().periodFinish - block.timestamp;
        uint256 rateBefore = dualPoolStaking.poolB().rewardRate;

        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();
        vm.prank(user);
        dualPoolStaking.emergencyWithdrawB();

        PoolInfo memory pb = dualPoolStaking.poolB();
        assertEq(pb.rewardRate, pb.availableRewards / remTime, "pool B rate must track forfeited B rewards");
        assertGt(pb.rewardRate, rateBefore, "stale rate would under-emit forfeited rewards");
    }

    function testRebalanceIntoActivePoolBRecomputesRewardRate() public {
        _mintReward(address(this), 2000 ether);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(SAFE_REWARD_AMOUNT, SAFE_DURATION);
        vm.warp(block.timestamp + SAFE_DURATION + 1);

        uint256 rewardB = 1000 ether;
        uint256 durationB = 2 days;
        dualPoolStaking.notifyRewardAmountB(rewardB, durationB);

        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeB(HALF_STAKE);
        vm.stopPrank();

        vm.warp(block.timestamp + 1 days);

        uint256 remTime = dualPoolStaking.poolB().periodFinish - block.timestamp;
        uint256 amount = 1 ether;
        uint256 rateBefore = dualPoolStaking.poolB().rewardRate;

        stakingAdmin.rebalanceBudgets(Pool.A, Pool.B, amount);

        PoolInfo memory pb = dualPoolStaking.poolB();
        assertEq(pb.rewardRate, pb.availableRewards / remTime, "pool B rate must track rebalanced budget");
        assertGt(pb.rewardRate, rateBefore, "stale rate would under-emit rebalanced rewards");
    }

    function testResolveBadDebtExcessRecomputesPoolBRewardRate() public {
        uint256 rewardB = 1000 ether;
        uint256 durationB = 2 days;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountB(rewardB, durationB);

        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeB(HALF_STAKE);
        vm.stopPrank();

        vm.warp(block.timestamp + 1 days);

        bytes32 badDebtSlot = bytes32(uint256(24));
        uint256 badDebtAmount = 1 ether;
        vm.store(address(dualPoolStaking), badDebtSlot, bytes32(uint256(badDebtAmount)));

        uint256 remTime = dualPoolStaking.poolB().periodFinish - block.timestamp;
        uint256 rateBefore = dualPoolStaking.poolB().rewardRate;
        uint256 excess = 1 ether;

        _mintReward(address(this), badDebtAmount + excess);
        stakingAdmin.resolveBadDebt(badDebtAmount + excess);

        PoolInfo memory pb = dualPoolStaking.poolB();
        assertEq(pb.rewardRate, pb.availableRewards / remTime, "pool B rate must track bad-debt surplus");
        assertGt(pb.rewardRate, rateBefore, "stale rate would under-emit resolved surplus");
    }

    function testResolveBadDebtExcessGoesToPoolB() public {
        // Set up a normal notification, then use vm.store to create bad debt.
        uint256 rewardAmount = 100 ether;
        uint256 duration = 30 days;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);

        // Set badDebt directly via vm.store (slot 17 + offset 7 = slot 24)
        bytes32 badDebtSlot = bytes32(uint256(24));
        uint256 badDebtAmount = 1 ether;
        vm.store(address(dualPoolStaking), badDebtSlot, bytes32(uint256(badDebtAmount)));

        uint256 badDebt = dualPoolStaking.poolA().badDebt;
        uint256 excess = 1 ether;

        uint256 poolBBefore = dualPoolStaking.poolB().availableRewards;

        // Tokens are pulled from timelockGovernance (facade passes msg.sender as payer)
        _mintReward(address(this), badDebt + excess);
        stakingAdmin.resolveBadDebt(badDebt + excess);

        // Excess should flow into pool B available rewards
        assertEq(dualPoolStaking.poolB().availableRewards, poolBBefore + excess);
    }

    function testRecoverTokenA() public {
        // Mint some extra TokenA to the contract
        _mintStaking(address(dualPoolStaking), 100 ether);

        uint256 excess = stakingToken.balanceOf(address(dualPoolStaking)) - dualPoolStaking.poolA().totalStaked;
        assertGt(excess, 0);

        address recipient = address(0xCAFE);
        stakingAdmin.recoverToken(address(stakingToken), recipient, excess);
        assertEq(stakingToken.balanceOf(recipient), excess);
    }

    function testRecoverTokenBWithBadDebtReverts() public {
        // Set up a normal notification, then use vm.store to create bad debt.
        uint256 rewardAmount = 100 ether;
        uint256 duration = 30 days;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);

        // Set badDebt directly via vm.store (slot 17 + offset 7 = slot 24)
        bytes32 badDebtSlot = bytes32(uint256(24));
        vm.store(address(dualPoolStaking), badDebtSlot, bytes32(uint256(1)));

        assertGt(dualPoolStaking.poolA().badDebt, 0, "Should have badDebt");

        vm.expectRevert(StakingExecutionErrors.BadDebtExists.selector);
        stakingAdmin.recoverToken(address(rewardToken), address(0xCAFE), 1 wei);
    }

    function testRecoverTokenANoExcessReverts() public {
        // No excess TokenA — should revert
        vm.expectRevert(StakingExecutionErrors.TokenRecoveryRestricted.selector);
        stakingAdmin.recoverToken(address(stakingToken), address(0xCAFE), 1);
    }

    // ==================== Multi-User Integration Tests ====================

    function testMultipleUsersStakeA() public {
        address user2 = address(2);
        _mintStaking(user2, 1000 ether);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();

        vm.startPrank(user2);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();

        assertEq(dualPoolStaking.poolA().totalStaked, 200 ether);
        (uint256 s1,,) = dualPoolStaking.userInfoA(user);
        (uint256 s2,,) = dualPoolStaking.userInfoA(user2);
        assertEq(s1, DEFAULT_STAKE);
        assertEq(s2, DEFAULT_STAKE);
    }

    function testMultipleUsersStakeAndClaimA() public {
        address user2 = address(2);
        _mintStaking(user2, 1000 ether);
        _mintReward(user2, 1000 ether);

        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;

        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();

        vm.startPrank(user2);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();

        vm.warp(block.timestamp + duration);

        uint256 u1Before = rewardToken.balanceOf(user);
        uint256 u2Before = rewardToken.balanceOf(user2);

        vm.prank(user);
        dualPoolStaking.claimA();
        vm.prank(user2);
        dualPoolStaking.claimA();

        // Both should receive approximately the same rewards (equal stakes)
        uint256 u1Gained = rewardToken.balanceOf(user) - u1Before;
        uint256 u2Gained = rewardToken.balanceOf(user2) - u2Before;

        assertGt(u1Gained, 0);
        assertGt(u2Gained, 0);
        assertApproxEqAbs(u1Gained, u2Gained, 1e12, "Equal stakes should earn equal rewards");
    }

    function testMultipleUsersStakeB() public {
        address user2 = address(2);
        _mintReward(user2, 1000 ether);

        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);
        vm.stopPrank();

        vm.startPrank(user2);
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);
        vm.stopPrank();

        assertEq(dualPoolStaking.poolB().totalStaked, 200 ether);
        (uint256 s1,,) = dualPoolStaking.userInfoB(user);
        (uint256 s2,,) = dualPoolStaking.userInfoB(user2);
        assertEq(s1, DEFAULT_STAKE);
        assertEq(s2, DEFAULT_STAKE);
    }

    function testCompoundBExemptFromTVLCap() public {
        // Set a low TVL cap that the compound would exceed if not exempt
        stakingAdmin.setTVLCapB(101 ether);

        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        vm.warp(block.timestamp + SHORT_WARP);

        // Compound should succeed despite TVL cap because compound is exempt
        dualPoolStaking.compoundB();

        (uint256 stakedB,,) = dualPoolStaking.userInfoB(user);
        assertGt(stakedB, 0, "Compound should have succeeded");

        vm.stopPrank();
    }

    function testForceClaimAllBasic() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        vm.warp(block.timestamp + duration);
        vm.stopPrank();
        _activateShutdownForTests();
        vm.startPrank(user);

        uint256 balBefore = rewardToken.balanceOf(user);
        dualPoolStaking.forceClaimAll();
        uint256 balAfter = rewardToken.balanceOf(user);

        assertGt(balAfter, balBefore);

        vm.stopPrank();
    }

    function testForceClaimAllNoRewardsReverts() public {
        _activateShutdownForTests();
        vm.startPrank(user);
        vm.expectRevert(StakingExecutionErrors.NoRewardsToClaim.selector);
        dualPoolStaking.forceClaimAll();
        vm.stopPrank();
    }

    function testForceClaimAllRevertsInHealthyOps() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.warp(block.timestamp + duration);
        vm.expectRevert(StakingExecutionErrors.ForceClaimAllNotAvailable.selector);
        dualPoolStaking.forceClaimAll();
        vm.stopPrank();
    }

    function testForceClaimAllCooldownReverts() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        _queueAndExecuteNotifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        vm.warp(block.timestamp + duration);
        vm.stopPrank();
        _activateShutdownForTests();
        vm.startPrank(user);

        dualPoolStaking.forceClaimAll();

        // Second within cooldown reverts
        vm.warp(block.timestamp + 1 hours);
        vm.expectRevert();
        dualPoolStaking.forceClaimAll();

        vm.stopPrank();
    }

    /// @notice Healthy ops cannot call `forceClaimAll` even when per-pool rewards are below `minClaimAmount`.
    function testForceClaimAllRevertsWhenPerPoolBelowMinButSumAbove() public {
        stakingAdmin.setMinClaimAmount(1e17);
        uint256 amt = 2e17;
        uint256 duration = 1 days;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(amt, duration);
        dualPoolStaking.notifyRewardAmountB(amt, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);

        vm.warp(block.timestamp + 10 hours);

        vm.expectRevert(StakingExecutionErrors.ForceClaimAllNotAvailable.selector);
        dualPoolStaking.forceClaimAll();

        vm.stopPrank();
        stakingAdmin.setMinClaimAmount(0);
    }

    /// @notice During shutdown, sub-`minClaimAmount` per-pool balances can still be cleared via `forceClaimAll`.
    function testForceClaimAllAllowsSubMinPerPoolDuringShutdown() public {
        uint256 minClaim = 1e17;
        stakingAdmin.setMinClaimAmount(minClaim);
        uint256 amt = 2e17;
        uint256 duration = 1 days;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(amt, duration);
        dualPoolStaking.notifyRewardAmountB(amt, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);
        vm.warp(block.timestamp + 2 hours);
        _mintStaking(user, 1 wei);
        stakingToken.approve(address(dualPoolStaking), 1 wei);
        dualPoolStaking.stakeA(1 wei);
        _mintReward(user, 1 wei);
        rewardToken.approve(address(dualPoolStaking), 1 wei);
        dualPoolStaking.stakeB(1 wei);
        (, uint256 rewA,) = dualPoolStaking.userInfoA(user);
        (, uint256 rewB,) = dualPoolStaking.userInfoB(user);
        assertGt(rewA, 0);
        assertGt(rewB, 0);
        assertLt(rewA, minClaim);
        assertLt(rewB, minClaim);
        vm.stopPrank();
        _activateShutdownForTests();
        vm.startPrank(user);

        uint256 balBefore = rewardToken.balanceOf(user);
        dualPoolStaking.forceClaimAll();
        assertGt(rewardToken.balanceOf(user), balBefore);
        vm.stopPrank();
        stakingAdmin.setMinClaimAmount(0);
    }

    function testNotifyRewardAmountBShutdownReverts() public {
        // Enable shutdown without emergency mode to test shutdown check
        // The admin module checks emergencyMode before shutdown, so we need to ensure
        // the notify is blocked. Since shutdown alone requires emergency first,
        // we test that emergency mode blocks notify (which is the actual behavior).
        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();

        vm.expectRevert(); // EmergencyModeActive
        dualPoolStaking.notifyRewardAmountB(SAFE_REWARD_AMOUNT, SAFE_DURATION);
    }

    function testPoolAEmptyNoRewardDistribution() public {
        // Fund Pool A reward but nobody staked — no distribution happens
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(SAFE_REWARD_AMOUNT, SAFE_DURATION);

        // Warp past the full period
        vm.warp(block.timestamp + SAFE_DURATION * 2);

        PoolInfo memory p = dualPoolStaking.poolA();
        // Since totalStaked == 0, accRewardPerToken should remain 0 (no distribution)
        assertEq(p.accRewardPerToken, 0, "No rewards should be distributed with no stakers");
    }

    /// @notice Sub-`MIN_REWARD_RATE_DURATION` stranded budget must micro-emit at 1 wei/sec (not a zero-rate ghost window).
    function testReanchorMicroEmissionDrainsSubMinDurationBudgetA() public {
        uint256 microBudget = 500;
        uint256 notifyAmount = 86_400 + microBudget;
        uint256 duration = SAFE_DURATION;

        dualPoolStaking.notifyRewardAmountA(notifyAmount, duration);
        vm.warp(block.timestamp + duration * 2);

        stakingAdmin.rebalanceBudgets(Pool.A, Pool.B, notifyAmount - microBudget);
        assertEq(dualPoolStaking.poolA().availableRewards, microBudget);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        PoolInfo memory pa = dualPoolStaking.poolA();
        assertEq(pa.rewardRate, 1, "micro-emission rate");
        assertEq(pa.periodFinish, block.timestamp + microBudget, "micro-emission window");

        vm.warp(pa.periodFinish);
        uint256 beforeB = rewardToken.balanceOf(user);
        dualPoolStaking.claimA();
        assertApproxEqAbs(rewardToken.balanceOf(user) - beforeB, microBudget, 2, "staker drains micro budget");
        assertLe(dualPoolStaking.poolA().availableRewards, 2, "budget nearly exhausted");
        vm.stopPrank();
    }

    /// @notice After a full empty period, the first staker should still receive the stranded `availableRewards` budget (re-anchor + accrue).
    function testEmptyPoolAfterPeriodFirstStakeClaimsStaleBudgetA() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);

        vm.warp(block.timestamp + duration * 2);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        PoolInfo memory pa = dualPoolStaking.poolA();
        assertGt(pa.rewardRate, 0, "re-anchor should set rate");
        assertGt(pa.periodFinish, block.timestamp, "new emission window");

        vm.warp(pa.periodFinish);

        uint256 beforeB = rewardToken.balanceOf(user);
        dualPoolStaking.claimA();
        uint256 claimed = rewardToken.balanceOf(user) - beforeB;
        assertApproxEqAbs(claimed, rewardAmount, 1e15, "first staker should absorb prior empty-period budget");
        vm.stopPrank();
    }

    /// @notice Second `notify` after an empty finished period must fold stranded `availableRewards` into the new rate.
    function testEmptyPoolAfterPeriodSecondNotifyMergesStaleBudgetA() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);
        vm.warp(block.timestamp + duration * 2);

        uint256 second = 2 ether;
        _mintReward(address(this), second);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(second, duration);

        PoolInfo memory pa = dualPoolStaking.poolA();
        assertEq(pa.rewardRate, (rewardAmount + second) / duration);
        assertEq(pa.availableRewards, rewardAmount + second);
    }

    /// @notice Staked pool + expired period + long idle: second `notify` must not merge `leftover` and full `availableRewards` twice.
    function testStakedPoolAfterLongIdleSecondNotifyDoesNotDoubleCountBudgetA() public {
        uint256 firstAmount = 100 ether;
        uint256 firstDuration = 60 days;
        uint256 secondAmount = 200 ether;
        uint256 secondDuration = 30 days;

        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(firstAmount, firstDuration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();

        vm.warp(block.timestamp + firstDuration + 30 days);

        _mintReward(address(this), secondAmount);
        dualPoolStaking.notifyRewardAmountA(secondAmount, secondDuration);

        PoolInfo memory pa = dualPoolStaking.poolA();
        assertApproxEqAbs(pa.totalPending, firstAmount, 1e15, "first schedule must be accounted before notify");
        assertApproxEqAbs(pa.availableRewards, secondAmount, 1e15, "new schedule should not include old owed rewards");
        assertEq(pa.rewardRate, secondAmount / secondDuration, "rate must use only new amount plus tiny remainder");
        assertEq(pa.badDebt, 0, "double-count would emit past budget and accrue badDebt");

        vm.warp(pa.periodFinish);
        vm.prank(user);
        dualPoolStaking.claimA();
        assertEq(dualPoolStaking.poolA().badDebt, 0, "full emission must not leave badDebt");
        _assertTokenBBalanceInvariant(dualPoolStaking);
    }

    /// @notice User catch-up must share admin's `MAX_CATCHUP_ITERATIONS` budget (not the legacy 14-step ~420d cap).
    function testUserCatchUpBeyondLegacy420DayCapA() public {
        vm.warp(1000 days);

        uint256 rewardAmount = 1000 ether;
        uint256 duration = 365 days;
        uint256 catchUpGap = 450 days;
        uint256 legacyCatchUpCap = (365 days / 30 days + 2) * 30 days;
        assertGt(catchUpGap, legacyCatchUpCap, "sanity: gap exceeds pre-fix user catch-up ceiling");

        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();

        PoolInfo memory pa = dualPoolStaking.poolA();
        uint256 periodFinish = pa.periodFinish;
        vm.warp(periodFinish + 30 days);

        // `poolAState.lastUpdateTime` is struct field index 3 at base slot 17 → slot 20.
        bytes32 lastUpdateSlot = bytes32(uint256(20));
        vm.store(address(dualPoolStaking), lastUpdateSlot, bytes32(uint256(periodFinish - catchUpGap)));
        // Field index 5 (`availableRewards`) → slot 22; back the forced catch-up with real TokenB.
        uint256 extraBudget = rewardAmount;
        _mintReward(address(dualPoolStaking), extraBudget);
        vm.store(address(dualPoolStaking), bytes32(uint256(22)), bytes32(pa.availableRewards + extraBudget));

        address user2 = address(2);
        _mintStaking(user2, DEFAULT_STAKE);
        vm.startPrank(user2);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();

        pa = dualPoolStaking.poolA();
        assertGe(pa.lastUpdateTime, periodFinish, "catch-up must consume the expired window");
        assertEq(pa.badDebt, 0);
        _assertTokenBBalanceInvariant(dualPoolStaking);
    }

    /// @notice Long-idle claims must settle the full elapsed reward window, not only one MAX_DELTA_TIME chunk.
    function testClaimAfterLongIdleSettlesFullExpiredWindowA() public {
        uint256 rewardAmount = 120 ether;
        uint256 duration = 120 days;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.warp(block.timestamp + duration + 10 days);

        uint256 beforeBal = rewardToken.balanceOf(user);
        dualPoolStaking.claimA();
        assertApproxEqAbs(rewardToken.balanceOf(user) - beforeBal, rewardAmount, 1e15);
        vm.stopPrank();
    }

    /// @notice A second notify after an expired staked period must not let later stakers share the old schedule.
    function testNotifyAfterLongIdleDoesNotRescheduleOldRewardsToLateStakerA() public {
        uint256 firstAmount = 120 ether;
        uint256 firstDuration = 120 days;
        uint256 secondAmount = 30 ether;
        uint256 secondDuration = 30 days;
        address lateUser = address(2);
        _mintStaking(lateUser, DEFAULT_STAKE);

        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(firstAmount, firstDuration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();

        vm.warp(block.timestamp + firstDuration + 10 days);
        _mintReward(address(this), secondAmount);
        dualPoolStaking.notifyRewardAmountA(secondAmount, secondDuration);

        vm.startPrank(lateUser);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();

        PoolInfo memory pa = dualPoolStaking.poolA();
        assertApproxEqAbs(pa.totalPending, firstAmount, 1e15, "old schedule must already be pending");
        assertApproxEqAbs(pa.availableRewards, secondAmount, 1e15, "late staker can only share new schedule");

        vm.warp(block.timestamp + secondDuration);

        uint256 earlyBefore = rewardToken.balanceOf(user);
        vm.prank(user);
        dualPoolStaking.claimA();
        uint256 earlyClaimed = rewardToken.balanceOf(user) - earlyBefore;

        vm.warp(block.timestamp + dualPoolStaking.claimCooldown() + 1);
        uint256 lateBefore = rewardToken.balanceOf(lateUser);
        vm.prank(lateUser);
        dualPoolStaking.claimA();
        uint256 lateClaimed = rewardToken.balanceOf(lateUser) - lateBefore;

        assertGt(earlyClaimed, firstAmount, "early staker receives old schedule plus new share");
        assertLt(lateClaimed, secondAmount, "late staker receives only a share of the second schedule");
    }

    /// @notice Expired staked pool + long idle: a new staker must not share the old emission window.
    function testStakeAfterLongIdleExpiredPoolDoesNotShareOldRewardsA() public {
        uint256 rewardAmount = 120 ether;
        uint256 duration = 120 days;
        address lateUser = address(2);
        _mintStaking(lateUser, DEFAULT_STAKE);

        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();

        vm.warp(block.timestamp + duration + 10 days);

        vm.startPrank(lateUser);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();

        (, uint256 lateRewards,) = dualPoolStaking.userInfoA(lateUser);
        PoolInfo memory pa = dualPoolStaking.poolA();

        assertEq(lateRewards, 0, "late staker must not receive expired-period rewards");
        assertLe(pa.availableRewards, 1e15, "only rate-rounding remainder may remain");
        assertApproxEqAbs(pa.totalPending, rewardAmount, 1e15, "expired rewards are pending before late stake shares");
        assertEq(pa.badDebt, 0);

        vm.prank(user);
        dualPoolStaking.claimA();
        assertApproxEqAbs(rewardToken.balanceOf(user), 1000 ether + rewardAmount, 1e15, "old staker claims old rewards");

        vm.prank(lateUser);
        vm.expectRevert(StakingExecutionErrors.NoRewardsToClaim.selector);
        dualPoolStaking.claimA();
        _assertTokenBBalanceInvariant(dualPoolStaking);
    }

    function testStakeIntoEmptyPoolReanchor() public {
        // Fund pool and wait, then first staker enters
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(SAFE_REWARD_AMOUNT, SAFE_DURATION);

        // Warp half the duration — no stakers, so no distribution
        vm.warp(block.timestamp + SAFE_DURATION / 2);

        PoolInfo memory beforeNotify = dualPoolStaking.poolA();

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);

        // After first deposit, rewardRate should be re-anchored
        PoolInfo memory p = dualPoolStaking.poolA();
        uint256 remainingTime =
            beforeNotify.periodFinish > block.timestamp ? beforeNotify.periodFinish - block.timestamp : 0;

        if (remainingTime > 0) {
            uint256 expectedRate = beforeNotify.availableRewards / remainingTime;
            assertEq(p.rewardRate, expectedRate, "Reward rate should be re-anchored for first depositor");
        }

        vm.stopPrank();
    }

    /// @notice Empty-pool first stake with short `remainingTime` must clamp `rewardRate` to the notify APR ceiling.
    function testFirstDepositReanchorClampsToMaxRewardRate() public {
        uint256 rewardAmount = 1_000_000 ether;
        uint256 duration = 365 days;
        _mintReward(address(this), rewardAmount);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);

        vm.warp(block.timestamp + duration - 1 days);

        PoolInfo memory beforeStake = dualPoolStaking.poolA();
        uint256 remainingTime = beforeStake.periodFinish - block.timestamp;
        uint256 uncappedRate = beforeStake.availableRewards / remainingTime;
        uint256 maxRate = _maxRewardRate(dualPoolStaking);
        assertGt(uncappedRate, maxRate, "fixture must exceed APR cap");

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();

        PoolInfo memory afterStake = dualPoolStaking.poolA();
        assertEq(afterStake.rewardRate, maxRate, "first deposit must clamp to max reward rate");
        assertLt(afterStake.rewardRate, uncappedRate, "uncapped rate would exceed ceiling");
    }

    /// @notice After all stakers exit (`totalStaked == 0`), the next first deposit re-anchors with the same cap.
    function testSecondRoundFirstDepositClampsToMaxRewardRate() public {
        uint256 rewardAmount = 1_000_000 ether;
        uint256 duration = 365 days;
        _mintReward(address(this), rewardAmount);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);

        vm.warp(block.timestamp + duration - 1 days);

        uint256 maxRate = _maxRewardRate(dualPoolStaking);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        assertEq(dualPoolStaking.poolA().rewardRate, maxRate, "first deposit clamped");

        dualPoolStaking.withdrawA(DEFAULT_STAKE);
        assertEq(dualPoolStaking.poolA().totalStaked, 0, "pool empty for second-round first deposit");

        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        assertEq(dualPoolStaking.poolA().rewardRate, maxRate, "second-round first deposit must clamp");
        vm.stopPrank();
    }

    /// @notice Active-window re-anchor must not overwrite the schedule with `rewardRate == 0` for tiny budgets.
    function testActiveReanchorMicroEmissionAvoidsZeroRate() public {
        ReanchorHarness h = new ReanchorHarness();
        uint256 available = 3;
        uint256 remainingTime = 100;

        vm.warp(1000);
        h.seed(available, block.timestamp + remainingTime, block.timestamp);
        h.applyActive(remainingTime);

        (uint256 rewardRate, uint256 periodFinish, uint256 lastUpdateTime, uint256 availableRewards) = h.snapshot();
        assertEq(rewardRate, 1, "tiny active budget must use micro-emission");
        assertEq(periodFinish, block.timestamp + available, "micro-emission drains the exact tiny budget");
        assertEq(lastUpdateTime, block.timestamp, "micro-emission resets the accrual start");
        assertEq(availableRewards, available, "budget remains available for accrual to debit");
    }

    /// @notice `reanchorOnBudgetInjection` on an active window clamps like first-deposit re-anchor (rebalance path).
    function testRebalanceIntoActivePoolBClampsRewardRate() public {
        uint256 rewardA = 1_000_000 ether;
        uint256 durationA = 365 days;
        _mintReward(address(this), rewardA + 2000 ether);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);

        dualPoolStaking.notifyRewardAmountA(rewardA, durationA);
        vm.warp(block.timestamp + durationA + 1);

        uint256 rewardB = 1000 ether;
        uint256 durationB = 1 days;
        dualPoolStaking.notifyRewardAmountB(rewardB, durationB);

        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeB(HALF_STAKE);
        vm.stopPrank();

        vm.warp(block.timestamp + durationB - 60);

        uint256 remTime = dualPoolStaking.poolB().periodFinish - block.timestamp;
        uint256 amountToMove = dualPoolStaking.poolA().availableRewards;
        assertGt(amountToMove, 0, "pool A must hold stranded budget");

        stakingAdmin.rebalanceBudgets(Pool.A, Pool.B, amountToMove);

        PoolInfo memory pb = dualPoolStaking.poolB();
        uint256 uncappedRate = pb.availableRewards / remTime;
        uint256 maxRate = _maxRewardRate(dualPoolStaking);
        assertGt(uncappedRate, maxRate, "fixture must exceed APR cap");
        assertEq(pb.rewardRate, maxRate, "budget injection must clamp to max reward rate");
    }

    /// @dev Deploys core + delegate modules (same wiring as `setUp`, different tokens).
    function _deployWiredDualPool(address tokenA, address tokenB) internal returns (DualPoolStaking s) {
        s = new DualPoolStaking(tokenA, tokenB, 10_000_000 * 1e18);
        DualPoolUserModule userModule = new DualPoolUserModule();
        DualPoolAdminModule adminModule = new DualPoolAdminModule();
        s.setUserModule(address(userModule));
        s.setAdminModule(address(adminModule));
    }

    /// @notice `notifyReward*` must enforce the same `maxTransferFeeBP` balance-delta check as `stakeB` (TokenB FOT).
    function testNotifyRewardRevertsWhenFOTBeyondMaxTransferFeeBP() public {
        MockERC20 tokenA = new MockERC20("TKA", "TKA");
        MockFOTERC20 tokenB = new MockFOTERC20("TKB", "TKB", 2000); // 20% tax > default 10% cap
        DualPoolStaking s = _deployWiredDualPool(address(tokenA), address(tokenB));
        tokenB.mint(address(this), 1000 ether);
        tokenB.approve(address(s), type(uint256).max);
        vm.expectRevert(StakingExecutionErrors.ExcessiveTransferFee.selector);
        s.notifyRewardAmountB(100 ether, SAFE_DURATION);
    }

    function testNotifyRewardAcceptsFOTWithinMaxTransferFeeBP() public {
        MockERC20 tokenA = new MockERC20("TKA2", "TKA2");
        MockFOTERC20 tokenB = new MockFOTERC20("TKB2", "TKB2", 500); // 5% within 10% cap
        DualPoolStaking s = _deployWiredDualPool(address(tokenA), address(tokenB));
        tokenB.mint(address(this), 1000 ether);
        tokenB.approve(address(s), type(uint256).max);
        s.notifyRewardAmountB(100 ether, SAFE_DURATION);
        assertEq(s.poolB().availableRewards, 95 ether);
    }

    function testDualPoolStakingAdminConstructorZeroCoreReverts() public {
        vm.expectRevert(DualPoolStakingAdmin.ZeroCore.selector);
        new DualPoolStakingAdmin(address(0), address(1), address(2));
    }

    function testDualPoolStakingAdminConstructorZeroGovernanceTimelockReverts() public {
        vm.expectRevert(DualPoolStakingAdmin.ZeroTimelockGovernance.selector);
        new DualPoolStakingAdmin(address(dualPoolStaking), address(0), address(2));
    }

    function testDualPoolStakingAdminConstructorZeroSuperTimelockReverts() public {
        vm.expectRevert(DualPoolStakingAdmin.ZeroTimelockSuper.selector);
        new DualPoolStakingAdmin(address(dualPoolStaking), address(1), address(0));
    }

    function testDualPoolStakingSameTokenReverts() public {
        vm.expectRevert(DualPoolStaking.SameStakingTokens.selector);
        new DualPoolStaking(address(stakingToken), address(stakingToken), 10_000_000 * 1e18);
    }

    function testDualPoolStakingInvalidDecimalsReverts() public {
        MockERC20 tokenA = new MockERC20("A", "A");
        MockERC20WithDecimals tokenB6 = new MockERC20WithDecimals("B6", "B6", 6);
        vm.expectRevert(DualPoolStaking.InvalidRewardTokenDecimals.selector);
        new DualPoolStaking(address(tokenA), address(tokenB6), 10_000_000 * 1e18);
    }

    function testDualPoolStakingZeroMaxSupplyReverts() public {
        vm.expectRevert(StakingExecutionErrors.ZeroAmount.selector);
        new DualPoolStaking(address(stakingToken), address(rewardToken), 0);
    }

    function testDualPoolStakingTinyMaxSupplyRateCapReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(StakingExecutionErrors.ZeroRewardRate.selector, uint256(1), uint256(15_768_000))
        );
        new DualPoolStaking(address(stakingToken), address(rewardToken), 1);
    }

    /// @notice Pool B stake path rejects TokenB FOT when implied fee exceeds `maxTransferFeeBP` (same rule as notify).
    function testStakeBRevertsWhenFOTBeyondMaxTransferFeeBP() public {
        MockERC20 tokenA = new MockERC20("TKA3", "TKA3");
        MockFOTERC20 tokenB = new MockFOTERC20("TKB3", "TKB3", 2000);
        DualPoolStaking s = _deployWiredDualPool(address(tokenA), address(tokenB));
        DualPoolStakingAdmin sa = new DualPoolStakingAdmin(address(s), address(this), address(this));
        s.grantRole(s.ADMIN_ROLE(), address(sa));
        tokenB.mint(user, 1000 ether);
        vm.startPrank(user);
        tokenB.approve(address(s), type(uint256).max);
        vm.expectRevert(StakingExecutionErrors.ExcessiveTransferFee.selector);
        s.stakeB(100 ether);
        vm.stopPrank();
    }

    /// @notice `notifyRewardAmountA` credits Pool A with **received** TokenB (balance delta), not the requested pull amount.
    function testNotifyRewardAmountAFOTCreditsActualReceived() public {
        MockERC20 tokenA = new MockERC20("TKA4", "TKA4");
        MockFOTERC20 tokenB = new MockFOTERC20("TKB4", "TKB4", 1000); // 10% at default cap edge
        DualPoolStaking s = _deployWiredDualPool(address(tokenA), address(tokenB));
        tokenB.mint(address(this), 1000 ether);
        tokenB.approve(address(s), type(uint256).max);
        uint256 requested = 100 ether;
        s.notifyRewardAmountA(requested, SAFE_DURATION);
        assertEq(s.poolA().availableRewards, 90 ether);
    }

    /// @notice Pool A stake credits `received` wei when TokenA is fee-on-transfer within `maxTransferFeeBP`.
    function testStakeAFOTCreditsReceivedWithinFeeCap() public {
        MockFOTERC20 tokenA = new MockFOTERC20("FOTA", "FOTA", 500);
        MockERC20 tokenB = new MockERC20("TKB5", "TKB5");
        DualPoolStaking s = _deployWiredDualPool(address(tokenA), address(tokenB));
        DualPoolStakingAdmin sa = new DualPoolStakingAdmin(address(s), address(this), address(this));
        s.grantRole(s.ADMIN_ROLE(), address(sa));
        sa.setMinStakeAmountA(1 wei);
        tokenA.mint(user, 1000 ether);
        vm.startPrank(user);
        tokenA.approve(address(s), type(uint256).max);
        uint256 req = 100 ether;
        s.stakeA(req);
        (uint256 staked,,) = s.userInfoA(user);
        assertEq(staked, 95 ether);
        vm.stopPrank();
    }

    /// @notice After `forceClaimAll` during shutdown with both pools above `minClaimAmount`, user receives both reward legs.
    function testForceClaimAllDuringShutdownBothPoolsPaid() public {
        stakingAdmin.setMinClaimAmount(1 wei);
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);
        dualPoolStaking.notifyRewardAmountB(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);
        vm.warp(block.timestamp + duration / 2);
        _mintStaking(user, 1 ether);
        stakingToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeA(1 wei);
        _mintReward(user, 2 wei);
        rewardToken.approve(address(dualPoolStaking), 2 wei);
        dualPoolStaking.stakeB(1 wei);
        (, uint256 rewA,) = dualPoolStaking.userInfoA(user);
        (, uint256 rewB,) = dualPoolStaking.userInfoB(user);
        assertGt(rewA, 0);
        assertGt(rewB, 0);
        assertGe(rewA, dualPoolStaking.minClaimAmount());
        assertGe(rewB, dualPoolStaking.minClaimAmount());

        vm.stopPrank();
        _activateShutdownForTests();
        vm.startPrank(user);

        uint256 balBefore = rewardToken.balanceOf(user);
        dualPoolStaking.forceClaimAll();
        assertGt(rewardToken.balanceOf(user) - balBefore, 0);
        (, uint256 rewA2,) = dualPoolStaking.userInfoA(user);
        (, uint256 rewB2,) = dualPoolStaking.userInfoB(user);
        assertEq(rewA2, 0);
        assertEq(rewB2, 0);
        assertEq(dualPoolStaking.poolA().totalPending, 0);
        assertEq(dualPoolStaking.poolB().totalPending, 0);
        assertEq(dualPoolStaking.bookedUserRewardsA(), 0);
        assertEq(dualPoolStaking.bookedUserRewardsB(), 0);
        vm.stopPrank();
        stakingAdmin.setMinClaimAmount(0);
    }

    /// @notice `pool*.totalPending` tracks `bookedUserRewards*` across emergency Pool A exit (forfeit debits both).
    function testEmergencyWithdrawATotalPendingMatchesBooked() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.warp(block.timestamp + 1 hours);
        _mintStaking(user, 1 ether);
        stakingToken.approve(address(dualPoolStaking), 1 ether);
        dualPoolStaking.stakeA(1 wei);
        vm.stopPrank();

        assertEq(dualPoolStaking.poolA().totalPending, dualPoolStaking.bookedUserRewardsA());

        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();
        vm.prank(user);
        dualPoolStaking.emergencyWithdrawA();

        assertEq(dualPoolStaking.poolA().totalPending, dualPoolStaking.bookedUserRewardsA());
        _assertTokenBBalanceInvariant(dualPoolStaking);
    }

    /// @notice Same ledger alignment for emergency Pool B exit (forfeit moves into `availableRewardsB`, pending/booked stay aligned).
    function testEmergencyWithdrawBTotalPendingMatchesBooked() public {
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountB(SAFE_REWARD_AMOUNT, SAFE_DURATION);

        vm.startPrank(user);
        rewardToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeB(DEFAULT_STAKE);
        vm.warp(block.timestamp + 1 days);
        rewardToken.approve(address(dualPoolStaking), 1 wei);
        dualPoolStaking.stakeB(1 wei);
        vm.stopPrank();

        assertEq(dualPoolStaking.poolB().totalPending, dualPoolStaking.bookedUserRewardsB());

        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();
        vm.prank(user);
        dualPoolStaking.emergencyWithdrawB();

        assertEq(dualPoolStaking.poolB().totalPending, dualPoolStaking.bookedUserRewardsB());
        _assertTokenBBalanceInvariant(dualPoolStaking);
    }

    /// @notice Deadlock-bypass finalize with remaining stake must not leave an active schedule that creates badDebt on later withdraw.
    function testForceShutdownFinalizeDeadlockBypassTerminatesEmission() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();

        vm.warp(block.timestamp + duration / 2);

        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();
        stakingAdmin.activateShutdown();

        vm.warp(dualPoolStaking.shutdownAt() + dualPoolStaking.SHUTDOWN_DEADLOCK_BYPASS() + 1);
        stakingAdmin.forceShutdownFinalize();

        PoolInfo memory poolA = dualPoolStaking.poolA();
        assertEq(poolA.rewardRate, 0);
        assertEq(poolA.periodFinish, block.timestamp);
        assertEq(poolA.lastUpdateTime, block.timestamp);

        vm.prank(user);
        dualPoolStaking.withdrawA(DEFAULT_STAKE);
        assertEq(dualPoolStaking.poolA().badDebt, 0);
    }

    /// @notice Deadlock-bypass finalize with remaining stake preserves unsettled pending for later user settlement/claim.
    function testForceShutdownFinalizeDeadlockBypassPreservesUnsettledPending() public {
        uint256 rewardAmount = SAFE_REWARD_AMOUNT;
        uint256 duration = SAFE_DURATION;
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(rewardAmount, duration);

        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), DEFAULT_STAKE);
        dualPoolStaking.stakeA(DEFAULT_STAKE);
        vm.stopPrank();

        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();
        stakingAdmin.activateShutdown();

        vm.warp(dualPoolStaking.shutdownAt() + dualPoolStaking.SHUTDOWN_DEADLOCK_BYPASS() + 1);
        stakingAdmin.forceShutdownFinalize();

        uint256 pendingAfterFinalize = dualPoolStaking.poolA().totalPending;
        assertEq(dualPoolStaking.bookedUserRewardsA(), 0, "user has not settled yet");
        assertGt(pendingAfterFinalize, rewardAmount - 1e12, "pending remains claimable");

        vm.prank(user);
        dualPoolStaking.withdrawA(DEFAULT_STAKE);
        assertEq(dualPoolStaking.bookedUserRewardsA(), pendingAfterFinalize, "withdraw settles pre-finalize rewards");

        uint256 userRewardBefore = rewardToken.balanceOf(user);
        vm.prank(user);
        dualPoolStaking.claimA();
        assertEq(rewardToken.balanceOf(user) - userRewardBefore, pendingAfterFinalize);
        assertEq(dualPoolStaking.poolA().totalPending, 0);
        assertEq(dualPoolStaking.bookedUserRewardsA(), 0);
        _assertTokenBBalanceInvariant(dualPoolStaking);
    }

    /// @notice Shutdown finalize without remaining stake sweeps stranded operator budget + orphan pending to `feeRecipient` while zeroing pool buckets.
    function testForceShutdownFinalizeSendsResidualToFeeRecipient() public {
        address feeSink = address(0xC0FFEE);
        stakingAdmin.setFeeRecipient(feeSink);

        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(SAFE_REWARD_AMOUNT, SAFE_DURATION);

        vm.prank(address(this));
        dualPoolStaking.enableEmergencyMode();
        stakingAdmin.activateShutdown();

        vm.warp(dualPoolStaking.shutdownAt() + 365 days + 1);

        uint256 sinkBefore = rewardToken.balanceOf(feeSink);
        stakingAdmin.forceShutdownFinalize();
        assertGt(rewardToken.balanceOf(feeSink), sinkBefore, "feeRecipient receives residual TokenB");
        assertEq(dualPoolStaking.poolA().availableRewards, 0);
        assertEq(dualPoolStaking.poolB().availableRewards, 0);
        assertEq(dualPoolStaking.poolA().totalPending, 0);
        assertEq(dualPoolStaking.poolB().totalPending, 0);
        stakingAdmin.setFeeRecipient(address(this));
    }

    /// @dev `PoolBWadpLib` uses OZ `Math.mulDiv` with `Ceil` rounding; fuzz against an independent ceil reference.
    function testFuzz_WadpMatchesOpenZeppelinCeil(uint128 oldStaked, uint128 added, uint32 tOld, uint32 tNew)
        public
        pure
    {
        uint256 o = bound(uint256(oldStaked), 1, 1e24);
        uint256 a = bound(uint256(added), 1, 1e24);
        vm.assume(tNew >= tOld);
        uint256 w = PoolBWadpLib.weightedAvgDepositTimestamp(o, uint256(tOld), a, uint256(tNew));
        uint256 sum = o * uint256(tOld) + a * uint256(tNew);
        uint256 denom = o + a;
        uint256 expected = Math.mulDiv(sum, 1, denom, Math.Rounding.Ceil);
        assertEq(w, expected);
    }

    /// @notice Random bounded stake/warp sequences on Pool B preserve the TokenB balance invariant.
    function testFuzz_TokenBInvariantHoldsAfterStakeBWarp(uint256 seed) public {
        seed = bound(seed, 1, type(uint128).max);
        vm.startPrank(user);
        for (uint256 i; i < 4; ++i) {
            uint256 amt = bound(uint256(keccak256(abi.encode(seed, i))), 1 ether, 200 ether);
            _mintReward(user, amt);
            rewardToken.approve(address(dualPoolStaking), amt);
            dualPoolStaking.stakeB(amt);
            uint256 w = bound(uint256(keccak256(abi.encode(seed, i, "w"))), 0, 3 days);
            vm.warp(block.timestamp + w);
        }
        vm.stopPrank();
        _assertTokenBBalanceInvariant(dualPoolStaking);
    }

    /// @notice Stranded Pool A budget + first staker re-anchor keeps TokenB invariant (property around empty-pool notify).
    function testFuzz_EmptyPoolNotifyThenStakeAInvariant(uint256 waitFracSeed, uint256 stakeAmtSeed) public {
        uint256 waitFrac = bound(waitFracSeed, 1, SAFE_DURATION - 1);
        uint256 stakeAmt = bound(stakeAmtSeed, 1 ether, DEFAULT_STAKE);
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(SAFE_REWARD_AMOUNT, SAFE_DURATION);
        vm.warp(block.timestamp + waitFrac);
        _assertTokenBBalanceInvariant(dualPoolStaking);

        vm.startPrank(user);
        _mintStaking(user, stakeAmt);
        stakingToken.approve(address(dualPoolStaking), stakeAmt);
        dualPoolStaking.stakeA(stakeAmt);
        vm.stopPrank();
        _assertTokenBBalanceInvariant(dualPoolStaking);
        assertGt(dualPoolStaking.poolA().rewardRate, 0);
    }

    /// @notice Pool A stake rejects TokenA FOT when implied fee exceeds `maxTransferFeeBP` (same rule as `stakeB`).
    function testStakeAFOTRevertsWhenBeyondMaxTransferFeeBP() public {
        MockFOTERC20 tokenA = new MockFOTERC20("FOTA2", "FOTA2", 2000);
        MockERC20 tokenB = new MockERC20("TKB6", "TKB6");
        DualPoolStaking s = _deployWiredDualPool(address(tokenA), address(tokenB));
        tokenA.mint(user, 1000 ether);
        vm.startPrank(user);
        tokenA.approve(address(s), type(uint256).max);
        vm.expectRevert(StakingExecutionErrors.ExcessiveTransferFee.selector);
        s.stakeA(100 ether);
        vm.stopPrank();
    }

    /// @notice Outbound `claimB` transfers booked gross; FOT tax is borne by the user wallet (not grossed-up by the pool).
    function testClaimBFOTUserBearsOutboundTax() public {
        MockERC20 tokenA = new MockERC20("TKA5", "TKA5");
        MockFOTERC20 tokenB = new MockFOTERC20("TKBF", "TKBF", 500);
        uint256 feeBps = 500;
        DualPoolStaking s = _deployWiredDualPool(address(tokenA), address(tokenB));

        tokenB.mint(address(this), 10_000 ether);
        tokenB.approve(address(s), type(uint256).max);
        s.notifyRewardAmountB(SAFE_REWARD_AMOUNT, SAFE_DURATION);
        vm.warp(block.timestamp + SAFE_DURATION + 1);
        s.notifyRewardAmountB(SAFE_REWARD_AMOUNT, SAFE_DURATION);

        vm.startPrank(user);
        tokenB.mint(user, 1000 ether);
        tokenB.approve(address(s), type(uint256).max);
        s.stakeB(DEFAULT_STAKE);
        vm.warp(block.timestamp + SAFE_DURATION);

        vm.recordLogs();
        uint256 balBefore = tokenB.balanceOf(user);
        s.claimB();
        uint256 received = tokenB.balanceOf(user) - balBefore;
        assertGt(received, 0);

        uint256 grossPaidB;
        uint256 outboundGross;
        uint256 outboundNet;
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 claimedTopic = keccak256("Claimed(address,uint256,uint256,uint256)");
        bytes32 outboundTopic = keccak256("OutboundTransfer(address,address,uint256,uint256)");
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == claimedTopic) {
                (, grossPaidB,) = abi.decode(logs[i].data, (uint256, uint256, uint256));
            } else if (logs[i].topics[0] == outboundTopic) {
                (outboundGross, outboundNet) = abi.decode(logs[i].data, (uint256, uint256));
            }
        }
        assertGt(grossPaidB, 0);
        assertApproxEqAbs(received, grossPaidB * (10_000 - feeBps) / 10_000, 1);
        assertEq(outboundGross, grossPaidB, "protocol accounts gross payout");
        assertEq(outboundNet, received, "event records user net after FOT tax");
        vm.stopPrank();
    }

    /// @notice Outbound `withdrawB` sends protocol-net principal gross; FOT outbound tax reduces wallet balance.
    function testWithdrawBFOTUserBearsOutboundTax() public {
        MockERC20 tokenA = new MockERC20("TKA6", "TKA6");
        MockFOTERC20 tokenB = new MockFOTERC20("TKBF2", "TKBF2", 500);
        uint256 feeBps = 500;
        DualPoolStaking s = _deployWiredDualPool(address(tokenA), address(tokenB));

        vm.startPrank(user);
        tokenB.mint(user, 1000 ether);
        tokenB.approve(address(s), type(uint256).max);
        s.stakeB(DEFAULT_STAKE);
        (uint256 staked,,) = s.userInfoB(user);
        assertGt(staked, 0);

        uint256 stakeTs = s.stakeTimestampB(user);
        uint256 unlock = s.unlockTimeB(user);
        vm.warp(stakeTs + 181 days);
        if (block.timestamp < unlock) vm.warp(unlock);

        uint256 balBefore = tokenB.balanceOf(user);
        s.withdrawB(staked);
        uint256 received = tokenB.balanceOf(user) - balBefore;
        uint256 expectedWallet = staked * (10_000 - feeBps) / 10_000;

        assertApproxEqAbs(received, expectedWallet, 1);
        vm.stopPrank();
    }

    /// @notice Outbound claim reverts when TokenB FOT exceeds `maxTransferFeeBP` (symmetric with inbound stake/notify).
    function testClaimBFOTRevertsWhenOutboundTaxBeyondCap() public {
        MockERC20 tokenA = new MockERC20("TKA7", "TKA7");
        MockFOTERC20 tokenB = new MockFOTERC20("TKBF3", "TKBF3", 500);
        DualPoolStaking s = _deployWiredDualPool(address(tokenA), address(tokenB));

        tokenB.mint(address(this), 10_000 ether);
        tokenB.approve(address(s), type(uint256).max);
        s.notifyRewardAmountB(SAFE_REWARD_AMOUNT, SAFE_DURATION);
        vm.warp(block.timestamp + SAFE_DURATION + 1);
        s.notifyRewardAmountB(SAFE_REWARD_AMOUNT, SAFE_DURATION);

        vm.startPrank(user);
        tokenB.mint(user, 1000 ether);
        tokenB.approve(address(s), type(uint256).max);
        s.stakeB(DEFAULT_STAKE);
        vm.warp(block.timestamp + SAFE_DURATION);
        tokenB.setFeeBps(2000);
        vm.expectRevert(StakingExecutionErrors.ExcessiveTransferFee.selector);
        s.claimB();
        vm.stopPrank();
    }

    /// @notice When accumulated rounding dust reaches `DUST_TOLERANCE`, it is swept into `availableRewards`.
    function testDustRecyclesAtTolerance() public {
        rewardToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.notifyRewardAmountA(100 ether, 100 days);
        vm.startPrank(user);
        stakingToken.approve(address(dualPoolStaking), type(uint256).max);
        dualPoolStaking.stakeA(7 wei);
        for (uint256 i; i < 15; ++i) {
            vm.warp(block.timestamp + 6 hours);
            _mintStaking(user, 1 wei);
            dualPoolStaking.stakeA(1 wei);
        }
        vm.stopPrank();
        assertLt(dualPoolStaking.poolA().dust, 10, "dust recycled or below tolerance");
    }
}
