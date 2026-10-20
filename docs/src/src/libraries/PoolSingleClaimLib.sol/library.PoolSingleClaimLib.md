# PoolSingleClaimLib
[Git Source](https://github.com/zzengzeng/DeFiStaking/blob/49679f252829d0b3ac33cfb42d46070f8f7fbdc0/src/libraries/PoolSingleClaimLib.sol)

**Title:**
PoolSingleClaimLib

Linked library: single-pool reward claim with min-claim, bad-debt, and on-hand liquidity checks.

Pays out the core `rewardToken` (TokenB). Ledger `rewards` is the **gross** vault transfer amount;
FOT transfer tax on outbound is borne by the user (see PRD §4.6).


## Functions
### executeClaim

Pays `userInfo.rewards` to `p.claimer` if all checks pass; updates pending and cooldown.


```solidity
function executeClaim(
    PoolInfo storage pool,
    UserInfo storage userInfo,
    mapping(address => uint256) storage lastClaimTime,
    ClaimParams memory p
) external returns (uint256 reward);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`reward`|`uint256`|Gross amount sent from the vault (wallet net may be lower under FOT TokenB).|


## Structs
### ClaimParams
Static parameters for `executeClaim` (global config + cross-pool bad-debt guard).


```solidity
struct ClaimParams {
    /// @notice ERC20 used for payout (TokenB).
    IERC20 rewardToken;
    /// @notice Address receiving the transfer (also used as `lastClaimTime` key).
    address claimer;
    /// @notice Minimum `userInfo.rewards` for a successful claim (unless bypassed at a higher layer).
    uint256 minClaimAmount;
    /// @notice Pool A `badDebt` snapshot; both must be zero to allow claim.
    uint256 badDebtPoolA;
    /// @notice Pool B `badDebt` snapshot; both must be zero to allow claim.
    uint256 badDebtPoolB;
    /// @notice FOT outbound tax ceiling (`0` = standard ERC20, no post-transfer check).
    uint256 maxTransferFeeBP;
    /// @notice Basis-point denominator (`10_000`).
    uint256 basisPoints;
}
```

