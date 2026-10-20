# Sepolia 测试网 — Operator 奖励注资操作手册

面向 **公开演示** 前的一次性链上准备：给灵活池 / 锁仓池注入 **TokenB 奖励预算**，使用户质押后能看到 APR、累积奖励并可领取。

> 仅适用于当前 Sepolia Mock 代币部署。TokenB 为测试币，无真实价值。

## 0. 前置条件

| 项 | 要求 |
|---|---|
| 网络 | Sepolia（Chain ID `11155111`） |
| 钱包 | 持有 `OPERATOR_ROLE` 的地址（见 `NEXT_PUBLIC_OPERATOR_ROLE_HOLDER_ADDRESS` 或部署日志） |
| Gas | 钱包内有少量 Sepolia ETH |
| 协议状态 | `NORMAL`（未 Pause / Emergency / Shutdown） |
| 前端 | 已 `make sync-frontend-addresses`，本地或 Vercel 能打开控制台 |

当前仓库同步的 Operator 参考地址（以你本地 `frontend/.env.local` 为准）：

`0xb65214b2F45892399b2E4724d34996552534F94f`

**必须用实际持有 `OPERATOR_ROLE` 的钱包连接**，否则控制台不显示注资面板。

---

## 1. 推荐注资方案（测试网演示）

### 方案 A — 最小可演示（只开灵活池）

适合：先验证「质押 → 有奖励 → 领取」闭环。

| 池 | 函数 | TokenB 数量 | 排放周期 | 说明 |
|---|---|---:|---:|---|
| **灵活池 A** | `notifyRewardAmountA` | **10,000** | **604800**（7 天） | 新用户主路径；空投 TokenA 后质押即可赚 TokenB |

锁仓池可暂不注资；用户需先灵活池领到 TokenB 才能体验锁仓。

### 方案 B — 推荐公开演示（双池都可用）

适合：对外宣传、体验者指南完整走通。

| 顺序 | 池 | 函数 | TokenB 数量 | 排放周期 |
|---|---|---|---:|---:|
| 1 | **灵活池 A** | `notifyRewardAmountA` | **50,000** | **604800**（7 天） |
| 2 | **锁仓池 B** | `notifyRewardAmountB` | **20,000** | **604800**（7 天） |

### 方案 C — 高 APR 短期活动（可选）

TVL 很低、希望几小时内就看到明显待领取时：

| 池 | TokenB | 周期 |
|---|---:|---:|
| 灵活池 A | 5,000 | **86400**（1 天，合约允许的最短周期） |

周期越短、同等数量下 APR 越高，但 1 天后需再次注资续期。

### 数量怎么理解（不必精确）

- 注资的 TokenB **全部进入该池奖励预算**，在周期内按时间线性释放。
- TVL 越小，同样注资下 **APR 越高**（首页会动态显示）。
- 公开演示宁可 **多注一点**（如方案 B），避免早期用户质押后长时间看不到奖励。

**本次建议总 mint 量（方案 B）**：至少 **70,000 TokenB**（50k + 20k），另留 **5,000～10,000** 在 Operator 钱包作余量（Gas、误操作、续期）。

---

## 2. 操作顺序总览

```
① 部署者钱包 mint TokenB 给 Operator（新版 MockERC20 仅 owner 可 mint）
② 打开控制台 → 灵活池 → 注资灵活池（approve + notify）
③ （可选）打开控制台 → 锁仓池 → 注资锁仓池
④ 产品首页自检：APR > 0、注资历史有记录
⑤ 用新钱包走体验者指南完整测一遍
⑥ 再发布 / 宣传 Vercel 链接
```

---

## 3. 步骤 ① — 为 Operator 准备 TokenB

新版 `MockERC20` 的 `mint` **仅合约 owner（部署者）可调用**。Operator 不能自行 mint，需由 **部署 DualPoolStaking 时创建 TokenB 的钱包** 铸币给 Operator。

> **当前 Sepolia 已部署的旧 TokenB**（`0x65E9…`）仍为开放 mint，可继续用 Operator 自 mint；**重新 `make deploy-fresh-tokens` 后**须改用下方「部署者 mint」流程。

### 方式 A：Foundry cast（推荐）

在项目根目录，将 `OPERATOR` 换成你的 Operator 地址，**`--private-key` 使用部署者（TokenB owner）私钥**：

```bash
TOKEN_B=0x65E926f4B96D9f29082Fc6B3758132EcCC73bbf1
OPERATOR=0xb65214b2F45892399b2E4724d34996552534F94f
RPC=https://ethereum-sepolia-rpc.publicnode.com

# 方案 B：部署者 mint 80,000 TokenB 给 Operator（含余量）
cast send "$TOKEN_B" \
  "mint(address,uint256)" "$OPERATOR" "$(cast to-wei 80000)" \
  --rpc-url "$RPC" \
  --private-key "$DEPLOYER_PRIVATE_KEY"
```

