// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {PoolInfo, UserInfo, PendingOp} from "../StakeTypes.sol";

/// @title DualPoolStorageLayout
/// @notice Abstract base holding **exact** storage field order shared by `DualPoolStaking` and delegatecall modules.
/// @dev `DualPoolUserModule` / `DualPoolAdminModule` inherit this so `delegatecall` reads/writes the core’s slots. **Do not reorder, rename, or insert** fields without updating `DualPoolStaking` and migration notes.
/// @custom:layout The core contract duplicates this ordering for its own bytecode; any drift breaks `delegatecall` until both sides are migrated together.
abstract contract DualPoolStorageLayout is Ownable, AccessControl, ReentrancyGuard, Pausable {
    /// @notice Reward token (TokenB, 18 decimals): same asset used to pay Pool A rewards and as Pool B stake/reward unit.
    IERC20 public rewardToken;

    /// @dev Fixed-point scale for `accRewardPerToken` and user reward settlement (`PoolAccrualLib`).
    uint256 public constant PRECISION = 1e18;
    /// @dev Upper bound on a single `updateGlobal` time step to bound reward accrual in one call.
    uint256 public constant MAX_DELTA_TIME = 30 days;
    /// @dev Sub-wei dust bucket recycling threshold in `PoolAccrualLib` (matches core `DUST_TOLERANCE`).
    uint256 public constant DUST_TOLERANCE = 10 wei;
    /// @dev Denominator for all basis-point fee and cap parameters (`10_000` = 100%).
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant MAX_EARLY_EXIT_PENALTY_BP = 2000;
    uint256 public constant MAX_WITHDRAW_BP = 500;
    uint256 public constant MAX_MIDTERM_BP = 500;
    uint256 public constant MAX_LOCK_DURATION = 90 days;
    uint256 public constant MAX_DURATION = 365 days;
    uint256 public constant MIN_REWARD_RATE_DURATION = 1 days;
    uint256 public constant SECONDS_PER_YEAR = 31_536_000;
    uint256 public constant MAX_APR_BP = 20_000;
    uint256 public constant UNPAUSE_COOLDOWN = 1 days;
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    bytes32 public constant OP_SET_FEES = keccak256("SET_FEES");
    bytes32 public constant OP_SET_LOCK_DURATION = keccak256("SET_LOCK_DURATION");
    bytes32 public constant OP_REBALANCE_BUDGETS = keccak256("REBALANCE_BUDGETS");
    bytes32 public constant OP_SET_TVL_CAP_A = keccak256("SET_TVL_CAP_A");
    bytes32 public constant OP_SET_TVL_CAP_B = keccak256("SET_TVL_CAP_B");
    bytes32 public constant OP_SET_MIN_STAKE_A = keccak256("SET_MIN_STAKE_A");
    bytes32 public constant OP_SET_MIN_STAKE_B = keccak256("SET_MIN_STAKE_B");
    bytes32 public constant OP_SET_REWARD_DURATION_A = keccak256("SET_REWARD_DURATION_A");
    bytes32 public constant OP_SET_REWARD_DURATION_B = keccak256("SET_REWARD_DURATION_B");
    bytes32 public constant OP_SET_MIN_CLAIM_AMOUNT = keccak256("SET_MIN_CLAIM_AMOUNT");
    bytes32 public constant OP_RECOVER_TOKEN = keccak256("RECOVER_TOKEN");
    bytes32 public constant OP_CLAIM_FEES = keccak256("CLAIM_FEES");
    bytes32 public constant OP_SHUTDOWN = keccak256("SHUTDOWN");
    bytes32 public constant OP_RESOLVE_BAD_DEBT = keccak256("RESOLVE_BAD_DEBT");
    bytes32 public constant OP_NOTIFY_REWARD_A = keccak256("NOTIFY_REWARD_A");
    bytes32 public constant OP_NOTIFY_REWARD_B = keccak256("NOTIFY_REWARD_B");
    bytes32 public constant OP_SET_FEE_RECIPIENT = keccak256("SET_FEE_RECIPIENT");
    bytes32 public constant OP_SET_FORFEITED_RECIPIENT = keccak256("SET_FORFEITED_RECIPIENT");
    bytes32 public constant OP_SET_MIN_EARLY_EXIT_B = keccak256("SET_MIN_EARLY_EXIT_B");
    bytes32 public constant OP_SET_MAX_TRANSFER_FEE_BP = keccak256("SET_MAX_TRANSFER_FEE_BP");

    /// @notice Rolling Pool B lock duration applied on each stake/compound (seconds).
    uint256 public lockDuration = 7 days;
    /// @notice Minimum seconds between user claim / compound / force-claim actions per address.
    uint256 public claimCooldown = 1 days;
    uint256 public constant SHUTDOWN_DEADLOCK_BYPASS = 1095 days;
    uint256 public maxTransferFeeBP = 1000;
    uint256 public penaltyfeeBP = 1000;
    uint256 public withdrawFeeBP = 100;
    uint256 public midTermFeeBP = 50;
    uint256 public minEarlyExitAmountB = 10;
    /// @notice Pool B withdrawal fees accumulated on-contract until swept by admin (`claimFees`).
    uint256 public unclaimedFeesB;
    /// @notice Timestamp when emergency mode was activated (`0` if never).
    uint256 public emergencyActivatedAt;

    /// @notice Minimum settled reward amount required for a normal single-pool claim.
    uint256 public minClaimAmount;
    uint256 public constant MAX_MIN_CLAIM_AMOUNT = 1e17 wei;

    /// @notice Timestamp when shutdown was activated (`0` if not shutdown).
    uint256 public shutdownAt;
    /// @notice Timestamp when `pause()` was last invoked (`0` if not paused).
    uint256 public pausedAt;
    /// @notice Earliest timestamp `unpause()` may succeed after a pause.
    uint256 public unpauseAt;
    /// @notice Recipient of swept Pool B withdrawal fees.
    address public feeRecipient;
    /// @notice Recipient configured for forfeited-reward / penalty routing (see PRD).
    address public forfeitedRecipient;
    address internal constant ERC1820_REGISTRY_ADDR = 0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24;
    bytes32 internal constant ERC777_RECIPIENT_HASH = keccak256("ERC777TokensRecipient");
    bytes32 internal constant ERC777_SENDER_HASH = keccak256("ERC777TokensSender");

    /// @notice Global emergency flag (restricts user paths; enables emergency withdrawals).
    bool public emergencyMode;
    /// @notice Global shutdown flag (terminal / settlement semantics per admin paths).
    bool public shutdown;

    /// @dev Aggregate Pool A accounting (`PoolInfo`); exposed via core `poolA()` only on the modular core.
    PoolInfo internal poolAState;
    /// @dev Aggregate Pool B accounting (`PoolInfo`).
    PoolInfo internal poolBState;

    /// @notice Per-address Pool A user ledger.
    mapping(address => UserInfo) public userInfoA;
    /// @notice Per-address Pool B user ledger.
    mapping(address => UserInfo) public userInfoB;
    /// @notice Pool B per-user unlock timestamp for penalty vs fee routing.
    mapping(address => uint256) public unlockTimeB;
    /// @notice Pool B per-user weighted-average deposit time for holding-duration fees.
    mapping(address => uint256) public stakeTimestampB;
    /// @notice Last timestamp a user invoked claim / compound / force-claim (cooldown enforcement).
    mapping(address => uint256) public lastClaimTime;
    /// @notice Optional timelock metadata keyed by governance operation id.
    mapping(bytes32 => PendingOp) public pendingOps;
    /// @notice `delegatecall` target for all user stake/withdraw/claim bodies (`DualPoolUserModule`).
    /// @dev Must mirror `DualPoolStaking` slot order after `pendingOps` (delegatecall layout).
    address public userModule;
    /// @notice `delegatecall` target for admin/operator notify and parameter mutations (`DualPoolAdminModule`).
    address public adminModule;
    /// @dev Immutable cap for `MAX_REWARD_RATE_*` derivation (PRD: deploy-time supply ceiling, not live `totalSupply()`).
    uint256 public maxTotalSupplyBForRewardRateCap;

    /// @notice Satisfies `Ownable` construction for abstract layout; core contract supplies real `Ownable(msg.sender)` in its constructor.
    constructor() Ownable(msg.sender) {}
}
