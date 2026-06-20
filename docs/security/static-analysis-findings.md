# Static Analysis Findings

This file records static-analysis findings that are either fixed or intentionally accepted. It must be updated whenever Slither output changes.

## Current Slither Command

```shell
make static-analysis
```

`make static-analysis` excludes only the detector classes listed in the accepted-findings table below. Other Slither findings still fail CI and must be fixed or reviewed.

## Accepted Findings

| Detector | Location | Disposition | Rationale | Revisit trigger |
| --- | --- | --- | --- | --- |
| `arbitrary-send-erc20` | `DualPoolAdminModule.executeNotifyRewardAmountA/B` | Accepted pattern | The external Core entrypoints are restricted by `OPERATOR_ROLE` and pass Core `msg.sender` as `sender`; the operator funds rewards from its own approved balance. This is not an arbitrary public pull. | Any change to notify authorization or payer routing |
| `uninitialized-state` | `DualPoolStaking.emergencyMode`, `DualPoolStaking.shutdown` | False positive | Solidity default `false` is the intended initial state; tests cover emergency/shutdown transitions. | Any constructor/state initialization change |
| `unused-return` | `FOTTransferLib.transferGross` callers | Accepted pattern | The function enforces max outbound FOT slippage and reverts on excessive fee; callers intentionally do not use returned net amount for accounting because recipient bears outbound tax. | Any change to FOT accounting policy |
| `timestamp` | cooldown, timelock, reward, pause/shutdown windows | Accepted design | The protocol intentionally uses `block.timestamp` for reward accrual windows, cooldowns, and governance timing. Miner timestamp latitude is not material relative to day-scale windows. | Any new sub-minute timing assumption |
| `assembly` / `low-level-calls` | `DualPoolStaking._delegateTo` | Accepted architecture | Core uses reviewed module delegatecall to stay within size limits; module changes are super-timelocked and code-length checked. | Any module routing or storage layout change |
| `naming-convention` | legacy BP/TVL/ERC naming | Accepted style debt | Public ABI names retain BP/TVL/ERC terminology for readability and compatibility. | Major ABI cleanup or fresh deployment namespace change |
| `constable-states` / `immutable-states` | mutable governance parameters and storage-layout fields | Mostly false positive | Several fields are intentionally mutable via governance or must remain in shared storage layout for delegatecall modules. | Storage-layout redesign |

## Blocking Rule

Any new high or medium finding that is not listed here must block release until fixed or accepted by protocol security and governance.
