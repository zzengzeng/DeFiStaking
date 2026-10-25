// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {DualPoolStaking} from "../src/DualPoolStaking.sol";
import {PoolInfo} from "../src/StakeTypes.sol";

/// @title InvariantMonitor
/// @notice Read-only recomputation of the core's accounting checks for off-chain monitoring.
/// @dev On-chain, `_assertInvariantB` emits `InvariantViolated` and then reverts, so the event is rolled back and never
///      reaches an indexer (review Q29). Monitoring therefore must not wait for that event: it polls this snapshot
///      (every block or on a short interval) and alerts on the flags below. All reads are `view`; nothing is written.
library InvariantMonitor {
    // ---- P0: funds at risk / user transactions will revert ----
    /// TokenB balance does not cover liabilities, **without** counting `badDebt` (strict, physical check).
    uint256 internal constant PHYSICAL_SHORTFALL_B = 1 << 0;
    /// The on-chain check (`balance + badDebt + DUST_TOLERANCE >= required`) fails: every path that asserts reverts.
    uint256 internal constant ONCHAIN_INVARIANT_FAILS = 1 << 1;
    /// `bookedUserRewardsA > totalPendingA`: withdraw / claim on Pool A revert `BookedRewardsExceedPending`.
    uint256 internal constant BOOKED_EXCEEDS_PENDING_A = 1 << 2;
    /// `bookedUserRewardsB > totalPendingB`.
    uint256 internal constant BOOKED_EXCEEDS_PENDING_B = 1 << 3;
    /// TokenA balance below Pool A principal.
    uint256 internal constant TOKEN_A_SHORTFALL = 1 << 4;
    // ---- P1: accounting anomaly, act within the hour ----
    /// `badDebtA + badDebtB > 0`.
    uint256 internal constant BAD_DEBT = 1 << 5;
    /// Active, staked schedule whose `availableRewards` cannot fund `rewardRate` until `periodFinish` (bad debt ahead).
    uint256 internal constant UNDERFUNDED_SCHEDULE = 1 << 6;
    /// Catch-up gap exceeds one entrypoint's loop budget (`MAX_CATCHUP_ITERATIONS × MAX_DELTA_TIME`): crank first.
    uint256 internal constant CATCHUP_BACKLOG = 1 << 7;
    // ---- P2: hygiene ----
    /// `now > periodFinish` while `availableRewards > 0` (stale schedule; re-anchors on the next entrypoint).
    uint256 internal constant STALE_SCHEDULE = 1 << 8;
    /// Active window with budget but `rewardRate == 0` (should never happen).
    uint256 internal constant ZERO_RATE_WITH_BUDGET = 1 << 9;

    uint256 internal constant P0_MASK = PHYSICAL_SHORTFALL_B | ONCHAIN_INVARIANT_FAILS | BOOKED_EXCEEDS_PENDING_A
        | BOOKED_EXCEEDS_PENDING_B | TOKEN_A_SHORTFALL;
    uint256 internal constant P1_MASK = BAD_DEBT | UNDERFUNDED_SCHEDULE | CATCHUP_BACKLOG;

    struct Report {
        uint256 balanceA;
        uint256 balanceB;
        /// `poolB.totalStaked + Σ totalPending + Σ availableRewards + unclaimedFeesB + Σ dust`.
        uint256 requiredB;
        uint256 badDebt;
        /// `requiredB − balanceB` when positive (strict leg, ignores `badDebt`).
        uint256 physicalShortfallB;
        bool paused;
        bool emergencyMode;
        bool shutdown;
        /// `false` when the core predates the `shutdownFinalized` slot.
        bool shutdownFinalized;
        /// Bitmask of the flags above.
        uint256 alerts;
    }

    function snapshot(DualPoolStaking core) internal view returns (Report memory r) {
        PoolInfo memory a = core.poolA();
        PoolInfo memory b = core.poolB();
        r.balanceA = a.stakingToken.balanceOf(address(core));
        r.balanceB = IERC20(address(core.rewardToken())).balanceOf(address(core));
        r.requiredB = b.totalStaked + a.totalPending + b.totalPending + a.availableRewards + b.availableRewards
            + core.unclaimedFeesB() + a.dust + b.dust;
        r.badDebt = a.badDebt + b.badDebt;
        r.paused = core.paused();
        r.emergencyMode = core.emergencyMode();
        r.shutdown = core.shutdown();
        (bool ok, bytes memory ret) = address(core).staticcall(abi.encodeWithSignature("shutdownFinalized()"));
        r.shutdownFinalized = ok && ret.length == 32 && abi.decode(ret, (bool));

        uint256 tol = core.DUST_TOLERANCE();
        if (r.balanceB < r.requiredB) {
            r.physicalShortfallB = r.requiredB - r.balanceB;
            if (r.physicalShortfallB > tol) r.alerts |= PHYSICAL_SHORTFALL_B;
        }
        if (r.balanceB + r.badDebt + tol < r.requiredB) r.alerts |= ONCHAIN_INVARIANT_FAILS;
        if (core.bookedUserRewardsA() > a.totalPending) r.alerts |= BOOKED_EXCEEDS_PENDING_A;
        if (core.bookedUserRewardsB() > b.totalPending) r.alerts |= BOOKED_EXCEEDS_PENDING_B;
        if (r.balanceA < a.totalStaked) r.alerts |= TOKEN_A_SHORTFALL;
        if (r.badDebt > 0) r.alerts |= BAD_DEBT;

        uint256 clock = r.paused && core.pausedAt() != 0 ? core.pausedAt() : block.timestamp;
        uint256 loopSpan = core.MAX_CATCHUP_ITERATIONS() * core.MAX_DELTA_TIME();
        r.alerts |= _poolFlags(a, clock, loopSpan) | _poolFlags(b, clock, loopSpan);
    }

    function _poolFlags(PoolInfo memory p, uint256 clock, uint256 loopSpan) private pure returns (uint256 f) {
        uint256 cap = clock < p.periodFinish ? clock : p.periodFinish;
        if (cap > p.lastUpdateTime && cap - p.lastUpdateTime > loopSpan) f |= CATCHUP_BACKLOG;
        if (p.periodFinish > clock) {
            if (p.totalStaked > 0 && p.lastUpdateTime < p.periodFinish) {
                if (p.availableRewards < p.rewardRate * (p.periodFinish - p.lastUpdateTime)) {
                    f |= UNDERFUNDED_SCHEDULE;
                }
            }
            if (p.rewardRate == 0 && p.availableRewards > 0) f |= ZERO_RATE_WITH_BUDGET;
        } else if (p.availableRewards > 0) {
            f |= STALE_SCHEDULE;
        }
    }
}