也可在项目根执行：`make mint-tokenb-to-operator OPERATOR=0x… AMOUNT=80000`（读取 `.env` 中 `TOKEN_B` / `SEPOLIA_RPC_URL`）。

### 方式 B：Sepolia Etherscan

1. 打开 TokenB 合约：`https://sepolia.etherscan.io/address/<TOKEN_B>#writeContract`
2. 连接 **部署者钱包**（非 Operator）
3. `mint` → `to` = Operator 地址，`amount` = `80000000000000000000000`（80,000 × 10¹⁸）
4. 确认交易

### 校验余额

```bash
cast call "$TOKEN_B" "balanceOf(address)(uint256)" "$OPERATOR" --rpc-url "$RPC"
```

---

## 4. 步骤 ② — 灵活池注资（控制台点击顺序）

1. 浏览器打开前端（本地 `http://localhost:3000` 或 Vercel URL）
2. 顶栏切换到 **合约控制台**（或访问 `/console/pool-a`）
3. 右上角 **连接钱包** → 选择 **Operator 地址** → 确认网络为 **Sepolia**
4. 页面向下找到琥珀色卡片 **「运营 · 奖励注资」**（`notifyRewardAmountA · TokenB`）
5. 填写：
   - **TokenB 数量**：`50000`（方案 B）或 `10000`（方案 A）
   - **排放周期（秒）**：`604800`，或点快捷按钮 **「7 天」**
6. 点击 **「授权并注入」** 或 **「注入」**（若已有足够 allowance 则只注入）
7. 钱包依次确认：
   - 第一笔（如需）：`TokenB.approve(staking, amount)`
   - 第二笔：`notifyRewardAmountA(amount, duration)`
8. 等待 Sepolia 确认；页面 TVL / 奖励速率应刷新

**不要点击** 同卡片上的「启用紧急模式」，除非在做应急演练。

---

## 5. 步骤 ③ — 锁仓池注资（方案 B 时执行）

1. 控制台导航 → **锁仓池**（`/console/pool-b`）
2. 同样连接 **Operator 钱包**
3. 找到 **「运营 · 奖励注资」**（`notifyRewardAmountB · TokenB`）
4. 填写：
   - **TokenB 数量**：`20000`
   - **排放周期（秒）**：`604800`（7 天）
5. 点击 **「授权并注入」** → 确认 `approve`（如需）+ `notifyRewardAmountB`
6. 确认交易成功

---

## 6. 步骤 ④ — 注资后自检

| 检查项 | 在哪里看 | 预期 |
|---|---|---|
| 灵活池 APR | 产品首页 / `/` | > 0% |
| 锁仓池 APR | 产品首页（切锁仓 Tab） | > 0%（若做了步骤 ③） |
| 注资历史 | 控制台灵活池页底部「注资记录」 | 有 `RewardNotified` 事件 |
| APR 图表 | 首页下方 APR 历史 | 有数据点或当前 APR 参考线 |
| 协议状态 | 首页状态条 | 协议 = 正常 |

用 **非 Operator 的新钱包** 快速验证：

1. 首页领取 **1000 TokenA** 空投  
2. 质押 **100～500 TokenA** 到灵活池  
3. 等待 **5～15 分钟**（Sepolia 出块后奖励累积）  
4. 刷新首页 → **待领取奖励** > 0 → 点击 **领取奖励**

---

## 7. 续期与补注

7 天周期将尽或预算快发完时：

- 对同一池 **再次执行 notify**（可相同数量与周期）
- 新预算会与链上规则合并/衔接（以合约为准）；演示环境直接再注 50k / 20k 即可

---

## 8. 常见问题

**控制台看不到注资卡片**  
当前连接钱包不是 `OPERATOR_ROLE` 持有者。换 Operator 钱包或核对部署时 `OPERATOR` 环境变量。

**提示授权不足**  
正常。点击「授权并注入」会先 `approve` 再 `notify`，两笔交易。

**用户质押后 APR 有值但奖励一直是 0**  
等待几个区块；或 TVL 相对注资过大，调大注资数量或缩短周期（方案 C）。

**锁仓池无法质押**  
用户手里没有 TokenB。需先在灵活池赚奖励并 **领取** 到钱包，再质押锁仓池。

**`notify` 失败 revert**  
检查：协议是否 Pause、TokenB 余额是否足够、周期是否在 `86400～31536000` 秒之间、Operator 角色是否正确。

---

## 9. 与发布的关系

| 顺序 | 动作 |
|---|---|
| 1 | 本手册：mint TokenB → 灵活池注资 →（可选）锁仓池注资 |
| 2 | 产品端自检 + 新钱包完整体验 |
| 3 | `make testnet-demo-env` |
| 4 | 配置 Vercel 环境变量并部署 |
| 5 | 对外宣传 |

**先注资、再发布**；未注资时对外演示会出现 APR≈0、领不到奖励。

相关文档：

- [Vercel 部署环境变量](vercel-testnet-demo.md)
- [体验者指南](/learn)（前端 `/learn` 页面）
