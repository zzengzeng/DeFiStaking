// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {DualPoolStaking} from "../src/core/DualPoolStaking.sol";
import {Pool, PoolInfo, UserInfo} from "../src/StakeTypes.sol";

contract EngineHarness is DualPoolStaking {
    constructor(address _tokenA, address _tokenB, uint256 _cap, uint256 _cooldown)
        DualPoolStaking(_tokenA, _tokenB, _cap, _cooldown)
    {}

    function settleA(address user) external {
        _settleUserA(user);
    }

    function settleB(address user) external {
        _settleUserB(user);
    }

    function seedPool(
        Pool pool,
        uint256 rate,
        uint256 lastUpdate,
        uint256 finish,
        uint256 totalStaked,
        uint256 availableRewards
    ) external {
        PoolInfo storage p = _pool(pool);
        p.rewardRate = rate;
        p.lastUpdateTime = lastUpdate;
        p.periodFinish = finish;
        p.totalStaked = totalStaked;
        p.availableRewards = availableRewards;
    }

    function seedUser(Pool pool, address user, uint256 staked, uint256 rewardPaid) external {
        if (pool == Pool.A) {
            userInfoA[user].staked = staked;
            userInfoA[user].rewardPaid = rewardPaid;
        } else {
            userInfoB[user].staked = staked;
            userInfoB[user].rewardPaid = rewardPaid;
        }
    }

    function seedAcc(Pool pool, uint256 acc) external {
        _pool(pool).accRewardPerToken = acc;
    }

    function seedPending(Pool pool, uint256 pending) external {
        _pool(pool).totalPending = pending;
    }

    function updateGlobalA() external {
        _updateGlobalA();
    }

    function updateGlobalB() external {
        _updateGlobalB();
    }

    function getUserA(address user) public view returns (UserInfo memory) {
        return userInfoA[user];
    }

    function getUserB(address user) public view returns (UserInfo memory) {
        return userInfoB[user];
    }
}
