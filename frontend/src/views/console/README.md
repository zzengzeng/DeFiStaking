# 合约控制台页面（views/console）

路由入口在 `app/console/**/page.tsx`（薄 re-export），**页面组合与业务逻辑在本目录**。

Shell：`ConsoleShell`（顶栏导航、角色徽章、Locale / Mode 切换）  
文案：`useConsoleCopy()` + 部分 `useI18n()`（如 Hub 钱包角色行）

## 路由对照

| 路由 | 组件 | 权限 |
|------|------|------|
| `/console` | `ConsoleHubPage` | 公开（治理卡片按角色灰显） |
| `/console/pool-a` | `ConsolePoolAPage` | 连接钱包后可操作 |
| `/console/pool-b` | `ConsolePoolBPage` | 连接钱包后可操作 |
| `/console/governance` | `ConsoleGovernancePage` | ADMIN / OPERATOR / Timelock 任一 |

导航标签文案：`console.nav.*`（勿用 `POOL_COPY.consoleTitle`）。

## ConsoleHubPage

**用途**：运维指挥台 — 协议健康、TVL、权限矩阵、按角色展示可进入的操作域、合约注册表。

**主要 hooks**：`useStaking`、`useProtocolRoles`、`useTimelockGovernanceRoles`（48h + 72h）

**i18n**：
- 壳层文案：`useConsoleCopy().hub.*`
- 钱包角色摘要：`buildWalletRoleSummaryLine(t, address, flags, loading)`
- 操作域卡片：`copy.hub.operationDomains.*`（按连接状态 / 角色动态 `locked`）

**子组件**（文件内）：`OperationDomainCard`、`PermissionRow`、`HealthTile`

## ConsolePoolAPage

**用途**：灵活池 **完整链上调试** — 原始字段、stake/withdraw/claim/emergency、Operator 注资。

**与产品端差异**：展示 `rewardRate`、WADP 索引字段；`StakeCard variant="console"`；无产品化简化。

**布局块**：
1. `DeploymentMismatchAlert` — env 与链上 token 不一致
2. `PoolHeaderStats` — TVL / APR / APY / 份额
3. `StakeCard` + `WithdrawPanel`（灵活池无费率阶梯）
4. 仓位明细（`userInfoA` 原始 tuple）
5. `OperatorNotifyPanel pool="A"`
6. `ForceClaimAllButton` — shutdown / badDebt 逃生

**写交易**：`useWriteWithStatus` + `usePoolA` 的 `write*`；`actionLabel` 用 `copy.poolA.*`

**辅助**：`usePoolAStakeSince` 展示质押时长（i18n `console.poolA.stakeDuration*`）

## ConsolePoolBPage

**用途**：锁仓池完整交互 — unlockTime、费率预览、compound、Smart Suggestions 赎回。

**额外组件**：`LockProgress`、`WithdrawPanel` + `pool.computeWithdrawPreviewB` / `suggestion`

**写交易**：withdraw / claim / compound / emergency；compound 与 emergency 带 `ConfirmActionModal`

**i18n**：`copy.poolB.*`、`copy.common.*`（compound、emergency）

## ConsoleGovernancePage

**用途**：门禁 + 渲染 `GovernancePanel`（Timelock 队列、Operator 热路径、23 项治理卡）。

**门禁顺序**：未连接 → 加载角色 → 无权限 → 通过

**子树**（在 `GovernancePanel` 内，非本文件）：
- `TimelockQueue` / `GovernanceTimelockCards`
- `OperatorNotifyRewardsSection`
- pause / enableEmergency 等 OPERATOR 热按钮

**i18n**：页头 `copy.governance.*`；面板内 `governance.*` / `govTimelock.*`

## 修改控制台页时注意

1. 新增用户可见字符串 → `zh.ts` / `en.ts`，优先 `console.*` 或 `governance.*`
2. 写操作后调用对应 `refetchWalletAndPool` 或 `useStaking` 所在页的 refresh
3. 紧急/关停路径与 `StatusBanner`、产品端 `ProductEscapeActions` 行为应对齐链上规则
4. 控制台 intentionally 暴露原始 bigint / 字段名，勿改成产品化 copy
