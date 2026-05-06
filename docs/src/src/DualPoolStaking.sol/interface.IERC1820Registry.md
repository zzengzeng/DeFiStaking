# IERC1820Registry
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/c3cdaa9f3e5e324db578e81e0109756c6d9d8922/src/DualPoolStaking.sol)

Minimal view into the canonical ERC-1820 registry for ERC777 deployment checks.

Registry address is fixed at `0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24` on Ethereum mainnet and many L2s; if bytecode is absent the core skips hook checks.


## Functions
### getInterfaceImplementer

Returns the registered implementer for `account` and `interfaceHash`, if any.


```solidity
function getInterfaceImplementer(address account, bytes32 interfaceHash) external view returns (address implementer);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`account`|`address`|Address whose ERC777 hook registration is queried (core, token, or user).|
|`interfaceHash`|`bytes32`|ERC777 `TokensRecipient` / `TokensSender` interface id (or other registered id).|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`implementer`|`address`|Registered hook implementer, or `address(0)` if none.|


