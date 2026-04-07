// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";


// @title Single Pool Staking Contract
// @notice This contract allows users to stake a single type of token and earn rewards based on their staked amount and duration.
// @dev This contract is a simplified version of a staking contract, focusing on a single pool for demonstration purposes. It includes basic functionalities such as staking, unstaking, and reward calculation. The actual implementation would require additional features such as access control, emergency withdrawal, and more robust reward distribution logic.
contract SinglePoolStaking is Ownable{
    using SafeERC20 for IERC20;
    IERC20 public stakingToken; // The token that users will stake
    IERC20 public rewardToken; // The token that users will receive as rewards

    uint256 public totalStaked; // Total amount of tokens staked in the contract
    uint256 public rewardRate; // The rate at which rewards are distributed (e.g. tokens per second)
    uint256 public lastUpdateTime; // The last time the rewards were updated
    uint256 public accRewardPerToken; // Accumulated reward per token, used for calculating user rewards

    uint256 public availableRewards; // Total rewards available for distribution
    uint256 public periodFinish; // Duration of each reward period (e.g. 1 day, 1 week) 
    uint256 public badDebt; // Tracks any shortfall in rewards that may occur due to insufficient reward tokens in the contract  
    uint256 public totalPending; // Total rewards that have been earned by users but not yet claimed, used to track the pending rewards in the system
    uint256 public dust; // Tracks any small amounts of rewards that may be left undistributed due to precision issues in the reward calculations

    uint256 public constant PRECISION = 1e18; // Precision for reward calculations
    uint256 public constant MAX_DELTA_TIME = 30 days; // Maximum time delta to prevent overflow in reward calculations
    uint256 public constant DUST_TOLERANCE = 10 wei; // Threshold for dust accumulation before it is added back to available rewards

    mapping(address => uint256) public userStaked; // Mapping of user address to the amount they have staked
    mapping(address => uint256) public rewards; // Mapping of user address to the rewards they have earned
    mapping(address => uint256) public userRewardPaid; // Mapping of user address to the amount of rewards they have already been paid

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 reward);
    event InsufficientBudget(uint256 shortfall,uint256 timestamp);
    event DustAccumulated(uint256 dustAmount, uint256 timestamp);

    error AmountMustBeGreaterThanZero();
    error NotEnoughStakedTokensToWithdraw();
    error NoRewardsToClaim();
    error NotEnoughPendingRewardsToClaim();

    constructor(address _stakingToken, address _rewardToken) Ownable(msg.sender) {
        stakingToken = IERC20(_stakingToken);
        rewardToken = IERC20(_rewardToken);
    }

    /// @notice Updates the global reward state by calculating the rewards accumulated since the last update and adjusting the accumulated reward per token accordingly. This function should be called before any user interactions that affect the staked amounts or when changing the reward rate to ensure that rewards are calculated accurately for all users.
    /// @dev The function first checks if there are any tokens currently staked in the contract. If there are no staked tokens, it simply updates the last update time and returns. If there are staked tokens, it calculates the time difference since the last update, computes the rewards accumulated during that time, and updates the accumulated reward per token based on the total staked amount. Finally, it updates the last update time to the current block timestamp.
    function _updateGlobal() internal {
        // Ensure that we do not calculate rewards beyond the end of the reward period
        uint256 tApplicable = Math.min(block.timestamp, periodFinish); 
        if (tApplicable <= lastUpdateTime) return;
        
        // If there are no staked tokens, we cannot calculate rewards, so we just update the last update time and return
        if (totalStaked == 0) {
            lastUpdateTime = tApplicable;
            return;
        }


        // Calculate the time difference since the last update, ensuring it does not exceed the maximum allowed delta to prevent overflow in reward calculations
        uint256 deltaTimeRaw = tApplicable - lastUpdateTime;
        // Cap the delta time to prevent overflow in reward calculations, especially in cases where the contract has not been interacted with for an extended period
        uint256 deltaTime = Math.min(deltaTimeRaw, MAX_DELTA_TIME);
        // If the delta time is zero, it means that the rewards have already been updated for the current block, so we can return early to save gas
        if(deltaTime == 0) return;
        // Calculate the rewards accumulated during the delta time based on the reward rate and the total staked amount. The reward is calculated as the product of the delta time and the reward rate, which gives us the total rewards to be distributed during that period. We then update the accumulated reward per token by dividing the total rewards by the total staked amount, ensuring that we use a precision factor to maintain accuracy in the calculations.
        uint256 deltaReward = deltaTime * rewardRate;
        // If the available rewards are less than the calculated delta reward, we need to account for the shortfall (bad debt) and adjust the reward distribution accordingly. This ensures that users receive rewards based on the actual amount of rewards available in the contract, preventing over-distribution and maintaining the integrity of the reward system.
        uint256 actualReward;
        // If the available rewards are sufficient to cover the calculated delta reward, we can proceed with the normal reward distribution. We deduct the delta reward from the available rewards and add it to the total pending rewards, which tracks the rewards that have been earned by users but not yet claimed. The actual reward distributed during this update will be equal to the calculated delta reward.
        if(availableRewards >= deltaReward){
            availableRewards -= deltaReward;
            totalPending += deltaReward;
            actualReward = deltaReward;
        }else {
            uint256 shortfall = deltaReward - availableRewards;
            totalPending += availableRewards;
            actualReward = availableRewards;
            badDebt += shortfall;
            availableRewards = 0;
            emit InsufficientBudget(shortfall, block.timestamp);
        }
        // To prevent precision loss in the reward calculations, we use the mulmod function to calculate the reward per token with high precision. The mulmod function allows us to multiply the actual reward by the precision factor and then divide by the total staked amount without losing significant precision, especially when dealing with large numbers or small rewards. This approach ensures that users receive accurate rewards based on their staked amounts and the time they have been staking.
        uint256 reminder = mulmod(actualReward , PRECISION, totalStaked);
        // The truncated reward per token is calculated by dividing the reminder by the total staked amount, which gives us the actual reward per token that can be distributed to users. This value is then added to the accumulated reward per token, which tracks the total rewards that have been accumulated per token over time. By using the mulmod function and the precision factor, we ensure that the reward calculations are accurate and that users receive the correct amount of rewards based on their staking activity.
        uint256 truncatedWei = reminder / PRECISION;
        // The dust variable is used to track any small amounts of rewards that may be left undistributed due to precision issues in the reward calculations. By adding the truncated reward per token to the accumulated reward per token, we ensure that users receive their rewards based on the actual amount of rewards that can be distributed, while any remaining dust is tracked for future distribution when more rewards become available.
        dust += truncatedWei;
        if(dust >= DUST_TOLERANCE){
            availableRewards += dust;
            dust = 0;
        } else if(truncatedWei > 0){
            emit DustAccumulated(dust, block.timestamp);
        }
        // Finally, we update the accumulated reward per token by adding the truncated reward per token to it. This ensures that the accumulated reward per token reflects the total rewards that have been accumulated per token over time, allowing us to calculate user rewards accurately when they interact with the contract (e.g., staking, withdrawing, or claiming rewards). The last update time is also updated to the current block timestamp to reflect that the rewards have been updated up to this point.
        accRewardPerToken += Math.mulDiv(actualReward, PRECISION, totalStaked);
        lastUpdateTime += deltaTime;
    }

    /// @notice Settles the rewards for a specific user by calculating the rewards earned since the last time they were paid and updating their reward balance accordingly. This function should be called before any user interactions that affect their staked amounts or when claiming rewards to ensure that the user's rewards are calculated accurately based on their staking activity.
    /// @dev The function first retrieves the amount of tokens the user has staked. If the user has not staked any tokens, it simply updates their reward paid to the current accumulated reward per token and returns. If the user has staked tokens, it calculates the rewards earned by multiplying their staked amount by the difference between the current accumulated reward per token and the last reward paid to them, divided by the precision factor to maintain accuracy. If the user has earned any rewards, it adds those rewards to their total rewards balance. Finally, it updates the user's reward paid to the current accumulated reward per token to reflect that they have been paid up to this point.
    /// @param _user The address of the user for whom the rewards are being settled. This should be the address of the user who is interacting with the contract (e.g., staking, withdrawing, or claiming rewards) to ensure that their rewards are calculated accurately based on their staking activity.
    function _settleUser(address _user) internal {
        uint256 staked = userStaked[_user];
        if(staked == 0){
            userRewardPaid[_user] = accRewardPerToken;
            return;
        }
        uint256 earned = Math.mulDiv(staked, accRewardPerToken - userRewardPaid[_user], PRECISION);
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
        _updateGlobal();
        _settleUser(msg.sender);
        if(userStaked[msg.sender] < _amount){
            revert NotEnoughStakedTokensToWithdraw();
        }
        if(_amount <= 0){
            revert AmountMustBeGreaterThanZero();
        }
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
        if(totalPending < reward){
            revert NotEnoughPendingRewardsToClaim();
        }

        uint256 balance = rewardToken.balanceOf(address(this));
        uint256 pay = reward > balance ? balance : reward;

        totalPending -= pay;
        rewards[msg.sender] = 0;
        rewardToken.safeTransfer(msg.sender, pay);

        emit RewardClaimed(msg.sender, pay);
    }

    /// @notice Allows the contract owner to set the reward rate for the staking rewards. This function should be restricted to only the contract owner or an authorized address to prevent unauthorized changes to the reward distribution.
    /// @dev The function first updates the global reward state to ensure that rewards are calculated correctly for all users before changing the reward rate. It then updates the reward rate to the new value provided as a parameter. The reward rate determines how many reward tokens are distributed per second based on the total staked amount in the contract. Changing the reward rate will affect the rewards earned by users, so it is important to call this function with caution and ensure that it is only accessible to authorized personnel.
    /// @param _rewardRate The new reward rate to be set. This value should be a positive integer representing the number of reward tokens distributed per second based on the total staked amount in the contract. For example, if the reward rate is set to 1e18, it means that 1 reward token will be distributed per second for every 1 token staked in the contract.
    function setRewardRate(uint256 _rewardRate) external onlyOwner {
        _updateGlobal();
        rewardRate = _rewardRate;
    }

    /// @notice Allows the contract owner to notify the contract of a new reward amount and the duration for which the rewards should be distributed. This function should be restricted to only the contract owner or an authorized address to prevent unauthorized changes to the reward distribution.
    /// @dev The function first updates the global reward state to ensure that rewards are calculated correctly for all users before adding the new rewards. It then checks if the provided duration is greater than zero to prevent invalid reward distribution. If the amount of new rewards is greater than zero, it transfers the reward tokens from the owner's address to the contract, calculates the remaining rewards if the current reward period has not yet finished, and updates the reward rate and period finish time based on the new rewards and duration. The available rewards are also updated to include the new rewards added to the contract.
    /// @param amount The amount of new rewards to be added to the contract. This value should be a positive integer representing the number of reward tokens to be added for distribution. The owner must have approved the contract to transfer this amount of reward tokens on their behalf before calling this function.
    /// @param _duration The duration for which the new rewards should be distributed. This value should be a positive integer representing the time in seconds for which the rewards will be distributed. For example, if the duration is set to 7 days (604800 seconds), the new rewards will be distributed over a period of 7 days starting from the time this function is called.
    function notifyRewardAmount(uint256 amount, uint256 _duration) external onlyOwner {
        _updateGlobal();
        if(_duration == 0){
            revert AmountMustBeGreaterThanZero();
        }
        if(amount > 0){
            rewardToken.safeTransferFrom(msg.sender, address(this), amount);
            uint256 remaining = 0;
            if(block.timestamp < periodFinish){
                remaining = (periodFinish - block.timestamp) * rewardRate;
            }
            rewardRate = (amount + remaining) / _duration;
            periodFinish = block.timestamp + _duration;
            lastUpdateTime = block.timestamp;
            availableRewards += amount;
        }
    }
}
