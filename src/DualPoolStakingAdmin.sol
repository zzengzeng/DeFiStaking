// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {Pool} from "./StakeTypes.sol";
import {DualPoolStaking} from "./DualPoolStaking.sol";

/// @title DualPoolStakingAdmin
/// @notice Governance facade: forwards `onlyOwner` calls to the `DualPoolStaking` core for timelocked parameter changes.
/// @dev Grant this contract `ADMIN_ROLE` on the core. Set `owner` to OpenZeppelin `TimelockController` so changes go through `schedule` → `execute`. Do **not** route `pause` / `notifyReward*` here—those remain `OPERATOR_ROLE` on the core (zero delay) to avoid coupling hot ops to the timelock delay.
/// @custom:forwarding Each external function is a thin `onlyOwner` wrapper around the same-named `DualPoolStaking` entrypoint.
contract DualPoolStakingAdmin is Ownable {
    /// @notice Immutable reference to the staking core.
    DualPoolStaking public immutable core;

    /// @notice Deploys the facade and pins the core address.
    /// @param coreAddress Deployed `DualPoolStaking` address; must not be zero.
    constructor(address coreAddress) Ownable(msg.sender) {
        require(coreAddress != address(0), "core is zero");
        core = DualPoolStaking(coreAddress);
    }

    /// @notice Rebalances reward budget between pools on the core.
    /// @param from Source pool.
    /// @param to Destination pool.
    /// @param amount Reward token amount to move.
    function rebalanceBudgets(Pool from, Pool to, uint256 amount) external onlyOwner {
        core.rebalanceBudgets(from, to, amount);
    }

    /// @notice Sweeps accumulated Pool B fees on the core to the configured recipient.
    function claimFees() external onlyOwner {
        core.claimFees();
    }

    /// @notice Clears a `pendingOps` timelock row on the core, if present.
    /// @param opId Operation identifier.
    function cancelTimelock(bytes32 opId) external onlyOwner {
        core.cancelTimelock(opId);
    }

    /// @notice Updates Pool B withdrawal fee recipient on the core.
    /// @param newRecipient New recipient; must not be zero address.
    function setFeeRecipient(address newRecipient) external onlyOwner {
        core.setFeeRecipient(newRecipient);
    }

    /// @notice Updates forfeited / penalty-flow recipient on the core.
    /// @param newRecipient New recipient; must not be zero address.
    function setForfeitedRecipient(address newRecipient) external onlyOwner {
        core.setForfeitedRecipient(newRecipient);
    }

    /// @notice Sets minimum early-exit principal bucket for Pool B on the core.
    /// @param newMin New minimum amount.
    function setMinEarlyExitAmountB(uint256 newMin) external onlyOwner {
        core.setMinEarlyExitAmountB(newMin);
    }

    /// @notice Sets max tolerated FOT transfer-fee slippage (basis points) on the core.
    /// @param newMaxTransferFeeBP New ceiling.
    function setMaxTransferFeeBP(uint256 newMaxTransferFeeBP) external onlyOwner {
        core.setMaxTransferFeeBP(newMaxTransferFeeBP);
    }

    /// @notice Sets Pool A TVL cap on the core.
    /// @param cap New cap value.
    function setTVLCapA(uint256 cap) external onlyOwner {
        core.setTVLCapA(cap);
    }

    /// @notice Sets Pool B TVL cap on the core.
    /// @param cap New cap value.
    function setTVLCapB(uint256 cap) external onlyOwner {
        core.setTVLCapB(cap);
    }

    /// @notice Sets Pool A minimum stake on the core.
    /// @param amount New minimum stake.
    function setMinStakeAmountA(uint256 amount) external onlyOwner {
        core.setMinStakeAmountA(amount);
    }

    /// @notice Sets Pool B minimum stake on the core.
    /// @param amount New minimum stake.
    function setMinStakeAmountB(uint256 amount) external onlyOwner {
        core.setMinStakeAmountB(amount);
    }

    /// @notice Sets Pool A default reward duration config on the core.
    /// @param duration Duration in seconds.
    function setRewardDurationA(uint256 duration) external onlyOwner {
        core.setRewardDurationA(duration);
    }

    /// @notice Sets Pool B default reward duration config on the core.
    /// @param duration Duration in seconds.
    function setRewardDurationB(uint256 duration) external onlyOwner {
        core.setRewardDurationB(duration);
    }

    /// @notice Sets minimum claimable reward threshold on the core.
    /// @param amount New threshold.
    function setMinClaimAmount(uint256 amount) external onlyOwner {
        core.setMinClaimAmount(amount);
    }

    /// @notice Updates Pool B fee parameters (basis points) on the core.
    /// @param newWithdrawFeeBP Withdrawal fee (bp).
    /// @param newMidTermFeeBP Mid-term fee (bp).
    /// @param newPenaltyFeeBP Early-exit penalty (bp).
    function setFees(uint256 newWithdrawFeeBP, uint256 newMidTermFeeBP, uint256 newPenaltyFeeBP) external onlyOwner {
        core.setFees(newWithdrawFeeBP, newMidTermFeeBP, newPenaltyFeeBP);
    }

    /// @notice Updates Pool B lock duration on the core.
    /// @param newLockDuration Lock duration in seconds.
    function setLockDuration(uint256 newLockDuration) external onlyOwner {
        core.setLockDuration(newLockDuration);
    }

    /// @notice Caller funds bad-debt repayment on the core.
    /// @param amount Repayment amount.
    function resolveBadDebt(uint256 amount) external onlyOwner {
        core.resolveBadDebt(amount);
    }

    /// @notice Recovers ERC20 tokens on the core when accounting rules allow.
    /// @param token Token to sweep.
    /// @param to Recipient.
    /// @param amount Amount to recover.
    function recoverToken(address token, address to, uint256 amount) external onlyOwner {
        core.recoverToken(token, to, amount);
    }

    /// @notice Activates shutdown on the core (requires emergency mode per core rules).
    function activateShutdown() external onlyOwner {
        core.activateShutdown();
    }

    /// @notice Finalizes protocol shutdown on the core.
    function forceShutdownFinalize() external onlyOwner {
        core.forceShutdownFinalize();
    }

    /// @notice Grants or revokes `ADMIN_ROLE` on the core.
    /// @param newAdmin Admin address.
    /// @param enabled True to grant, false to revoke.
    function setAdmin(address newAdmin, bool enabled) external onlyOwner {
        core.setAdmin(newAdmin, enabled);
    }

    /// @notice Grants or revokes `OPERATOR_ROLE` on the core.
    /// @param newOperator Operator address.
    /// @param enabled True to grant, false to revoke.
    function setOperator(address newOperator, bool enabled) external onlyOwner {
        core.setOperator(newOperator, enabled);
    }

    /// @notice Unpauses the core after cooldown (extends reward schedules per core logic).
    function unpause() external onlyOwner {
        core.unpause();
    }
}
