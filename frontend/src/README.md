# Frontend 源码结构

Next.js App Router + wagmi + RainbowKit。同一套合约，两套 UI：**产品端**（面向质押用户）与 **合约控制台**（运维 / 治理 / 调试）。

## 目录概览

```
src/
├── app/              # 路由入口（薄 wrapper，业务在 views/）
├── views/            # 页面级组合：product/*、console/*
├── components/       # 可复用 UI（product/*、console/* 子目录按域划分）
├── hooks/            # 链上读写的 React hooks
├── lib/              # 纯函数、文案 hook、格式化、错误映射
├── store/            # Zustand 客户端状态（语言、Tx Center）
├── providers/        # Web3Provider（Wagmi + RainbowKit + Query）
├── contracts/        # 地址与 ABI
├── config/           # wagmi / chains
└── server/           # Route Handler 用的链上索引（notify、timelock）
```

## 双模式路由

| 模式 | 路径前缀 | Shell | 说明 |
|------|----------|-------|------|
| 产品 | `/`、`/earn/*`、`/withdraw/*`、`/learn` | `ProductShell` | 简化 UX，隐藏原始合约字段 |
| 控制台 | `/console/*` | `ConsoleShell` | 完整链上字段、治理 Timelock、运维注资 |

路由与模式判断见 `lib/appMode.ts`。`ModeSwitcher` 在两种模式间跳转，`counterpartPath()` 维护对应深链。

## 国际化（i18n）

- **语言包**：`lib/i18n/messages/zh.ts`、`en.ts`（点分键，如 `home.heroTitle`）
- **Hook**：`useI18n()` → `{ locale, setLocale, t }`；`t("key", { var })` 支持 `{name}` 占位
- **持久化**：`store/useLocaleStore.ts`（localStorage `dualpool-locale-v1`）
- **非组件上下文**：`translate(locale, key)` 或 `mapContractErrorLocalized(error)`

### 文案分层（避免再写死字符串）

| 用途 | 入口 | 键前缀示例 |
|------|------|------------|
| 产品页通用 | `useI18n().t()` | `home.*`、`stake.*`、`withdraw.*`、`txCenter.*` |
| 控制台壳层 / 池页 | `useConsoleCopy()` | `console.nav.*`、`console.poolA.*`、`console.withdraw.*` |
| Timelock / 赎回预览 | `useUiCopy()` | `timelock.*`、`withdrawPreview.*`、`operatorTx.*` |
| 治理面板 | `useI18n().t()` | `governance.*`、`govTimelock.*`、`governanceCard.*` |
| 链上错误 toast | `mapContractError(e, t)` | `errors.*` |
| 协议状态横幅 | `useI18n().t()` | `statusBanner.*` |

`POOL_COPY`（`appMode.ts`）**仅保留路由、token 符号、样式 class**；展示文案请用 `pool.flexible.*` / `pool.locked.*` 或 `console.nav.*`。

新增 UI 文案：先在 `zh.ts` / `en.ts` 各加一条，再在组件里 `t()`；勿在 TSX 中写中英文硬编码。

## 交易流

1. **按钮状态**：`lib/txFlowTypes.ts` 的 `TxState` + `TransactionButton`
2. **单笔流程**：`hooks/useTransactionFlow.ts`（approve → write）
3. **全局队列**：`store/useTxStore.ts` + `TxCenterPanel` / `TxToastManager`
4. **管道执行**：`lib/executeTransaction.ts` 的 `runTransactionPipeline`

控制台写操作优先走 `useWriteWithStatus` 或 `useTransactionFlow`，失败时经 `errors.ts` 映射为用户可读提示。

## 数据 hooks（常用）

完整说明见 **[hooks/README.md](./hooks/README.md)**。

| Hook | 作用 |
|------|------|
| `useStaking` | 协议全局状态、双池 TVL、费率参数 |
| `usePoolA` / `usePoolB` | 单池读写 + 用户仓位 |
| `useProtocolRoles` | OPERATOR / ADMIN |
| `useTimelockGovernanceRoles` | Timelock PROPOSER / EXECUTOR / CANCELLER |
| `useTimelockOps` | 治理队列索引（配合 API route） |
| `useTransactionFlow` / `useWriteWithStatus` | 写交易 + Tx Center |

## 控制台页面

`views/console/` 四页结构与权限说明见 **[views/console/README.md](./views/console/README.md)**。

## 添加新页面

1. 在 `views/product/` 或 `views/console/` 实现页面组件
2. 在 `app/**/page.tsx` 只做 `export default`  re-export
3. 产品页用 `ProductPageShell`；控制台页无需额外 shell（已由 `ConsoleShell` 包裹）
4. 所有用户可见字符串走 i18n（见上表）
