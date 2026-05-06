# IERC1820Registry
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/c3cdaa9f3e5e324db578e81e0109756c6d9d8922/src/DualPoolStakingOld.sol)

Minimal EIP-1820 registry interface for deployment-time ERC777 hook checks on this contract and TokenA.

If the registry has no code at the pinned address, constructor checks no-op on that network.


## Functions
### getInterfaceImplementer

Returns the implementer registered for `account` and `interfaceHash`, if any.


```solidity
function getInterfaceImplementer(address account, bytes32 interfaceHash) external view returns (address implementer);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`account`|`address`|Account queried (this contract or a token address).|
|`interfaceHash`|`bytes32`|ERC777 `TokensRecipient` / `TokensSender` (or other) interface id.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`implementer`|`address`|Registered implementer address, or the zero address if none.|


