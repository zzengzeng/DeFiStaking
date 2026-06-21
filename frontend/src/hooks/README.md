# Hooks 说明

本目录封装 **链上读** 与 **写交易编排**，供 `views/` 与 `components/` 消费。原则：

- **读**：wagmi `useReadContract(s)` / React Query；能合并的读请求优先走 `useStaking` multicall
- **写**：hook 只返回 `writeContractAsync` 包装函数或 `can*` 布尔；toast / Tx Center / 按钮状态由 UI 层 `useTransactionFlow` / `useWriteWithStatus` 负责
- **不在 hook 内写 UI 文案**；错误映射在 `lib/errors.ts`，展示用 `mapContractError(e, t)`

## 依赖关系（简图）

```
useStaking ─────┬──► usePoolA / usePoolB（can* + write*）
                ├──► useForceClaimAll
                └──► StatusBanner / 各页 TVL·APR

useProtocolRoles ──► ConsoleHub / Governance 门禁
useTimelockGovernanceRoles ──► 治理页 + Hub 权限矩阵

useApproveIfNeeded ──► useTransactionFlow.runStakeFlow
useTransactionFlow ──► useTxCenter ──► runTransactionPipeline
useWriteWithStatus ──► useTransactionFlow.executeWrite（控制台常用）
```

## 协议与池子

| Hook | 作用 | 典型消费者 |
|------|------|------------|
| `useStaking` | 单次 multicall：双池 `poolA/B`、协议 status、费率、用户 `userInfoA/B` | 全局 Shell、Hub、池页 |
| `usePoolA` | Pool A 余额、`canStake/Withdraw/Claim/Emergency`、原始 `writeStakeA` 等 | 产品灵活池、控制台 pool-a |
| `usePoolB` | Pool B 同上 + `computeWithdrawPreviewB`、compound | 产品锁仓池、控制台 pool-b |
| `usePoolAStakeSince` | 扫描 `Staked` 事件，算 Pool A 首次质押时间戳 | 控制台 pool-a 仓位区 |
| `useForceClaimAll` | shutdown / badDebt 下 `forceClaimAll` 门禁与 write | `ForceClaimAllButton` |

`usePoolA` / `usePoolB` 的 `refetchWalletAndPool()` 应在写交易 `onConfirmed` 后调用，以保持 UI 与链上一致。

## 权限

| Hook | 作用 |
|------|------|
| `useProtocolRoles` | 核心 `ADMIN_ROLE` / `OPERATOR_ROLE` |
| `useTimelockGovernanceRoles(addr?)` | Timelock `PROPOSER` / `EXECUTOR` / `CANCELLER`；默认 48h，传 `timelockSuper` 为 72h |

## 交易流

| Hook | 作用 |
|------|------|
| `useApproveIfNeeded` | ERC20 allowance；`needsApproval(amountWei)` + `refetchAllowance` |
| `useTransactionFlow` | 本地 `TxState` + 入队 Tx Center；`executeApprove` / `executeWrite` / `runStakeFlow` |
| `useWriteWithStatus` | 薄封装，控制台治理卡、OperatorNotify、池页写操作常用 |
| `useTxCenter` | 读写在 store 上的队列 UI：`startTransaction`、筛选、清空 |

产品端质押优先 `useStakeApprovalTransaction()`（`useTransactionFlow` 的 stake 专用导出）。

## 索引 / API（链下辅助）

| Hook | 数据源 | 说明 |
|------|--------|------|
| `useTimelockOps` | `GET /api/timelock-ops` | 治理队列索引 |
| `useNotifyRewardLogs` | 浏览器 `publicClient.getLogs` | 运营注资记录（与钱包同 RPC） |
| `useRewardNotifiedHistory` | `GET /api/notify-rewards` | 服务端索引版注资历史 |
| `useStakerStats` | `GET /api/stakers` | 首页质押人数统计 |

索引类 hook 均带 `refetchInterval`；RPC 区块跨度受限时见 `useNotifyRewardLogs` / `usePoolAStakeSince` 内的降级逻辑。

## 工具

| Hook | 作用 |
|------|------|
| `useExplorerLink` | 当前链上 tx hash → 区块浏览器 URL |

## 新增 hook 建议

1. 若只读且已被 `useStaking` multicall 覆盖，优先扩展 `useStaking` 而非新 hook
2. 写操作返回 `Promise<Hash>`，不要在内层弹 toast
3. 需要多笔并发时走 `useTxCenter.startTransaction`，不要自己 `waitForTransactionReceipt`
4. 对外暴露的禁用原因用 `can*` + 可选 `*DisabledReason` 字符串，文案在 UI 层 `t()`
