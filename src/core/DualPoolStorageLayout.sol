// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Pool, PoolInfo, UserInfo} from "../StakeTypes.sol";

abstract contract DualPoolStorageLayout {
    uint256 public immutable UNPAUSE_COOLDOWN;

    uint256 public constant MAX_APR_BP = 20000;
    uint256 public constant SECONDS_PER_YEAR = 31536000;
    uint256 public constant BASIS_POINTS = 10000;
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    uint256 public constant MAX_LOCK_DURATION = 90 days;
    uint256 public constant DEFAULT_LOCK_DURATION = 7 days;
    uint256 public constant MAX_MIN_CLAIM_AMOUNT = 1e17;
    uint256 public constant MIN_REWARD_DURATION = 1 days;
    uint256 public constant MAX_REWARD_DURATION = 365 days;
    uint256 public constant MAX_EARLY_EXIT_PENALTY_BP = 2000;
    uint256 public constant MAX_WITHDRAW_BP = 500;
    uint256 public constant MAX_MIDTERM_BP = 500;

    uint256 public maxTotalSupplyBForRewardRateCap;
    uint256 public maxRewardRateA;
    uint256 public maxRewardRateB;
    uint256 public lockDuration;
    uint256 public penaltyFeeBP;
    uint256 public withdrawFeeBP;
    uint256 public midTermFeeBP;
    uint256 public minEarlyExitAmountB;
    uint256 public maxTransferFeeBP;
    uint256 public minClaimAmount;
    address public feeRecipient;

    PoolInfo internal poolA;
    PoolInfo internal poolB;
    IERC20 public rewardTokenB;

    mapping(address => UserInfo) public userInfoA;
    mapping(address => UserInfo) public userInfoB;
    mapping(address => uint256) public unlockTimeB;
    mapping(address => uint256) public stakeTimestampB;
    mapping(address => uint256) public lastClaimTime;

    uint256 public unclaimedFeesB;

    bool public emergencyMode;
    bool public shutdownMode;
    uint256 public pausedAt;
    uint256 public unpauseAt;
    uint256 public shutdownAt;
    uint256 public terminalRewardTime;

    error ZeroAddress();
    error InvalidLockDuration();
    error InvalidFeeRecipient();
    error InvalidMaxTransferFeeBP();
    error InvalidMinClaimAmount();
    error InvalidRewardDuration();
    error InvalidPenaltyFee();
    error InvalidWithdrawFee();
    error InvalidMidTermFee();
    error InvalidMinEarlyExitAmount();

    event LockDurationUpdated(uint256 oldLockDuration, uint256 newLockDuration, uint256 currentTime);
    event FeeRecipientUpdated(address indexed oldAddr, address indexed newAddr, uint256 currentTime);
    event MaxTransferFeeBPUpdated(uint256 oldMaxTransferFeeBP, uint256 newMaxTransferFeeBP, uint256 currentTime);
    event MinClaimAmountUpdated(uint256 oldMinClaimAmount, uint256 newMinClaimAmount, uint256 currentTime);
    event MaxTVLCapUpdated(Pool indexed pool, uint256 oldCap, uint256 newCap, uint256 currentTime);
    event MinStakeAmountUpdated(Pool indexed pool, uint256 oldAmount, uint256 newAmount, uint256 currentTime);
    event RewardDurationUpdated(
        Pool indexed pool, uint256 oldRewardDuration, uint256 newRewardDuration, uint256 currentTime
    );
    event FeesUpdated(uint256 penaltyBP, uint256 withdrawBP, uint256 midTermBP, uint256 currentTime);
    event MinEarlyExitAmountBUpdated(uint256 oldEarlyExitAmount, uint256 newEarlyExitAmount, uint256 currentTime);
}
