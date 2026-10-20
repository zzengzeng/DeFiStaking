// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Pool} from "./StakeTypes.sol";
import {DualPoolStaking} from "./DualPoolStaking.sol";

/// @title DualPoolStakingAdmin
/// @notice Governance facade: forwards timelocked calls to the `DualPoolStaking` core.
/// @dev Grant this contract `ADMIN_ROLE` and `DEFAULT_ADMIN_ROLE` on the core. Parameter changes must be sent by
///      `timelockGovernance` (typically 48h `TimelockController`); module / role super-paths must be sent by
///      `timelockSuper` (typically 72h). Do **not** route `pause` / `notifyReward*` here—those remain `OPERATOR_ROLE`
///      on the core (zero delay).
contract DualPoolStakingAdmin {
    /// @notice Immutable reference to the staking core.
    DualPoolStaking public immutable core;
    /// @notice Timelock allowed to call parameter / treasury / protocol admin functions (e.g. 48h delay).
    address public immutable timelockGovernance;
    /// @notice Timelock allowed to call super paths (`setUserModule`, `setAdminModule`, `setAdmin`, `setOperator`).
    address public immutable timelockSuper;

    error ZeroCore();
    error ZeroTimelockGovernance();
    error ZeroTimelockSuper();
    error UnauthorizedGovernanceTimelock(address caller);
    error UnauthorizedSuperTimelock(address caller);

    modifier onlyGovernanceTimelock() {
        if (msg.sender != timelockGovernance) {
            revert UnauthorizedGovernanceTimelock(msg.sender);
        }
        _;
    }

    modifier onlySuperTimelock() {
        if (msg.sender != timelockSuper) {
            revert UnauthorizedSuperTimelock(msg.sender);
        }
        _;
    }

    /// @notice Deploys the facade and pins core + timelock addresses.
    /// @param coreAddress Deployed `DualPoolStaking` address.
    /// @param timelockGovernance_ Timelock for routine governance (e.g. 48h `minDelay`).
    /// @param timelockSuper_ Timelock for super paths (e.g. 72h `minDelay`).
    constructor(address coreAddress, address timelockGovernance_, address timelockSuper_) {
        if (coreAddress == address(0)) revert ZeroCore();
        if (timelockGovernance_ == address(0)) revert ZeroTimelockGovernance();
        if (timelockSuper_ == address(0)) revert ZeroTimelockSuper();
        core = DualPoolStaking(coreAddress);
        timelockGovernance = timelockGovernance_;
        timelockSuper = timelockSuper_;
    }

    function rebalanceBudgets(Pool from, Pool to, uint256 amount) external onlyGovernanceTimelock {
        core.rebalanceBudgets(from, to, amount);
    }

    function claimFees() external onlyGovernanceTimelock {
        core.claimFees();
    }

    function setFeeRecipient(address newRecipient) external onlyGovernanceTimelock {
        core.setFeeRecipient(newRecipient);
    }

    function setMinEarlyExitAmountB(uint256 newMin) external onlyGovernanceTimelock {
        core.setMinEarlyExitAmountB(newMin);
    }

    function setMaxTransferFeeBP(uint256 newMaxTransferFeeBP) external onlyGovernanceTimelock {
        core.setMaxTransferFeeBP(newMaxTransferFeeBP);
    }

    function setTVLCapA(uint256 cap) external onlyGovernanceTimelock {
        core.setTVLCapA(cap);
    }

    function setTVLCapB(uint256 cap) external onlyGovernanceTimelock {
        core.setTVLCapB(cap);
    }

    function setMinStakeAmountA(uint256 amount) external onlyGovernanceTimelock {
        core.setMinStakeAmountA(amount);
    }

    function setMinStakeAmountB(uint256 amount) external onlyGovernanceTimelock {
        core.setMinStakeAmountB(amount);
    }

    function setRewardDurationA(uint256 duration) external onlyGovernanceTimelock {
        core.setRewardDurationA(duration);
    }

    function setRewardDurationB(uint256 duration) external onlyGovernanceTimelock {
        core.setRewardDurationB(duration);
    }

    function setMinClaimAmount(uint256 amount) external onlyGovernanceTimelock {
        core.setMinClaimAmount(amount);
    }

    function setFees(uint256 newWithdrawFeeBP, uint256 newMidTermFeeBP, uint256 newPenaltyFeeBP)
        external
        onlyGovernanceTimelock
    {
        core.setFees(newWithdrawFeeBP, newMidTermFeeBP, newPenaltyFeeBP);
    }

    function setLockDuration(uint256 newLockDuration) external onlyGovernanceTimelock {
        core.setLockDuration(newLockDuration);
    }

    function resolveBadDebt(uint256 amount) external onlyGovernanceTimelock {
        core.resolveBadDebt(msg.sender, amount);
    }

    function recoverToken(address token, address to, uint256 amount) external onlyGovernanceTimelock {
        core.recoverToken(token, to, amount);
    }

    function activateShutdown() external onlyGovernanceTimelock {
        core.activateShutdown();
    }

    function forceShutdownFinalize() external onlyGovernanceTimelock {
        core.forceShutdownFinalize();
    }

    function setMaxTotalSupplyBForRewardRateCap(uint256 newCap) external onlyGovernanceTimelock {
        core.setMaxTotalSupplyBForRewardRateCap(newCap);
    }

    function setUserModule(address newModule) external onlySuperTimelock {
        core.setUserModule(newModule);
    }

    function setAdminModule(address newModule) external onlySuperTimelock {
        core.setAdminModule(newModule);
    }

    function setAdmin(address newAdmin, bool enabled) external onlySuperTimelock {
        core.setAdmin(newAdmin, enabled);
    }

    function setOperator(address newOperator, bool enabled) external onlySuperTimelock {
        core.setOperator(newOperator, enabled);
    }

    function unpause() external onlyGovernanceTimelock {
        core.unpause();
    }
}
