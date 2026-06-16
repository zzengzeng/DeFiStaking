# FOTTransferLib
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/699d0d97f5ced33dab5ac0c4d8ce25e0620ec92b/src/libraries/FOTTransferLib.sol)

**Title:**
FOTTransferLib

FOT-safe outbound transfers: user bears transfer tax; pool never grosses-up.

Inbound stake/notify paths use balance-delta separately. Outbound sends the booked `grossAmount` from the vault;
the recipient wallet receives less when the token charges a transfer fee. `maxTransferFeeBP` bounds tolerated tax.


## Functions
### walletReceiveAfterFee

Estimates wallet net after an outbound `grossAmount` transfer (off-chain preview should use the same formula).


```solidity
function walletReceiveAfterFee(uint256 grossAmount, uint256 maxTransferFeeBP, uint256 basisPoints)
    internal
    pure
    returns (uint256);
```

### transferGross

Transfers `grossAmount` to `to`; FOT tax is borne by the recipient (not subsidized by the pool).

When `maxTransferFeeBP > 0`, reverts `ExcessiveTransferFee` if implied tax exceeds the configured ceiling.


```solidity
function transferGross(IERC20 token, address to, uint256 grossAmount, uint256 maxTransferFeeBP, uint256 basisPoints)
    internal
    returns (uint256 received);
```

## Events
### OutboundTransfer

```solidity
event OutboundTransfer(address indexed token, address indexed to, uint256 grossAmount, uint256 netReceived);
```

