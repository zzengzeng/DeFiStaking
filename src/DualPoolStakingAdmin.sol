// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Pool} from "./StakeTypes.sol";

/// @notice Minimal view surface of `DualPoolStakingSuperAdmin` required by this module.
/// @dev Declared locally (rather than importing the concrete registry) so the admin
///      module stays decoupled from the role implementation and can be tested with a mock.
interface ISuperAdmin {
    /// @notice Returns the `ADMIN_ROLE` identifier used by the registry.
    function ADMIN_ROLE() external view returns (bytes32);

    /// @notice Returns whether `account` holds `role` in the registry.
    function hasRole(bytes32 role, address account) external view returns (bool);
}

/// @title DualPoolStakingAdmin
/// @author DeFiStaking Team
/// @notice Admin-owned protocol parameters for the DualPool staking system.
/// @dev Roles live in `DualPoolStakingSuperAdmin`: this contract only *reads*
///      `ADMIN_ROLE` via `hasRole(...)` and never grants or revokes roles.
///      Every setter is gated by {onlyAdmin} and emits an event carrying enough data
///      for off-chain indexing. Production calls must be routed through a ≥48h Timelock
///      / governance facade (PRD §2.1.1); that delay is enforced outside this contract
///      and is intentionally not re-implemented here.
///      Setters only store configuration. Enforcement of these values happens in the
///      core staking contract (TVL caps, minimum stake, claim threshold, FOT tolerance,
///      fee collection and reward scheduling).
contract DualPoolStakingAdmin {
    // ── Constants ─────────────────────────────────────────────────────────

    /// @notice Maximum lock duration accepted by {setLockDuration} (PRD §3.1).
    uint256 public constant MAX_LOCK_DURATION = 90 days;

    /// @notice Initial / default lock duration (PRD §3.4).
    uint256 public constant DEFAULT_LOCK_DURATION = 7 days;

    /// @notice Basis-point denominator: 10_000 BP = 100% (PRD §3.1).
    uint256 public constant BASIS_POINTS = 10_000;

    /// @notice Upper bound for {setMinClaimAmount} (0.1 TokenB, PRD §3.1).
    uint256 public constant MAX_MIN_CLAIM_AMOUNT = 1e17;

    /// @notice Minimum governance-specified reward window (PRD §3.1 / §4.5).
    uint256 public constant MIN_REWARD_DURATION = 1 days;

    /// @notice Maximum governance-specified reward window (PRD §3.1 / §4.5).
    uint256 public constant MAX_REWARD_DURATION = 365 days;

    /// @notice Maximum Pool B early-exit penalty (20%, PRD §3.1).
    uint256 public constant MAX_EARLY_EXIT_PENALTY_BP = 2000;

    /// @notice Maximum Pool B short-term maturity withdrawal fee (5%, PRD §3.1).
    uint256 public constant MAX_WITHDRAW_BP = 500;

    /// @notice Maximum Pool B mid-term maturity withdrawal fee (5%, PRD §3.1).
    uint256 public constant MAX_MIDTERM_BP = 500;

    // ── Immutables ────────────────────────────────────────────────────────

    /// @notice Role registry queried by {onlyAdmin}.
    ISuperAdmin public immutable superAdmin;

    /// @notice Cached `ADMIN_ROLE` value read from {superAdmin} at construction.
    /// @dev Read once into an immutable so the role value can never drift from the
    ///      registry (no locally recomputed `keccak256("ADMIN_ROLE")`).
    bytes32 public immutable ADMIN_ROLE;

    // ── State ─────────────────────────────────────────────────────────────

    /// @notice Base lock duration applied on future stake / compound operations.
    /// @dev Changing this value never rewrites an existing position's `unlockTime`
    ///      (PRD §4.3). Existing lock periods still drive Shutdown withdrawal tiers.
    uint256 public lockDuration = DEFAULT_LOCK_DURATION;

    /// @notice Address receiving Pool B withdrawal fees and shutdown residuals.
    /// @dev Must be non-zero before `claimFees` can be used. Because `claimFees` reads
    ///      the current value at execution time, changing the recipient also redirects
    ///      fees already accumulated in `unclaimedFeesB`. PRD §3.4 forbids leaving this
    ///      as the deployer wallet; it must be set explicitly to the treasury.
    address public feeRecipient;

    /// @notice Maximum tolerated fee-on-transfer loss, in basis points (PRD §4.6).
    /// @dev `0` means zero tolerance (exact delivery) and is NOT "disabled";
    ///      `BASIS_POINTS` (10_000) tolerates any loss and effectively forfeits the
    ///      guard. Applies to future transfers only; no retroactive re-measurement.
    uint256 public maxTransferFeeBP = 1000;

    /// @notice Minimum reward amount claimable in a single claim call (dust damping).
    /// @dev `0` means no threshold. Raising it can make small tail rewards unclaimable
    ///      through `claimA` / `claimB` and healthy-state `forceClaimAll`; such rewards
    ///      remain claimable after Shutdown or once governance lowers the threshold
    ///      again (PRD §5.4).
    uint256 public minClaimAmount = 0;

    /// @notice Pool B early-exit penalty rate (basis points).
    uint256 public penaltyFeeBP = 1000;

    /// @notice Pool B short-term maturity withdrawal fee rate (basis points).
    uint256 public withdrawFeeBP = 100;

    /// @notice Pool B mid-term maturity withdrawal fee rate (basis points).
    uint256 public midTermFeeBP = 50;

    /// @notice Minimum Pool B principal for an early exit.
    /// @dev Must satisfy `minEarlyExitAmountB * penaltyFeeBP / BASIS_POINTS >= 1`
    ///      whenever `penaltyFeeBP > 0`, so an early exit can never truncate the
    ///      penalty to zero (PRD §3.4). The default (10) satisfies the default
    ///      penalty rate of 1000 BP.
    uint256 public minEarlyExitAmountB = 10;

    /// @notice Per-pool business TVL cap. `0` means unlimited (PRD §3.4).
    /// @dev Independent from the non-disableable `MAX_REWARD_SHARES_A/B` hard limits.
    ///      How a cap below the current TVL is handled is decided by the core contract.
    mapping(Pool => uint256) public maxTVLCap;

    /// @notice Per-pool minimum stake amount (dust protection). `0` means no minimum.
    /// @dev Enforced by the core `stakeA` / `stakeB` paths on future stakes.
    mapping(Pool => uint256) public minStakeAmount;

    /// @notice Per-pool default reward window used by `scheduleRewards(pool, 0)`.
    /// @dev `0` clears the default, which makes `scheduleRewards(pool, 0)` revert.
    ///      Non-zero values must fall within
    ///      [{MIN_REWARD_DURATION}, {MAX_REWARD_DURATION}]. This value only feeds
    ///      `scheduleRewards(pool, 0)`; it never changes the rate or finish time of an
    ///      active schedule (PRD §6.3).
    mapping(Pool => uint256) public rewardDuration;

    // ── Errors ────────────────────────────────────────────────────────────

    /// @notice Thrown when a required address argument is the zero address.
    error ZeroAddress();
    /// @notice Thrown when the caller does not hold `ADMIN_ROLE` in the registry.
    error NotAdmin();
    /// @notice Thrown when `newLockDuration` is zero or exceeds {MAX_LOCK_DURATION}.
    error InvalidLockDuration();
    /// @notice Thrown when the fee recipient is the zero address or this contract.
    error InvalidFeeRecipient();
    /// @notice Thrown when `maxTransferFeeBP` exceeds {BASIS_POINTS}.
    error InvalidMaxTransferFeeBP();
    /// @notice Thrown when `minClaimAmount` exceeds {MAX_MIN_CLAIM_AMOUNT}.
    error InvalidMinClaimAmount();
    /// @notice Thrown when a reward window is non-zero but outside
    ///         [{MIN_REWARD_DURATION}, {MAX_REWARD_DURATION}].
    error InvalidRewardDuration();
    /// @notice Thrown when the penalty rate exceeds its cap or would break the
    ///         `minEarlyExitAmountB` linkage.
    error InvalidPenaltyFee();
    /// @notice Thrown when the withdrawal fee exceeds its cap.
    error InvalidWithdrawFee();
    /// @notice Thrown when the mid-term fee exceeds its cap.
    error InvalidMidTermFee();
    /// @notice Thrown when `minEarlyExitAmountB` is too small for the current penalty.
    error InvalidMinEarlyExitAmount();

    // ── Events ────────────────────────────────────────────────────────────

    /// @notice Emitted when the base lock duration changes.
    event LockDurationUpdated(uint256 oldLockDuration, uint256 newLockDuration, uint256 currentTime);

    /// @notice Emitted when the fee recipient changes.
    event FeeRecipientUpdated(address indexed oldAddr, address indexed newAddr, uint256 currentTime);

    /// @notice Emitted when the FOT tolerance changes.
    event MaxTransferFeeBPUpdated(uint256 oldMaxTransferFeeBP, uint256 newMaxTransferFeeBP, uint256 currentTime);

    /// @notice Emitted when the minimum claim amount changes.
    event MinClaimAmountUpdated(uint256 oldMinClaimAmount, uint256 newMinClaimAmount, uint256 currentTime);

    /// @notice Emitted when a pool TVL cap changes.
    event TVLCapUpdated(Pool indexed pool, uint256 oldCap, uint256 newCap, uint256 currentTime);

    /// @notice Emitted when a pool minimum stake amount changes.
    event MinStakeAmountUpdated(Pool indexed pool, uint256 oldAmount, uint256 newAmount, uint256 currentTime);

    /// @notice Emitted when a pool default reward window changes.
    event RewardDurationUpdated(
        Pool indexed pool, uint256 oldRewardDuration, uint256 newRewardDuration, uint256 currentTime
    );

    /// @notice Emitted when the three Pool B fee rates change.
    /// @dev Mirrors PRD §8 exactly: it carries no previous-value fields.
    event FeesUpdated(uint256 penaltyBP, uint256 withdrawBP, uint256 midTermBP, uint256 currentTime);

    /// @notice Emitted when the minimum early-exit amount changes.
    event MinEarlyExitAmountBUpdated(uint256 oldEarlyExitAmount, uint256 newEarlyExitAmount, uint256 currentTime);

    // ── Constructor ───────────────────────────────────────────────────────

    /// @notice Deploys the admin module against an existing role registry.
    /// @dev Reverts on the zero address. Reads and caches `ADMIN_ROLE` from the
    ///      registry so the module never recomputes the role identifier locally.
    /// @param _superAddress Address of the deployed `DualPoolStakingSuperAdmin`.
    constructor(address _superAddress) {
        if (_superAddress == address(0)) revert ZeroAddress();
        superAdmin = ISuperAdmin(_superAddress);
        ADMIN_ROLE = ISuperAdmin(_superAddress).ADMIN_ROLE();
    }

    // ── Modifiers ─────────────────────────────────────────────────────────

    /// @notice Restricts the caller to holders of `ADMIN_ROLE` in the registry.
    /// @dev Reads the registry on every call; the role is never cached per caller.
    modifier onlyAdmin() {
        if (!superAdmin.hasRole(ADMIN_ROLE, msg.sender)) revert NotAdmin();
        _;
    }

    // ── Setters ───────────────────────────────────────────────────────────

    /// @notice Sets the base lock duration applied to future stake / compound operations.
    /// @dev Reverts if `newLockDuration` is zero or above {MAX_LOCK_DURATION}.
    ///      Existing positions keep their current `unlockTime`; this setter only
    ///      affects future operations (PRD §4.3).
    /// @param newLockDuration New lock duration in seconds.
    function setLockDuration(uint256 newLockDuration) external onlyAdmin {
        if (newLockDuration == 0 || newLockDuration > MAX_LOCK_DURATION) {
            revert InvalidLockDuration();
        }

        uint256 oldLockDuration = lockDuration;
        lockDuration = newLockDuration;
        emit LockDurationUpdated(oldLockDuration, newLockDuration, block.timestamp);
    }

    /// @notice Sets the treasury address that receives Pool B fees and shutdown residuals.
    /// @dev Reverts for the zero address or this contract. Because `claimFees` reads the
    ///      current value at execution time, this also redirects fees already accumulated
    ///      in `unclaimedFeesB`. Production must call this through a Timelock.
    /// @param newFeeRecipient New treasury address.
    function setFeeRecipient(address newFeeRecipient) external onlyAdmin {
        if (newFeeRecipient == address(0)) revert ZeroAddress();
        if (newFeeRecipient == address(this)) revert InvalidFeeRecipient();
        address oldFeeRecipient = feeRecipient;
        feeRecipient = newFeeRecipient;
        emit FeeRecipientUpdated(oldFeeRecipient, newFeeRecipient, block.timestamp);
    }

    /// @notice Sets the maximum tolerated fee-on-transfer loss for token transfers.
    /// @dev `0` requires exact delivery (strictest mode, NOT "disabled"); `BASIS_POINTS`
    ///      tolerates any loss and effectively forfeits the guard. Reverts above
    ///      `BASIS_POINTS`. Applies to future transfers only.
    /// @param newValue New tolerance in basis points.
    function setMaxTransferFeeBP(uint256 newValue) external onlyAdmin {
        if (newValue > BASIS_POINTS) revert InvalidMaxTransferFeeBP();
        uint256 old = maxTransferFeeBP;
        maxTransferFeeBP = newValue;
        emit MaxTransferFeeBPUpdated(old, newValue, block.timestamp);
    }

    /// @notice Sets the minimum reward amount claimable in a single claim call.
    /// @dev `0` disables the threshold. Raising it can leave small tail rewards
    ///      unclaimable through `claimA` / `claimB` and healthy-state `forceClaimAll`
    ///      until governance lowers it or the protocol enters Shutdown.
    /// @param newValue New minimum claim amount in TokenB base units, capped at
    ///        {MAX_MIN_CLAIM_AMOUNT}.
    function setMinClaimAmount(uint256 newValue) external onlyAdmin {
        if (newValue > MAX_MIN_CLAIM_AMOUNT) revert InvalidMinClaimAmount();
        uint256 old = minClaimAmount;
        minClaimAmount = newValue;
        emit MinClaimAmountUpdated(old, newValue, block.timestamp);
    }

    /// @notice Sets the business TVL cap for a pool.
    /// @dev `0` means unlimited and does not override the numerical hard cap
    ///      `MAX_REWARD_SHARES_A/B`. Whether a cap below the current TVL is accepted
    ///      is decided by the core implementation.
    /// @param pool Pool whose cap is updated.
    /// @param newValue New cap in staking-token base units (`0` = unlimited).
    function setTVLCap(Pool pool, uint256 newValue) external onlyAdmin {
        uint256 old = maxTVLCap[pool];
        maxTVLCap[pool] = newValue;
        emit TVLCapUpdated(pool, old, newValue, block.timestamp);
    }

    /// @notice Sets the minimum stake amount for a pool (dust protection).
    /// @dev `0` means no minimum. The core `stakeA` / `stakeB` paths enforce it.
    /// @param pool Pool whose minimum is updated.
    /// @param newValue New minimum in staking-token base units.
    function setMinStakeAmount(Pool pool, uint256 newValue) external onlyAdmin {
        uint256 old = minStakeAmount[pool];
        minStakeAmount[pool] = newValue;
        emit MinStakeAmountUpdated(pool, old, newValue, block.timestamp);
    }

    /// @notice Sets the default reward window for a pool.
    /// @dev `0` clears the default, making `scheduleRewards(pool, 0)` revert. Non-zero
    ///      values must fall within [{MIN_REWARD_DURATION}, {MAX_REWARD_DURATION}].
    ///      This only feeds `scheduleRewards(pool, 0)`: it never changes the rate or
    ///      finish time of an active schedule (PRD §6.3).
    /// @param pool Pool whose default window is updated.
    /// @param newValue New default window in seconds (`0` = clear).
    function setRewardDuration(Pool pool, uint256 newValue) external onlyAdmin {
        uint256 old = rewardDuration[pool];
        if (newValue != 0 && (newValue < MIN_REWARD_DURATION || newValue > MAX_REWARD_DURATION)) {
            revert InvalidRewardDuration();
        }
        rewardDuration[pool] = newValue;
        emit RewardDurationUpdated(pool, old, newValue, block.timestamp);
    }

    /// @notice Sets the three Pool B fee rates atomically.
    /// @dev Each rate must respect its own cap. When `penaltyBP > 0`, the current
    ///      `minEarlyExitAmountB` must be at least `ceilDiv(BASIS_POINTS, penaltyBP)`,
    ///      so an early exit can never truncate the penalty to zero.
    ///      Some transitions therefore require two ordered calls: first raise
    ///      `minEarlyExitAmountB`, then lower `penaltyFeeBP`.
    ///      The event mirrors PRD §8 and carries no previous values.
    /// @param penaltyBP Early-exit penalty rate (BP), capped at {MAX_EARLY_EXIT_PENALTY_BP}.
    /// @param withdrawBP Short-term maturity withdrawal fee (BP), capped at {MAX_WITHDRAW_BP}.
    /// @param midTermBP Mid-term maturity withdrawal fee (BP), capped at {MAX_MIDTERM_BP}.
    function setFees(uint256 penaltyBP, uint256 withdrawBP, uint256 midTermBP) external onlyAdmin {
        if (penaltyBP > MAX_EARLY_EXIT_PENALTY_BP) revert InvalidPenaltyFee();
        if (withdrawBP > MAX_WITHDRAW_BP) revert InvalidWithdrawFee();
        if (midTermBP > MAX_MIDTERM_BP) revert InvalidMidTermFee();
        if (minEarlyExitAmountB < _minExitForPenalty(penaltyBP)) revert InvalidPenaltyFee();
        penaltyFeeBP = penaltyBP;
        withdrawFeeBP = withdrawBP;
        midTermFeeBP = midTermBP;
        emit FeesUpdated(penaltyBP, withdrawBP, midTermBP, block.timestamp);
    }

    /// @notice Sets the minimum Pool B principal for an early exit.
    /// @dev When `penaltyFeeBP > 0`, `newValue` must be at least
    ///      `ceilDiv(BASIS_POINTS, penaltyFeeBP)` so the penalty cannot truncate to
    ///      zero (PRD §3.4). When `penaltyFeeBP == 0` the check is skipped.
    /// @param newValue New minimum early-exit amount in TokenB base units.
    function setMinEarlyExitAmountB(uint256 newValue) external onlyAdmin {
        if (penaltyFeeBP > 0 && newValue < _minExitForPenalty(penaltyFeeBP)) {
            revert InvalidMinEarlyExitAmount();
        }
        uint256 old = minEarlyExitAmountB;
        minEarlyExitAmountB = newValue;
        emit MinEarlyExitAmountBUpdated(old, newValue, block.timestamp);
    }

    // ── Internal helpers ──────────────────────────────────────────────────

    /// @dev Smallest early-exit amount whose penalty is at least 1 wei for `penaltyBP`,
    ///      i.e. `ceilDiv(BASIS_POINTS, penaltyBP)`. Returns 0 when `penaltyBP == 0`
    ///      (no constraint and no division by zero). Uses ceiling division to avoid
    ///      the multiplication overflow of `minAmount * penaltyBP`.
    /// @param penaltyBP Penalty rate in basis points.
    function _minExitForPenalty(uint256 penaltyBP) internal pure returns (uint256) {
        if (penaltyBP == 0) return 0;
        return (BASIS_POINTS + penaltyBP - 1) / penaltyBP;
    }
}
