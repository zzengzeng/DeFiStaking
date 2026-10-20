# 部署与前端地址同步（审计修复版）

审计修复涉及 **Core + UserModule + AdminModule** 及链接库，必须**成套部署并同步前端**，不可只换其中一个。

## 必须重新部署的合约

| 合约 | 原因 |
|------|------|
| `DualPoolStaking` (Core) | `crankCatchUpPool` 入口 `InvalidPool` 校验 |
| `DualPoolUserModule` | pause-aware `updateGlobal`、L-4/L-5、`InvalidPool` |
| `DualPoolAdminModule` | pause-aware `updateGlobal`、Admin L-5 `booked` 检查 |
| 链接库 | `PoolAccrualLib` / `PoolCatchUpLib` 等随模块重新 link |

`DualPoolStakingAdmin`、Timelock 若部署脚本一并新建，地址也会变；复用 TokenA/B 时用 `deploy-reuse-tokens`。

## 推荐流程（Sepolia 复用 Token）

```bash
# 1. 编译 & 测试
forge test

# 2. 部署（复用已有 TOKEN_A / TOKEN_B）
make deploy-reuse-tokens NETWORK=sepolia

# 3. 同步前端地址（.env.local + addresses.ts 默认值）
make sync-frontend-addresses

# 4. 校验
make post-deploy-verify          # 链上 userModule/adminModule 与 broadcast 一致
make frontend-contract-sync      # frontend/.env.local 与 broadcast 一致

# 5. 本地前端
cd frontend && pnpm dev

# 6. Operator 注资（若需 notify）
make mint-tokenb-to-operator OPERATOR=0x…
```

一键（部署 + 同步 + 校验）：

```bash
make deploy-reuse-tokens-sync NETWORK=sepolia
```

## 前端必须更新的环境变量

部署后 `make sync-frontend-addresses` 会写入 `frontend/.env.local`：

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_DUAL_STAKING_ADDRESS` | Core |
| `NEXT_PUBLIC_DUAL_POOL_USER_MODULE_ADDRESS` | 展示 / 治理对照 |
| `NEXT_PUBLIC_DUAL_POOL_ADMIN_MODULE_ADDRESS` | 展示 / 治理对照 |
| `NEXT_PUBLIC_STAKING_ADMIN_FACADE_ADDRESS` | 治理门面 |
| `NEXT_PUBLIC_TIMELOCK_CONTROLLER_ADDRESS` | 48h |
| `NEXT_PUBLIC_TIMELOCK_SUPER_CONTROLLER_ADDRESS` | 72h |
| `NEXT_PUBLIC_TOKEN_A_ADDRESS` / `TOKEN_B` | 与 pool 一致 |
| `NEXT_PUBLIC_STAKING_DEPLOY_BLOCK` | 事件索引起点 |

**Vercel / 生产**：将上述变量更新为最新 broadcast 值后 **Redeploy**（不要只 Rebuild 缓存）。

未配置 `NEXT_PUBLIC_*` 时，前端回退到 `frontend/src/contracts/addresses.ts` 的 `sepoliaDeploymentMeta`；`sync-frontend-addresses` 会一并 patch 该文件。

## 链上校验要点

`post-deploy-verify` 确认：

- `core.userModule() == USER_MODULE`（broadcast）
- `core.adminModule() == ADMIN_MODULE`（broadcast）
- AdminFacade 持有 `ADMIN_ROLE` / `DEFAULT_ADMIN_ROLE`

前端 `DeploymentMismatchAlert` 会对比：

- 链上 `poolA/B.stakingToken` vs env TokenA/B
- 链上 `userModule` / `adminModule` vs env 模块地址

## 仅升级模块（不推荐本次）

若保留旧 Core 且仅通过 72h timelock `setUserModule` / `setAdminModule` 换模块，**仍无法获得 Core 上 `InvalidPool` 入口校验**。审计修复建议 **全量 redeploy Core 栈**。
