//SPDX-License-Identifier:MIT
pragma solidity ^0.8.20;

interface IDualPoolUserModule {
    function stakeA(uint256 amount) external;
    function stakeB(uint256 amount) external;
    function withdrawA(uint256 amount) external;
    function withdrawB(uint256 amount) external;
    function emergencyWithdrawA() external;
    function emergencyWithdrawB() external;
    function claimA() external;
    function claimB() external;
    function forceClaimAll() external;
    function compoundB() external;
}
