// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

enum Pool {

    A,

    B
}

struct PoolInfo {


    IERC20 stakingToken;

    uint256 totalStaked;

    uint256 rewardRate;

    uint256 lastUpdateTime;

    uint256 accRewardPerToken;

    uint256 availableRewards;

    uint256 periodFinish;

    uint256 badDebt;

    uint256 totalPending;

    uint256 bookedUserRewards;

    uint256 dust;

    uint256 maxTVLCap;

    uint256 minStakeAmount;

    uint256 rewardDuration;
}

struct UserInfo {


    uint256 staked;

    uint256 rewards;

    uint256 rewardPaid;
}
