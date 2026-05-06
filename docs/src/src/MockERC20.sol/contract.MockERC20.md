# MockERC20
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/c3cdaa9f3e5e324db578e81e0109756c6d9d8922/src/MockERC20.sol)

**Title:**
MockERC20

Minimal ERC20-style test token (18 decimals) with external `mint` for localnets and Foundry tests.

Not intended for production; no access control on `mint`.


## State Variables
### name
Human-readable token name.


```solidity
string public name
```


### symbol
Token symbol.


```solidity
string public symbol
```


### decimals
Fixed 18 decimals for compatibility with staking math.


```solidity
uint8 public constant decimals = 18
```


### totalSupply
Total minted supply.


```solidity
uint256 public totalSupply
```


### balanceOf

```solidity
mapping(address => uint256) public balanceOf
```


### allowance

```solidity
mapping(address => mapping(address => uint256)) public allowance
```


## Functions
### constructor

Sets metadata; does not pre-mint supply.


```solidity
constructor(string memory _name, string memory _symbol) ;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_name`|`string`|Token name.|
|`_symbol`|`string`|Token symbol.|


### transfer

Transfers `amount` from `msg.sender` to `to`.


```solidity
function transfer(address to, uint256 amount) external returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`to`|`address`|Recipient.|
|`amount`|`uint256`|Amount in smallest units.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bool`|ok Always true on success (reverts otherwise).|


### approve

Approves `spender` to spend up to `amount` on behalf of `msg.sender`.


```solidity
function approve(address spender, uint256 amount) external returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`spender`|`address`|Spender address.|
|`amount`|`uint256`|Allowance amount.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bool`|ok Always true on success.|


### transferFrom

Transfers `amount` from `from` to `to` using allowance, decrementing allowance unless set to `type(uint256).max`.


```solidity
function transferFrom(address from, address to, uint256 amount) external returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`from`|`address`|Source balance.|
|`to`|`address`|Recipient.|
|`amount`|`uint256`|Amount to move.|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bool`|ok Always true on success.|


### mint

Mints `amount` to `to`, increasing `totalSupply`.


```solidity
function mint(address to, uint256 amount) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`to`|`address`|Recipient; must not be zero address.|
|`amount`|`uint256`|Mint amount.|


### _transfer

Updates balances and emits `Transfer`; used by `transfer` and `transferFrom`.


```solidity
function _transfer(address from, address to, uint256 amount) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`from`|`address`|Source account holding `amount`.|
|`to`|`address`|Recipient account.|
|`amount`|`uint256`|Amount in smallest units (18-decimal wei for this mock).|


## Events
### Transfer
Emitted when `value` tokens move from `from` to `to` (`from == address(0)` for mints).


```solidity
event Transfer(address indexed from, address indexed to, uint256 value);
```

### Approval
Emitted when `owner` sets `spender` allowance to `value`.


```solidity
event Approval(address indexed owner, address indexed spender, uint256 value);
```