/// @title CheckInvariants
/// @notice `forge script script/CheckInvariants.s.sol --rpc-url $RPC_URL` with `CORE=<DualPoolStaking address>`.
/// @dev Prints the snapshot and one line per raised flag. With `FAIL_ON=P0` (or `P1`) the script reverts when a flag of
///      that severity or higher is raised, so a cron job / CI step gets a non-zero exit code. Read-only: never broadcast.
contract CheckInvariants is Script {
    function run() external view {
        DualPoolStaking core = DualPoolStaking(vm.envAddress("CORE"));
        InvariantMonitor.Report memory r = InvariantMonitor.snapshot(core);
        _print(r);

        string memory failOn = vm.envOr("FAIL_ON", string(""));
        uint256 mask = _eq(failOn, "P0")
            ? InvariantMonitor.P0_MASK
            : _eq(failOn, "P1") ? InvariantMonitor.P0_MASK | InvariantMonitor.P1_MASK : 0;
        if (r.alerts & mask != 0) revert("CheckInvariants: alert raised");
    }

    function _print(InvariantMonitor.Report memory r) internal pure {
        console.log("balanceB          ", r.balanceB);
        console.log("requiredB         ", r.requiredB);
        console.log("badDebt (A+B)     ", r.badDebt);
        console.log("physicalShortfallB", r.physicalShortfallB);
        console.log("balanceA          ", r.balanceA);
        console.log("paused / emergency / shutdown / finalized");
        console.log(r.paused, r.emergencyMode, r.shutdown);
        console.log(r.shutdownFinalized);
        if (r.alerts == 0) {
            console.log("OK: no alerts");
            return;
        }
        _flag(r.alerts, InvariantMonitor.PHYSICAL_SHORTFALL_B, "P0 PHYSICAL_SHORTFALL_B");
        _flag(r.alerts, InvariantMonitor.ONCHAIN_INVARIANT_FAILS, "P0 ONCHAIN_INVARIANT_FAILS");
        _flag(r.alerts, InvariantMonitor.BOOKED_EXCEEDS_PENDING_A, "P0 BOOKED_EXCEEDS_PENDING_A");
        _flag(r.alerts, InvariantMonitor.BOOKED_EXCEEDS_PENDING_B, "P0 BOOKED_EXCEEDS_PENDING_B");
        _flag(r.alerts, InvariantMonitor.TOKEN_A_SHORTFALL, "P0 TOKEN_A_SHORTFALL");
        _flag(r.alerts, InvariantMonitor.BAD_DEBT, "P1 BAD_DEBT");
        _flag(r.alerts, InvariantMonitor.UNDERFUNDED_SCHEDULE, "P1 UNDERFUNDED_SCHEDULE");
        _flag(r.alerts, InvariantMonitor.CATCHUP_BACKLOG, "P1 CATCHUP_BACKLOG");
        _flag(r.alerts, InvariantMonitor.STALE_SCHEDULE, "P2 STALE_SCHEDULE");
        _flag(r.alerts, InvariantMonitor.ZERO_RATE_WITH_BUDGET, "P2 ZERO_RATE_WITH_BUDGET");
    }

    function _flag(uint256 alerts, uint256 bit, string memory label) internal pure {
        if (alerts & bit != 0) console.log("ALERT", label);
    }

    function _eq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
