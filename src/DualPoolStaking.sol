// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {Pool, PoolInfo, UserInfo} from "./StakeTypes.sol";
import {StakingExecutionErrors} from "./StakingExecutionErrors.sol";

/// @notice Minimal view into the canonical ERC-1820 registry for ERC777 deployment checks.
/// @dev Registry address is fixed at `0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24` on Ethereum mainnet and many L2s; if bytecode is absent the core skips hook checks.
interface IERC1820Registry {
    /// @notice Returns the registered implementer for `account` and `interfaceHash`, if any.
    /// @param account Address whose ERC777 hook registration is queried (core, token, or user).
    /// @param interfaceHash ERC777 `TokensRecipient` / `TokensSender` interface id (or other registered id).
    /// @return implementer Registered hook implementer, or `address(0)` if none.
    function getInterfaceImplementer(address account, bytes32 interfaceHash) external view returns (address implementer);
}

/// @title DualPoolStaking
/// @notice Dual-pool staking and rewards **core**: user and admin **execution** is delegated to external modules via `delegatecall`.
/// @dev Wire `userModule` / `adminModule` immediately after deploy. Storage layout must match `DualPoolStorageLayout` and module bytecode expectations.
contract DualPoolStaking is Ownable, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    /// @notice Reward token (TokenB, 18 decimals), also Pool B’s staking asset.
    IERC20 public rewardToken;

    uint256 public constant PRECISION = 1e18; // Used for fixed-point calculations to maintain precision in reward calculations
    uint256 public constant MAX_DELTA_TIME = 30 days; // Maximum time delta for reward calculations to prevent overflow and ensure accurate reward distribution
    uint256 public constant DUST_TOLERANCE = 10 wei; //  Threshold for accumulating dust rewards that are too small to distribute, allowing them to be added back to the available rewards once they reach this threshold
    uint256 public constant BASIS_POINTS = 10_000; // Basis points used for fee calculations, where 1 basis point is equal to 0.01%
    uint256 public constant MAX_EARLY_EXIT_PENALTY_BP = 2000; // Maximum early exit penalty in basis points (20%), applied when a user withdraws from Pool B before the lock duration has passed
    uint256 public constant MAX_WITHDRAW_BP = 500; // Maximum withdrawal fee in basis points (5%), applied to withdrawals from Pool B regardless of lock status
    uint256 public constant MAX_MIDTERM_BP = 500; // Maximum mid-term fee in basis points (5%), applied to withdrawals from Pool B that occur after the lock duration but before a specified mid-term period has passed
    uint256 public constant MAX_LOCK_DURATION = 90 days; // Maximum lock duration for staked tokens in Pool B, which affects when users can withdraw without penalties
    uint256 public constant MAX_DURATION = 365 days; // Maximum notify reward duration
    uint256 public constant MIN_REWARD_RATE_DURATION = 1 days; // Minimum notify reward duration
    uint256 public constant SECONDS_PER_YEAR = 31_536_000; // Seconds in one year
    uint256 public constant MAX_APR_BP = 20_000; // 200% APR cap for max reward rate derivation
    uint256 public constant UNPAUSE_COOLDOWN = 1 days; // Cooldown period after unpausing the contract before certain actions can be taken, used to prevent abuse of the pause/unpause functionality and allow users time to react to changes in the contract's state
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE"); // Role identifier for admin role, which can be granted to addresses that are allowed to perform administrative actions such as updating contract parameters or managing emergency mode
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE"); // Role identifier for operator role, which can be granted to addresses that are allowed to perform operational actions such as executing time-locked operations or managing reward distributions

    uint256 public lockDuration = 7 days; // Duration for which staked tokens in Pool B are locked, during which early exit penalties apply if withdrawn
    uint256 public claimCooldown = 1 days; // Cooldown period between claims to prevent abuse of the claim function and ensure fair distribution of rewards
    uint256 public constant SHUTDOWN_DEADLOCK_BYPASS = 1095 days; // 3-year bypass for still-staked deadlock
    uint256 public maxTransferFeeBP = 1000; // Max allowed transfer fee for FOT tokens (10%)
    uint256 public penaltyfeeBP = 1000; // Early exit penalty in basis points (10%), applied to withdrawals from Pool B that occur before the lock duration has passed
    uint256 public withdrawFeeBP = 100; // Withdrawal fee in basis points (1%), applied to all withdrawals from Pool B regardless of lock status
    uint256 public midTermFeeBP = 50; // Mid-term fee in basis points (0.5%), applied to withdrawals from Pool B that occur after the lock duration but before a specified mid-term period has passed
    uint256 public minEarlyExitAmountB = 10; // Minimum amount allowed for early exit in Pool B (kept >= ceil(BASIS_POINTS / penaltyfeeBP))
    uint256 public unclaimedFeesB; // Accumulated fees from withdrawals in Pool B that have not yet been claimed by the fee recipient
    uint256 public emergencyActivatedAt; // Timestamp of when emergency mode was activated, used to track the duration of emergency mode and potentially implement time-based restrictions or conditions for exiting emergency mode

    uint256 public minClaimAmount; // Minimum amount of rewards that a user must have accrued before they can claim their rewards, which can be used to encourage users to accumulate more rewards before claiming and reduce transaction costs associated with small claims
    uint256 public constant MAX_MIN_CLAIM_AMOUNT = 1e17 wei; // Maximum minimum claim amount (0.1 reward tokens), used to prevent setting an excessively high minimum claim amount that could prevent users from claiming their rewards

    uint256 public shutdownAt; // Timestamp when shutdown mode is activated
    uint256 public pausedAt; // Timestamp of when the contract was paused, used to enforce cooldown periods for unpausing and to track the duration of the pause state
    uint256 public unpauseAt; // Timestamp of when the contract can be unpaused, calculated based on the pausedAt timestamp and the UNPAUSE_COOLDOWN duration, used to enforce a cooldown period for unpausing the contract to prevent abuse of the pause/unpause functionality and allow users time to react to changes in the contract's state
    address public feeRecipient; // Address that receives the fees collected from withdrawals and early exit penalties in Pool B
    address public forfeitedRecipient; // Address that receives the forfeited rewards from users who withdraw from Pool B before the lock duration has passed, as well as any mid-term fees collected from withdrawals that occur after the lock duration but before a specified mid-term period has passed
    address private constant ERC1820_REGISTRY_ADDR = 0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24;
    bytes32 private constant ERC777_RECIPIENT_HASH = keccak256("ERC777TokensRecipient");
    bytes32 private constant ERC777_SENDER_HASH = keccak256("ERC777TokensSender");

    bool public emergencyMode; // Flag to indicate whether the contract is in emergency mode, which may allow for certain actions to be taken that are not normally permitted, such as allowing users to withdraw without penalties or claim rewards without restrictions

    bool public shutdown; // Flag to indicate whether the contract is in shutdown mode, which may restrict certain actions or allow for emergency withdrawals without penalties in response to critical issues or vulnerabilities

    /// @notice Pool A and Pool B staking tokens must differ.
    error SameStakingTokens();
    /// @notice TokenB must expose 18 decimals for fixed-point reward math.
    error InvalidRewardTokenDecimals();
    /// @notice Accounting invariant (TokenB balance vs liabilities) violated.
    /// @param actual Observed backing (`balance + badDebt`) side.
    /// @param required Sum of liabilities derived from pool state.
    error InvariantViolation(uint256 actual, uint256 required);
    /// @notice Operation blocked while emergency mode is active (unless explicitly allowed elsewhere).
    error EmergencyModeActive();
    /// @notice Reserved zero-duration error (unused in current paths).
    error ZeroDuration();
    /// @notice ERC777 ERC-1820 implementer detected where hooks are forbidden.
    /// @param implementer Non-zero hook implementer returned by the registry.
    error ERC777HookImplementerDetected(address implementer);
    /// @notice Reserved marker if an admin entrypoint is relocated (unused).
    error AdminFunctionMoved();

    event Staked(address indexed user, uint256 amount, uint256 newUnlockTime, Pool indexed pool);
    event Withdrawn(address indexed user, uint256 amount, uint256 feeOrPenalty, bool isEarly, Pool indexed pool);
    event Claimed(address indexed user, uint256 paidA, uint256 paidB, uint256 timestamp);
    event ForceClaimed(
        address indexed user, uint256 paidA, uint256 paidB, uint256 unpaidA, uint256 unpaidB, uint256 timestamp
    );
    event Compounded(
        address indexed user, uint256 amountA, uint256 amountB, uint256 newUserStakedB, uint256 newUnlockTimeB
    );

    event InsufficientBudget(Pool pool, uint256 shortfall, uint256 timestamp);
    event DustAccumulated(Pool pool, uint256 dustAmount, uint256 timestamp);
    /// @param principal Token principal returned to the user (Pool A: TokenA wei; Pool B: TokenB wei).
    /// @param rewardsForfeited User accrued rewards cleared on that pool before rebalance to Pool B budget (`userInfo*.rewards` snapshot).
    event EmergencyWithdrawn(
        address indexed user, uint256 principal, uint256 rewardsForfeited, Pool indexed pool, uint256 withdrawnAt
    );

    event BudgetRebalanced(Pool indexed from, Pool indexed to, uint256 amount, uint256 timestamp);
    event FeesClaimed(address indexed recipient, uint256 amount, uint256 timestamp);

    event TVLCapUpdated(Pool indexed pool, uint256 oldCap, uint256 newCap, uint256 timestamp);
    event MinStakeAmountUpdated(Pool indexed pool, uint256 oldValue, uint256 newValue, uint256 timestamp);
    event RewardDurationUpdated(Pool indexed pool, uint256 oldValue, uint256 newValue, uint256 timestamp);
    event MinClaimAmountUpdated(uint256 oldValue, uint256 newValue, uint256 timestamp);
    event LockDurationUpdated(uint256 oldDuration, uint256 newDuration, uint256 timestamp);

    event FeesUpdated(uint256 penaltyBP, uint256 withdrawBP, uint256 midTermBP, uint256 timestamp);

    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient, uint256 timestamp);
    event ForfeitedRecipientUpdated(address indexed oldRecipient, address indexed newRecipient, uint256 timestamp);
    event ShutdownActivated(address indexed by, uint256 timestamp);
    event ProtocolShutdownComplete(uint256 timestamp);
    event EmergencyModeActivated(address indexed by, uint256 timestamp);
    event BadDebtResolved(Pool indexed pool, uint256 amount, uint256 timestamp);
    event BadDebtResolvedTotal(uint256 totalRepaid, uint256 timestamp);
    event TokenRecovered(address indexed token, uint256 amount, address indexed to);
    event InvariantViolated(uint256 actual, uint256 required, uint256 timestamp);
    event Paused(address indexed by, uint256 timestamp);
    event Unpaused(address indexed by, uint256 timestamp);
    event RewardNotified(Pool indexed pool, uint256 amount, uint256 duration, uint256 rate);
    event UserModuleUpdated(address indexed oldModule, address indexed newModule, uint256 timestamp);
    event AdminModuleUpdated(address indexed oldModule, address indexed newModule, uint256 timestamp);

    PoolInfo internal poolAState;
    PoolInfo internal poolBState;

    mapping(address => UserInfo) public userInfoA; // Mapping of user address to their staking info for Pool A
    mapping(address => UserInfo) public userInfoB; // Mapping of user address to their staking info for Pool B
    mapping(address => uint256) public unlockTimeB; // Mapping of user address to the timestamp when their staked tokens in Pool B can be withdrawn without penalty
    mapping(address => uint256) public stakeTimestampB; // Mapping of user address to the timestamp when they last staked in Pool B, used for calculating mid-term fees
    mapping(address => uint256) public lastClaimTime; // Mapping of user address to the timestamp when they last claimed rewards, used for enforcing claim cooldown
    address public userModule;
    address public adminModule;
    /// @dev Deploy-time TokenB supply ceiling for reward-rate cap (see PRD `MAX_REWARD_RATE_*`).
    uint256 public maxTotalSupplyBForRewardRateCap;
    /// @notice Running sum of all `userInfoA[*].rewards` (must match `DualPoolStorageLayout` slot order).
    uint256 public bookedUserRewardsA;
    /// @notice Running sum of all `userInfoB[*].rewards`.
    uint256 public bookedUserRewardsB;

    /// @notice Initializes pools, reward token, role admins, fee recipients, and ERC777 safety checks.
    /// @param tokenA Pool A staking token (must differ from `tokenB`).
    /// @param tokenB Pool B staking + reward token (must be 18 decimals).
    /// @param maxTotalSupplyBForRewardRateCap_ Non-zero supply ceiling for APR / max-rate math.
    constructor(address tokenA, address tokenB, uint256 maxTotalSupplyBForRewardRateCap_) Ownable(msg.sender) {
        if (tokenA == tokenB) {
            revert SameStakingTokens();
        }
        if (IERC20Metadata(tokenB).decimals() != 18) {
            revert InvalidRewardTokenDecimals();
        }
        if (maxTotalSupplyBForRewardRateCap_ == 0) {
            revert StakingExecutionErrors.ZeroAmount();
        }
        uint256 minCapForNonZeroRewardRate = (BASIS_POINTS * SECONDS_PER_YEAR + MAX_APR_BP - 1) / MAX_APR_BP;
        if (maxTotalSupplyBForRewardRateCap_ < minCapForNonZeroRewardRate) {
            revert StakingExecutionErrors.ZeroRewardRate(maxTotalSupplyBForRewardRateCap_, minCapForNonZeroRewardRate);
        }
        poolAState.stakingToken = IERC20(tokenA);
        poolBState.stakingToken = IERC20(tokenB);
        rewardToken = IERC20(tokenB);
        maxTotalSupplyBForRewardRateCap = maxTotalSupplyBForRewardRateCap_;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);

        _setRoleAdmin(ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
        _setRoleAdmin(OPERATOR_ROLE, ADMIN_ROLE);

        feeRecipient = msg.sender;
        forfeitedRecipient = msg.sender;
        _assertNoERC777HooksRegistered();
        _assertTokenHasNoERC777Hooks(tokenA);
        _assertTokenHasNoERC777Hooks(tokenB);
    }

    /// @notice Stakes TokenA into Pool A for `msg.sender` via `userModule.executeStakeA`.
    /// @dev Requires prior `approve` on TokenA. Amount is the requested `transferFrom` quantity; credited stake uses post-fee received balance per `PoolAStakeLib`.
    /// @param _amount Requested stake amount (TokenA smallest units).
    function stakeA(uint256 _amount) external nonReentrant whenNotPaused {
        _delegateTo(userModule, abi.encodeWithSignature("executeStakeA(address,uint256)", msg.sender, _amount));
    }

    /// @notice Withdraws TokenA principal from Pool A for `msg.sender` via `userModule.executeWithdrawA`.
    /// @param _amount Principal to withdraw (must be `> 0` and `<=` user stake).
    function withdrawA(uint256 _amount) external nonReentrant whenNotPaused {
        _delegateTo(userModule, abi.encodeWithSignature("executeWithdrawA(address,uint256)", msg.sender, _amount));
    }

    /// @notice Claims accrued Pool A rewards (paid in TokenB) for `msg.sender` via `userModule.executeClaimA`.
    /// @dev Enforces `claimCooldown`, `minClaimAmount`, and blocks claims while either pool has `badDebt` (see `PoolSingleClaimLib`).
    function claimA() external nonReentrant whenNotPaused {
        _delegateTo(userModule, abi.encodeWithSignature("executeClaimA(address)", msg.sender));
    }

    /// @notice Operator funds Pool A rewards and schedules emissions (`OPERATOR_ROLE`).
    /// @param amount Reward amount pulled from `msg.sender` (actual uses balance delta for FOT safety downstream).
    /// @param duration Emission duration in seconds, or `0` to use `poolA().rewardDuration` (set via `setRewardDurationA` within allowed bounds).
    function notifyRewardAmountA(uint256 amount, uint256 duration)
        external
        onlyRole(OPERATOR_ROLE)
        nonReentrant
        whenNotPaused
    {
        _delegateTo(
            adminModule,
            abi.encodeWithSignature("executeNotifyRewardAmountA(address,uint256,uint256)", msg.sender, amount, duration)
        );
    }

    /// @notice Stakes TokenB into Pool B for `msg.sender` and updates lock / weighted stake metadata.
    /// @dev Requires prior `approve` on TokenB. Delegates to `userModule.executeStakeB`.
    /// @param _amount Requested stake amount (smallest units).
    function stakeB(uint256 _amount) external nonReentrant whenNotPaused {
        _delegateTo(userModule, abi.encodeWithSignature("executeStakeB(address,uint256)", msg.sender, _amount));
    }

    /// @notice Withdraws Pool B principal for `msg.sender`; may charge penalties or fees per lock state.
    /// @dev Delegates to `userModule.executeWithdrawB`.
    /// @param _amount Principal to withdraw.
    function withdrawB(uint256 _amount) external nonReentrant whenNotPaused {
        _delegateTo(userModule, abi.encodeWithSignature("executeWithdrawB(address,uint256)", msg.sender, _amount));
    }

    /// @notice Claims accrued Pool B rewards (TokenB) for `msg.sender` via `userModule.executeClaimB`.
    /// @dev Same cooldown, min-claim, bad-debt, and liquidity rules as `claimA`, but settles against Pool B pending.
    function claimB() external nonReentrant whenNotPaused {
        _delegateTo(userModule, abi.encodeWithSignature("executeClaimB(address)", msg.sender));
    }

    /// @notice Cross-pool emergency claim: only during `shutdown` or when either pool has `badDebt`.
    /// @dev Shares cooldown with `claimA`/`claimB`. May partially pay if TokenB liquidity is short. When `shutdown` or any
    ///      `badDebt`, per-pool `minClaimAmount` is relaxed (see `ForceClaimAllLib`). Healthy normal ops must use `claimA`/`claimB`.
    function forceClaimAll() external nonReentrant whenNotPaused {
        _delegateTo(userModule, abi.encodeWithSignature("executeForceClaimAll(address)", msg.sender));
    }

    /// @notice Operator funds Pool B rewards and schedules emissions (`OPERATOR_ROLE`).
    /// @param amount Reward amount pulled from `msg.sender`.
    /// @param duration Emission duration in seconds, or `0` to use `poolB().rewardDuration` (`setRewardDurationB`).
    function notifyRewardAmountB(uint256 amount, uint256 duration)
        external
        onlyRole(OPERATOR_ROLE)
        nonReentrant
        whenNotPaused
    {
        _delegateTo(
            adminModule,
            abi.encodeWithSignature("executeNotifyRewardAmountB(address,uint256,uint256)", msg.sender, amount, duration)
        );
    }

    /// @notice Compounds both pools’ accrued rewards into additional Pool B principal for `msg.sender`.
    /// @dev Reverts on any pool `badDebt`, during `shutdown`, or when `compoundTotal == 0`. Applies `claimCooldown` like claims.
    function compoundB() external nonReentrant whenNotPaused {
        _delegateTo(userModule, abi.encodeWithSignature("executeCompoundB(address)", msg.sender));
    }

    /// @notice Emergency Pool A principal exit for `msg.sender` (delegates to user module).
    function emergencyWithdrawA() external nonReentrant {
        _delegateTo(userModule, abi.encodeWithSignature("executeEmergencyWithdrawA(address)", msg.sender));
    }

    /// @notice Emergency Pool B principal exit for `msg.sender` (delegates to user module).
    function emergencyWithdrawB() external nonReentrant {
        _delegateTo(userModule, abi.encodeWithSignature("executeEmergencyWithdrawB(address)", msg.sender));
    }

    /// @notice Moves reward budget between pools (`ADMIN_ROLE`).
    /// @param from Source pool.
    /// @param to Destination pool.
    /// @param amount Reward token amount.
    function rebalanceBudgets(Pool from, Pool to, uint256 amount) external onlyRole(ADMIN_ROLE) nonReentrant {
        if (emergencyMode) revert EmergencyModeActive();
        if (shutdown) revert StakingExecutionErrors.ShutdownModeActive();
        if (amount == 0) revert StakingExecutionErrors.ZeroAmount();
        _delegateTo(
            adminModule, abi.encodeWithSignature("executeRebalanceBudgets(uint8,uint8,uint256)", from, to, amount)
        );
    }

    /// @notice Sweeps accumulated Pool B fees to `feeRecipient` (`ADMIN_ROLE`).
    function claimFees() external onlyRole(ADMIN_ROLE) nonReentrant {
        _delegateTo(adminModule, abi.encodeWithSignature("executeClaimFees()"));
    }

    /// @dev Ensures this contract address has no ERC777 recipient/sender hooks registered on ERC-1820.
    function _assertNoERC777HooksRegistered() internal view {
        if (ERC1820_REGISTRY_ADDR.code.length == 0) {
            return;
        }

        address recipientImpl =
            IERC1820Registry(ERC1820_REGISTRY_ADDR).getInterfaceImplementer(address(this), ERC777_RECIPIENT_HASH);
        address senderImpl =
            IERC1820Registry(ERC1820_REGISTRY_ADDR).getInterfaceImplementer(address(this), ERC777_SENDER_HASH);

        if (recipientImpl != address(0)) {
            revert ERC777HookImplementerDetected(recipientImpl);
        }
        if (senderImpl != address(0)) {
            revert ERC777HookImplementerDetected(senderImpl);
        }
    }

    /// @dev Rejects ERC777-style hooks on a deploy-time token (ERC-1820 `TokensRecipient` / `TokensSender`).
    ///      Constructor calls this for `tokenA` (Pool A stake) and `tokenB` (Pool B stake + rewards) to block transfer callbacks that could bypass CEI.
    /// @param token Token address probed on ERC-1820 when the registry is deployed on-chain.
    function _assertTokenHasNoERC777Hooks(address token) internal view {
        if (ERC1820_REGISTRY_ADDR.code.length == 0) {
            return;
        }
        address recipientImpl =
            IERC1820Registry(ERC1820_REGISTRY_ADDR).getInterfaceImplementer(token, ERC777_RECIPIENT_HASH);
        address senderImpl = IERC1820Registry(ERC1820_REGISTRY_ADDR).getInterfaceImplementer(token, ERC777_SENDER_HASH);
        if (recipientImpl != address(0)) {
            revert ERC777HookImplementerDetected(recipientImpl);
        }
        if (senderImpl != address(0)) {
            revert ERC777HookImplementerDetected(senderImpl);
        }
    }

    /// @notice Points `userModule` to a new implementation (`DEFAULT_ADMIN_ROLE`).
    /// @dev Production: this role must not remain on an EOA; hold it on a Timelock-owned `DualPoolStakingAdmin` (or the timelock itself) so upgrades go through `schedule` / `execute`.
    /// @param newModule Non-zero module address.
    function setUserModule(address newModule) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newModule == address(0)) revert StakingExecutionErrors.ZeroAddress();
        if (newModule.code.length == 0) revert StakingExecutionErrors.NotAContract(newModule);
        address oldModule = userModule;
        userModule = newModule;
        emit UserModuleUpdated(oldModule, newModule, block.timestamp);
    }

    /// @notice Points `adminModule` to a new implementation (`DEFAULT_ADMIN_ROLE`).
    /// @dev See `setUserModule` NatSpec: delegatecall targets are fully trusted; gate `DEFAULT_ADMIN_ROLE` behind timelocked governance.
    /// @param newModule Non-zero module address.
    function setAdminModule(address newModule) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newModule == address(0)) revert StakingExecutionErrors.ZeroAddress();
        if (newModule.code.length == 0) revert StakingExecutionErrors.NotAContract(newModule);
        address oldModule = adminModule;
        adminModule = newModule;
        emit AdminModuleUpdated(oldModule, newModule, block.timestamp);
    }

    /// @dev `delegatecall`s `module` with `data`, bubbling revert data on failure (module executes with core storage context).
    /// @param module Module address (`userModule` or `adminModule`); must be configured non-zero before use.
    /// @param data ABI-encoded call data for the module entrypoint (`execute*` family).
    function _delegateTo(address module, bytes memory data) internal {
        if (module == address(0)) revert StakingExecutionErrors.ZeroAddress();
        (bool ok, bytes memory ret) = module.delegatecall(data);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
    }

    /// @notice Updates Pool B fee recipient (`ADMIN_ROLE`).
    function setFeeRecipient(address newRecipient) external onlyRole(ADMIN_ROLE) nonReentrant {
        _delegateTo(adminModule, abi.encodeWithSignature("executeSetFeeRecipient(address)", newRecipient));
    }

    /// @notice Updates forfeited-flow recipient (`ADMIN_ROLE`).
    function setForfeitedRecipient(address newRecipient) external onlyRole(ADMIN_ROLE) nonReentrant {
        _delegateTo(adminModule, abi.encodeWithSignature("executeSetForfeitedRecipient(address)", newRecipient));
    }

    /// @notice Updates `minEarlyExitAmountB` (`ADMIN_ROLE`).
    function setMinEarlyExitAmountB(uint256 newMin) external onlyRole(ADMIN_ROLE) nonReentrant {
        _delegateTo(adminModule, abi.encodeWithSignature("executeSetMinEarlyExitAmountB(uint256)", newMin));
    }

    /// @notice Updates `maxTransferFeeBP` (`ADMIN_ROLE`).
    function setMaxTransferFeeBP(uint256 newMaxTransferFeeBP) external onlyRole(ADMIN_ROLE) nonReentrant {
        _delegateTo(adminModule, abi.encodeWithSignature("executeSetMaxTransferFeeBP(uint256)", newMaxTransferFeeBP));
    }

    /// @notice Sets Pool A TVL cap (`ADMIN_ROLE`).
    function setTVLCapA(uint256 _cap) external onlyRole(ADMIN_ROLE) {
        _delegateTo(adminModule, abi.encodeWithSignature("executeSetTVLCapA(uint256)", _cap));
    }

    /// @notice Sets Pool B TVL cap (`ADMIN_ROLE`).
    function setTVLCapB(uint256 _cap) external onlyRole(ADMIN_ROLE) {
        _delegateTo(adminModule, abi.encodeWithSignature("executeSetTVLCapB(uint256)", _cap));
    }

    /// @notice Sets Pool A minimum stake (`ADMIN_ROLE`).
    function setMinStakeAmountA(uint256 _amount) external onlyRole(ADMIN_ROLE) {
        _delegateTo(adminModule, abi.encodeWithSignature("executeSetMinStakeAmountA(uint256)", _amount));
    }

    /// @notice Sets Pool B minimum stake (`ADMIN_ROLE`).
    function setMinStakeAmountB(uint256 _amount) external onlyRole(ADMIN_ROLE) {
        _delegateTo(adminModule, abi.encodeWithSignature("executeSetMinStakeAmountB(uint256)", _amount));
    }

    /// @notice Sets Pool A default emission length for `notifyRewardAmountA(amount, 0)` (`ADMIN_ROLE`).
    function setRewardDurationA(uint256 _duration) external onlyRole(ADMIN_ROLE) nonReentrant {
        _delegateTo(adminModule, abi.encodeWithSignature("executeSetRewardDurationA(uint256)", _duration));
    }

    /// @notice Sets Pool B default emission length for `notifyRewardAmountB(amount, 0)` (`ADMIN_ROLE`).
    function setRewardDurationB(uint256 _duration) external onlyRole(ADMIN_ROLE) nonReentrant {
        _delegateTo(adminModule, abi.encodeWithSignature("executeSetRewardDurationB(uint256)", _duration));
    }

    /// @notice Sets `minClaimAmount` (`ADMIN_ROLE`).
    function setMinClaimAmount(uint256 _amount) external onlyRole(ADMIN_ROLE) nonReentrant {
        _delegateTo(adminModule, abi.encodeWithSignature("executeSetMinClaimAmount(uint256)", _amount));
    }

    /// @notice Updates Pool B fee parameters (`ADMIN_ROLE`).
    function setFees(uint256 newWithdrawFeeBP, uint256 newMidTermFeeBP, uint256 newPenaltyFeeBP)
        external
        onlyRole(ADMIN_ROLE)
        nonReentrant
    {
        _delegateTo(
            adminModule,
            abi.encodeWithSignature(
                "executeSetFees(uint256,uint256,uint256)", newWithdrawFeeBP, newMidTermFeeBP, newPenaltyFeeBP
            )
        );
    }

    /// @notice Updates Pool B `lockDuration` (`ADMIN_ROLE`).
    function setLockDuration(uint256 newLockDuration) external onlyRole(ADMIN_ROLE) nonReentrant {
        _delegateTo(adminModule, abi.encodeWithSignature("executeSetLockDuration(uint256)", newLockDuration));
    }

    /// @notice Repays bad debt with reward tokens pulled from `payer` (`ADMIN_ROLE`).
    /// @dev Production: `DualPoolStakingAdmin` passes `msg.sender` (Timelock) as `payer`; do not use Core `msg.sender` (the facade).
    function resolveBadDebt(address payer, uint256 amount) external onlyRole(ADMIN_ROLE) nonReentrant {
        if (payer == address(0)) revert StakingExecutionErrors.ZeroAddress();
        _delegateTo(adminModule, abi.encodeWithSignature("executeResolveBadDebt(address,uint256)", payer, amount));
    }

    /// @notice Recovers non-liability ERC20 balances (`ADMIN_ROLE`).
    function recoverToken(address token, address to, uint256 amount) external onlyRole(ADMIN_ROLE) nonReentrant {
        _delegateTo(
            adminModule, abi.encodeWithSignature("executeRecoverToken(address,address,uint256)", token, to, amount)
        );
    }

    /// @notice Activates shutdown while in emergency (`ADMIN_ROLE`).
    function activateShutdown() external onlyRole(ADMIN_ROLE) nonReentrant {
        _delegateTo(adminModule, abi.encodeWithSignature("executeActivateShutdown(address)", msg.sender));
    }

    /// @notice Finalizes shutdown (`ADMIN_ROLE`).
    function forceShutdownFinalize() external onlyRole(ADMIN_ROLE) nonReentrant {
        _delegateTo(adminModule, abi.encodeWithSignature("executeForceShutdownFinalize()"));
    }

    /// @notice Enables emergency mode (`OPERATOR_ROLE`).
    function enableEmergencyMode() external onlyRole(OPERATOR_ROLE) {
        _delegateTo(adminModule, abi.encodeWithSignature("executeEnableEmergencyMode(address)", msg.sender));
    }

    /// @notice Grants or revokes `ADMIN_ROLE` (`DEFAULT_ADMIN_ROLE`).
    function setAdmin(address newAdmin, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _delegateTo(adminModule, abi.encodeWithSignature("executeSetAdmin(address,bool)", newAdmin, enabled));
    }

    /// @notice Grants or revokes `OPERATOR_ROLE` (`DEFAULT_ADMIN_ROLE`).
    function setOperator(address newOperator, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _delegateTo(adminModule, abi.encodeWithSignature("executeSetOperator(address,bool)", newOperator, enabled));
    }

    /// @notice Pauses user-facing flows (`OPERATOR_ROLE`).
    function pause() external onlyRole(OPERATOR_ROLE) whenNotPaused {
        _delegateTo(adminModule, abi.encodeWithSignature("executePause(address)", msg.sender));
    }

    /// @notice Unpauses after cooldown (`ADMIN_ROLE`).
    function unpause() external onlyRole(ADMIN_ROLE) whenPaused {
        _delegateTo(adminModule, abi.encodeWithSignature("executeUnpause(address)", msg.sender));
    }

    /// @notice Returns Pool A aggregate `PoolInfo` snapshot.
    /// @return Memory copy of `poolAState` (TokenA pool accounting).
    function poolA() external view returns (PoolInfo memory) {
        return poolAState;
    }

    /// @notice Returns Pool B aggregate `PoolInfo` snapshot.
    /// @return Memory copy of `poolBState` (TokenB pool accounting).
    function poolB() external view returns (PoolInfo memory) {
        return poolBState;
    }
}
