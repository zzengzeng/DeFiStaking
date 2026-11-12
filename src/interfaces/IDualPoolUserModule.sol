//SPDX-License-Identifier:MIT
pragma solidity ^0.8.20;

interface IDualPoolUserModule {
    function stakeA(uint256 amount) external;
    function stakeB(uint256 amount) external;
}
