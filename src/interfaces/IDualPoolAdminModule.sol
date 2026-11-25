// SPDX-License-Identifier:MIT
pragma solidity ^0.8.20;
import {Pool} from "../StakeTypes.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IDualPoolAdminModule {
    function setLockDuration(uint256 newLockDuration) external;
    function setFeeRecipient(address newFeeRecipient) external;
    function setMaxTransferFeeBP(uint256 newMaxTransferFeeBP) external;
    function setMinClaimAmount(uint256 newMinClaimAmount) external;
    function setMaxTVLCap(Pool pool, uint256 newMaxTVLCap) external;
    function setMinStakeAmount(Pool pool, uint256 newMinStakeAmount) external;
    function setRewardDuration(Pool pool, uint256 newRewardDuration) external;
    function setFees(uint256 penaltyBP, uint256 withdrawBP, uint256 midTermBP) external;
    function setMinEarlyExitAmountB(uint256 newMinEarlyExitAmountB) external;
    function scheduleRewards(Pool pool, uint256 duration) external;
    function activateShutdown() external;
    function claimFees() external;
    function cancelRewardSchedule(Pool pool) external;
    function rebalanceBudgets(Pool from, Pool to, uint256 amt) external;
    function recoverToken(IERC20 token, address to, uint256 amount) external;
}
