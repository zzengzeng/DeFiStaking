// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

import {DualPoolRoles} from "./DualPoolRoles.sol";
import {Pool, PoolInfo} from "../StakeTypes.sol";

import {IDualPoolAdminModule} from "../interfaces/IDualPoolAdminModule.sol";
import {DualPoolUserModule} from "../core/DualPoolUserModule.sol";

contract DualPoolStaking is DualPoolRoles {
    using Address for address;
    using SafeERC20 for IERC20;

    address public adminModule;
    address public userModule;

    error ZeroAmount();

    error SameToken();
    error NotAContract();
    error InvalidTokenDecimals();
    error CapZero();
    error RateTooSmall();

    error ModuleNotSet();
    error ModuleNotContract();

    error ContractPaused();
    error AlreadyEmergencyMode();
    error PayerDeductionMismatch();
    error ReceivedExceedsAmount();
    error FeeExceedsCap();

    event AdminModuleUpdated(address indexed oldAdminModule, address indexed newAdminModule, uint256 currentTime);
    event UserModuleUpdated(address indexed oldUserModule, address indexed newUserModule, uint256 currentTime);
    event EmergencyModeActivated(address sender, uint256 currentTime);
    event RewardsFunded(Pool indexed pool, address sender, uint256 amount, uint256 received, uint256 currentTime);

    constructor(address _tokenA, address _tokenB, uint256 _cap, uint256 unpause_cooldown) {
        if (_tokenA == address(0) || _tokenB == address(0)) revert ZeroAddress();
        if (_tokenA == _tokenB) revert SameToken();
        if (_tokenA.code.length == 0 || _tokenB.code.length == 0) revert NotAContract();
        if (IERC20Metadata(_tokenB).decimals() != 18) revert InvalidTokenDecimals();
        if (_cap == 0) revert CapZero();

        poolA.stakingToken = IERC20(_tokenA);
        poolB.stakingToken = IERC20(_tokenB);
        rewardTokenB = IERC20(_tokenB);

        maxTotalSupplyBForRewardRateCap = _cap;
        uint256 rate = Math.mulDiv(_cap, MAX_APR_BP, BASIS_POINTS * SECONDS_PER_YEAR);
        if (rate == 0) revert RateTooSmall();
        maxRewardRateA = rate;
        maxRewardRateB = rate;

        UNPAUSE_COOLDOWN = unpause_cooldown;

        lockDuration = 7 days;
        penaltyFeeBP = 1000;
        withdrawFeeBP = 100;
        midTermFeeBP = 50;
        minEarlyExitAmountB = 10;
        maxTransferFeeBP = 1000;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function _delegateTo(address module, bytes memory data) internal {
        if (module == address(0)) revert ModuleNotSet();
        if (module.code.length == 0) revert ModuleNotContract();
        module.functionDelegateCall(data);
    }

    function setAdminModule(address newModule) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (newModule == address(0)) revert ModuleNotSet();
        if (newModule.code.length == 0) revert ModuleNotContract();
        address old = adminModule;
        adminModule = newModule;
        emit AdminModuleUpdated(old, newModule, block.timestamp);
    }

    function setUserModule(address newModule) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (newModule == address(0)) revert ModuleNotSet();
        if (newModule.code.length == 0) revert ModuleNotContract();
        address old = userModule;
        userModule = newModule;
        emit UserModuleUpdated(old, newModule, block.timestamp);
    }

    function setLockDuration(uint256 newLockDuration) external onlyRole(ADMIN_ROLE) nonReentrant {
        _delegateTo(adminModule, abi.encodeCall(IDualPoolAdminModule.setLockDuration, (newLockDuration)));
    }

    function setFeeRecipient(address newFeeRecipient) external onlyRole(ADMIN_ROLE) nonReentrant {
        _delegateTo(adminModule, abi.encodeCall(IDualPoolAdminModule.setFeeRecipient, (newFeeRecipient)));
    }

    function setMaxTransferFeeBP(uint256 newMaxTransferFeeBP) external onlyRole(ADMIN_ROLE) nonReentrant {
        _delegateTo(adminModule, abi.encodeCall(IDualPoolAdminModule.setMaxTransferFeeBP, (newMaxTransferFeeBP)));
    }

    function setMinClaimAmount(uint256 newMinClaimAmount) external onlyRole(ADMIN_ROLE) nonReentrant {
        _delegateTo(adminModule, abi.encodeCall(IDualPoolAdminModule.setMinClaimAmount, (newMinClaimAmount)));
    }

    function setMaxTVLCap(Pool pool, uint256 newMaxTVLCap) external onlyRole(ADMIN_ROLE) nonReentrant {
        _delegateTo(adminModule, abi.encodeCall(IDualPoolAdminModule.setMaxTVLCap, (pool, newMaxTVLCap)));
    }

    function setMinStakeAmount(Pool pool, uint256 newMinStakeAmount) external onlyRole(ADMIN_ROLE) nonReentrant {
        _delegateTo(adminModule, abi.encodeCall(IDualPoolAdminModule.setMinStakeAmount, (pool, newMinStakeAmount)));
    }

    function setRewardDuration(Pool pool, uint256 newRewardDuration) external onlyRole(ADMIN_ROLE) nonReentrant {
        _delegateTo(adminModule, abi.encodeCall(IDualPoolAdminModule.setRewardDuration, (pool, newRewardDuration)));
    }

    function setFees(uint256 penaltyBP, uint256 withdrawBP, uint256 midTermBP)
        external
        onlyRole(ADMIN_ROLE)
        nonReentrant
    {
        _delegateTo(adminModule, abi.encodeCall(IDualPoolAdminModule.setFees, (penaltyBP, withdrawBP, midTermBP)));
    }

    function setMinEarlyExitAmountB(uint256 newMinEarlyExitAmountB) external onlyRole(ADMIN_ROLE) nonReentrant {
        _delegateTo(adminModule, abi.encodeCall(IDualPoolAdminModule.setMinEarlyExitAmountB, (newMinEarlyExitAmountB)));
    }

    function getPool(Pool pool) external view returns (PoolInfo memory) {
        return pool == Pool.A ? poolA : poolB;
    }

    function pause() external onlyRole(OPERATOR_ROLE) nonReentrant {
        if (emergencyMode || shutdownMode) revert WrongState();
        if (paused()) revert ContractPaused();

        _pause();

        pausedAt = block.timestamp;
        unpauseAt = block.timestamp + UNPAUSE_COOLDOWN;
    }

    function enableEmergencyMode() external onlyRole(OPERATOR_ROLE) nonReentrant {
        if (emergencyMode) revert AlreadyEmergencyMode();
        if (shutdownMode) revert WrongState();

        if (!paused()) {
            _pause();
            pausedAt = block.timestamp;
        }

        emergencyMode = true;
        terminalRewardTime = pausedAt;

        emit EmergencyModeActivated(msg.sender, block.timestamp);
    }

    function fundRewards(Pool pool, uint256 amount) external onlyRole(OPERATOR_ROLE) nonReentrant {
        if (paused() || emergencyMode || shutdownMode) revert WrongState();
        if (amount == 0) revert ZeroAmount();

        IERC20 token = rewardTokenB;
        uint256 payerBefore = token.balanceOf(msg.sender);
        uint256 coreBefore = token.balanceOf(address(this));

        token.safeTransferFrom(msg.sender, address(this), amount);

        uint256 payerAfter = token.balanceOf(msg.sender);
        uint256 coreAfter = token.balanceOf(address(this));

        uint256 payerDeducted = payerBefore - payerAfter;
        uint256 received = coreAfter - coreBefore;

        if (payerDeducted != amount) {
            revert PayerDeductionMismatch();
        }

        if (received > amount) {
            revert ReceivedExceedsAmount();
        }

        if ((amount - received) * BASIS_POINTS > amount * maxTransferFeeBP) {
            revert FeeExceedsCap();
        }

        PoolInfo storage p = _pool(pool);
        uint256 old = p.availableRewards;
        p.availableRewards = old + received;

        emit RewardsFunded(pool, msg.sender, amount, received, block.timestamp);
    }

    function crankCatchUpPool(Pool pool) external nonReentrant {
        _advanceGlobal(pool, false);

        PoolInfo storage p = _pool(pool);
        uint256 target = Math.min(_effectiveTime(), p.periodFinish);

        emit PoolCatchUpCranked(pool, p.lastUpdateTime, p.lastUpdateTime >= target, block.timestamp);
    }

    function scheduleRewards(Pool pool, uint256 duration) external onlyRole(ADMIN_ROLE) nonReentrant {
        _delegateTo(adminModule, abi.encodeCall(IDualPoolAdminModule.scheduleRewards, (pool, duration)));
    }
}
