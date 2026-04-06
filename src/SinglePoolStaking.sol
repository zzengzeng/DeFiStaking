// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


// @title Single Pool Staking Contract
// @notice This contract allows users to stake a single type of token and earn rewards based on their staked amount and duration.
// @dev This contract is a simplified version of a staking contract, focusing on a single pool for demonstration purposes. It includes basic functionalities such as staking, unstaking, and reward calculation. The actual implementation would require additional features such as access control, emergency withdrawal, and more robust reward distribution logic.
contract SinglePoolStaking {
    using SafeERC20 for IERC20;
    IERC20 public stakingToken; // The token that users will stake
    IERC20 public rewardToken; // The token that users will receive as rewards

    uint256 public totalStaked; // Total amount of tokens staked in the contract
    uint256 public rewardRate; // The rate at which rewards are distributed (e.g. tokens per second)
    uint256 public lastUpdateTime; // The last time the rewards were updated
    uint256 public accRewardPerToken; // Accumulated reward per token, used for calculating user rewards

    uint256 public constant PRECISION = 1e18; // Precision for reward calculations

    mapping(address => uint256) public userStaked; // Mapping of user address to the amount they have staked
    mapping(address => uint256) public rewards; // Mapping of user address to the rewards they have earned
    mapping(address => uint256) public userRewardPaid; // Mapping of user address to the amount of rewards they have already been paid

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 reward);

    error AmountMustBeGreaterThanZero();
    error NotEnoughStakedTokensToWithdraw();
    error NoRewardsToClaim();

    constructor(address _stakingToken, address _rewardToken) {
        stakingToken = IERC20(_stakingToken);
        rewardToken = IERC20(_rewardToken);
    }

    /// @notice Updates the global reward state by calculating the rewards accumulated since the last update and adjusting the accumulated reward per token accordingly. This function should be called before any user interactions that affect the staked amounts or when changing the reward rate to ensure that rewards are calculated accurately for all users.
    /// @dev The function first checks if there are any tokens currently staked in the contract. If there are no staked tokens, it simply updates the last update time and returns. If there are staked tokens, it calculates the time difference since the last update, computes the rewards accumulated during that time, and updates the accumulated reward per token based on the total staked amount. Finally, it updates the last update time to the current block timestamp.
    function _updateGlobal() internal {
        if (totalStaked == 0) {
            lastUpdateTime = block.timestamp;
            return;
        }
        uint256 deltaTime = block.timestamp - lastUpdateTime;
        uint256 reward = deltaTime * rewardRate;
        accRewardPerToken += (reward * PRECISION) / totalStaked;
        lastUpdateTime = block.timestamp;
    }

    /// @notice Calculates and settles the rewards for a specific user based on their staked amount and the accumulated reward per token. This function should be called before any user interaction that changes their staked amount or when they claim their rewards to ensure that they receive the correct amount of rewards based on their staking activity.
    /// @dev The function calculates the rewards earned by the user since the last time they were paid by multiplying their staked amount with the difference between the current accumulated reward per token and the amount they have already been paid. If the calculated rewards are greater than zero, it adds them to the user's total rewards. Finally, it updates the user's reward paid amount to the current accumulated reward per token to reflect that they have been settled up to this point.
    /// @param _user The address of the user for whom the rewards are being settled. This should be the address of the user who is interacting with the contract (e.g., staking, withdrawing, or claiming rewards).
    function _settleUser(address _user) internal {
        uint256 earned = (userStaked[_user] * (accRewardPerToken - userRewardPaid[_user])) / PRECISION;
        if (earned > 0) {
            rewards[_user] += earned;
        }
        userRewardPaid[_user] = accRewardPerToken;
    }

    /// @notice Allows a user to stake a specified amount of tokens in the contract to start earning rewards.
    /// @dev The function first updates the global reward state to ensure that rewards are calculated correctly for all users. It then settles the rewards for the user who is staking, ensuring that any pending rewards are accounted for before updating their staked amount. Finally, it transfers the staked tokens from the user's address to the contract and updates the total staked amount.
    /// @param _amount The amount of tokens the user wants to stake. This value must be greater than zero for the function to execute.
    function stake(uint256 _amount) external {
        if (_amount <= 0){
            revert AmountMustBeGreaterThanZero();
        }
        _updateGlobal();
        _settleUser(msg.sender);
        stakingToken.safeTransferFrom(msg.sender, address(this), _amount);
        userStaked[msg.sender] += _amount;
        totalStaked += _amount;

        emit Staked(msg.sender, _amount);
    }

    /// @notice Allows a user to withdraw a specified amount of their staked tokens from the contract.
    /// @dev The function first checks if the user has enough staked tokens to withdraw the requested amount. If the user has sufficient staked tokens, it updates the global reward state and settles the user's rewards before reducing their staked amount and transferring the withdrawn tokens back to their address. The total staked amount in the contract is also updated accordingly.
    /// @param _amount The amount of staked tokens the user wants to withdraw. This value must be greater than zero and less than or equal to the user's currently staked amount for the function to execute.
    function withdraw(uint256 _amount) external {
        if(userStaked[msg.sender] < _amount){
            revert NotEnoughStakedTokensToWithdraw();
        }
        if(_amount <= 0){
            revert AmountMustBeGreaterThanZero();
        }
        _updateGlobal();
        _settleUser(msg.sender);
        userStaked[msg.sender] -= _amount;
        totalStaked -= _amount;
        stakingToken.safeTransfer(msg.sender, _amount);

        emit Withdrawn(msg.sender, _amount);
    }

    /// @notice Allows a user to claim their accumulated rewards from staking. The function calculates the rewards earned by the user since the last time they were paid, updates their total rewards, and transfers the reward tokens to their address.
    /// @dev The function first updates the global reward state to ensure that the rewards are calculated correctly for all users. It then settles the rewards for the user who is claiming, ensuring that any pending rewards are accounted for before transferring the reward tokens to their address. If the user has any rewards to claim, it resets their rewards to zero after transferring the tokens.
    function claim() external {
        _updateGlobal();
        _settleUser(msg.sender);

        uint256 reward = rewards[msg.sender];
        if(reward <= 0){
            revert NoRewardsToClaim();
        }   
        rewards[msg.sender] = 0;
        rewardToken.safeTransfer(msg.sender, reward);

        emit RewardClaimed(msg.sender, reward);
    }

    /// @notice Allows the contract owner to set the reward rate for the staking rewards. This function should be restricted to only the contract owner or an authorized address to prevent unauthorized changes to the reward distribution.
    /// @dev The function first updates the global reward state to ensure that rewards are calculated correctly for all users before changing the reward rate. It then updates the reward rate to the new value provided as a parameter. The reward rate determines how many reward tokens are distributed per second based on the total staked amount in the contract. Changing the reward rate will affect the rewards earned by users, so it is important to call this function with caution and ensure that it is only accessible to authorized personnel.
    /// @param _rewardRate The new reward rate to be set. This value should be a positive integer representing the number of reward tokens distributed per second based on the total staked amount in the contract. For example, if the reward rate is set to 1e18, it means that 1 reward token will be distributed per second for every 1 token staked in the contract.
    function setRewardRate(uint256 _rewardRate) external {
        _updateGlobal();
        rewardRate = _rewardRate;
    }
}
