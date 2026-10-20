# Vercel 部署 — Sepolia 测试网公开演示

本文档列出在 [Vercel](https://vercel.com) 部署 DualPool 前端 DApp（Sepolia 测试网演示）所需的**环境变量清单**与推荐流程。

> 适用场景：测试网公开体验，**非主网生产**。主网部署需额外通过 `make production-readiness` 等生产闸门。

## 1. Vercel 项目设置

| 项 | 推荐值 |
|---|---|
| **Root Directory** | `frontend` |
| **Framework Preset** | Next.js |
| **Build Command** | `pnpm run build`（默认） |
| **Install Command** | `pnpm install` |
| **Output Directory** | `.next`（默认） |
| **Node.js** | 20.x |

在 Vercel 项目 **Settings → General → Root Directory** 中填写 `frontend`，否则会在仓库根目录找不到 `package.json`。

## 2. 环境变量清单

在 **Settings → Environment Variables** 中配置。测试网演示建议全部勾选 **Production**、**Preview**、**Development**。

### 2.1 必填（合约与链）

从 `make sync-frontend-addresses` 同步后的 `frontend/.env.local` 复制，或与 `broadcast/DualPoolStaking.s.sol/11155111/run-latest.json` 一致。

| 变量名 | 示例 / 说明 | 备注 |
|---|---|---|
| `NEXT_PUBLIC_CHAIN_ID` | `11155111` | Sepolia；主网演示才用 `1` |
| `NEXT_PUBLIC_DUAL_STAKING_ADDRESS` | `0x…` | 质押核心合约 |
| `NEXT_PUBLIC_TOKEN_A_ADDRESS` | `0x…` | TokenA（灵活池质押资产） |
| `NEXT_PUBLIC_TOKEN_B_ADDRESS` | `0x…` | TokenB（锁仓池质押 + 奖励） |
| `NEXT_PUBLIC_DUAL_POOL_USER_MODULE_ADDRESS` | `0x…` | 用户模块 |
| `NEXT_PUBLIC_DUAL_POOL_ADMIN_MODULE_ADDRESS` | `0x…` | 管理员模块 |
| `NEXT_PUBLIC_STAKING_ADMIN_FACADE_ADDRESS` | `0x…` | Admin 治理门面 |
| `NEXT_PUBLIC_TIMELOCK_CONTROLLER_ADDRESS` | `0x…` | 48h Timelock |
| `NEXT_PUBLIC_TIMELOCK_SUPER_CONTROLLER_ADDRESS` | `0x…` | 72h Super Timelock |
| `NEXT_PUBLIC_OPERATOR_ROLE_HOLDER_ADDRESS` | `0x…` | Operator 角色地址 |
| `NEXT_PUBLIC_RPC_URL_SEPOLIA` | `https://sepolia.drpc.org` | 前端读链 RPC；建议用稳定付费或专用节点 |
| `NEXT_PUBLIC_STAKING_DEPLOY_BLOCK` | `11095818` | 质押合约部署区块；用于 APR / 注资历史索引 |

### 2.2 强烈建议（公开演示体验）

| 变量名 | 说明 |
|---|---|
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | [WalletConnect Cloud](https://cloud.walletconnect.com) 项目 ID；未配置时仅支持 MetaMask 等浏览器扩展钱包 |

### 2.3 可选

| 变量名 | 说明 |
|---|---|
| `NEXT_PUBLIC_SOCIAL_TWITTER` | 页脚 Twitter / X 链接 |
| `NEXT_PUBLIC_SOCIAL_DISCORD` | 页脚 Discord 链接 |
| `NEXT_PUBLIC_SOCIAL_TELEGRAM` | 页脚 Telegram 链接 |
| `NEXT_PUBLIC_USD_PRICE_TOKEN_A` | TokenA 美元参考价（演示可填 `1.00`） |
| `NEXT_PUBLIC_USD_PRICE_TOKEN_B` | TokenB 美元参考价（演示可填 `1.00`） |
| `NEXT_PUBLIC_RPC_URL_MAINNET` | 仅当 `NEXT_PUBLIC_CHAIN_ID=1` 时需要 |

### 2.4 不要配置在 Vercel 上

| 变量 | 原因 |
|---|---|
| `PRIVATE_KEY` | 私钥不得进入前端或 Vercel 环境 |
| `DEPLOYER_ACCOUNT` | 仅本地 Foundry 部署使用 |
| 治理多签 / Operator 操作密钥 | 仅链下签名，不进前端 |

所有 `NEXT_PUBLIC_*` 会打进浏览器 bundle，**仅放合约地址与 RPC URL**，不要放密钥。

## 3. 部署前检查（本地）

```bash
# 合约地址与 broadcast 一致
make sync-frontend-addresses

# Operator 奖励注资（公开演示前必做，见 docs/testnet-operator-notify.md）
# → 灵活池建议 50,000 TokenB / 7 天；锁仓池可选 20,000 TokenB / 7 天

# 测试网演示环境闸门（宽松）
make testnet-demo-env

# 前端构建与 smoke（可选）
cd frontend && pnpm build && pnpm test:e2e
```

## 4. Vercel 部署步骤

1. 将仓库连接到 Vercel（GitHub / GitLab）。
2. **Root Directory** 设为 `frontend`。
3. 按 §2 填入环境变量（可从 `frontend/.env.local` 批量复制）。
4. 首次 Deploy；等待 Build 成功。
5. 打开部署 URL，确认顶栏出现 **「Sepolia 测试网演示」** 横幅。
6. 用 MetaMask（Sepolia）连接钱包，走完：领空投 → 质押 → 查看仓位。

### WalletConnect 与域名

在 WalletConnect Cloud 项目中，将 Vercel 域名（如 `your-app.vercel.app` 与自定义域名）加入 **Allowed Domains**，否则移动端扫码可能失败。

## 5. 部署后自检

| 检查项 | 预期 |
|---|---|
| 顶栏测试网横幅 | 显示 Sepolia + 未经审计提示 |
| 钱包连接 | Sepolia 网络可连接；错误网络时提示切链 |
| 首页空投 | 新地址可领取 1000 TokenA |
| 质押 / 赎回 | 交易可在 Sepolia 浏览器查到 |
| APR 图表 | 有注资历史时显示曲线（依赖 RPC `eth_getLogs`） |
| 页脚合约链接 | 地址与 Etherscan Sepolia 一致 |

链上角色与模块校验（可选）：

```bash
RPC_URL=https://sepolia.drpc.org make post-deploy-verify
```

## 6. 常见问题

**Build 失败：找不到模块**  
确认 Root Directory 为 `frontend`，且 `pnpm-lock.yaml` 已提交。

**钱包连不上 / 一直读链中**  
检查 `NEXT_PUBLIC_RPC_URL_SEPOLIA` 是否可用、是否触发免费 RPC 限流；可换 Alchemy / Infura / drpc 专用 URL。

**合约地址与页面不一致**  
重新 `make sync-frontend-addresses`，更新 Vercel 环境变量后 **Redeploy**（非仅重新构建缓存）。

**APR 历史为空**  
确认 `NEXT_PUBLIC_STAKING_DEPLOY_BLOCK` 正确；部分公共 RPC 限制 `eth_getLogs` 深度，需换归档节点。

**移动端无法扫码**  
配置 `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` 并在 WC 控制台登记 Vercel 域名。

## 7. 对外宣传话术（建议）

> DualPool Sepolia 测试网演示 — 代币无真实价值，协议未经外部审计。请使用 Sepolia 测试 ETH 体验，勿转入主网资产。
