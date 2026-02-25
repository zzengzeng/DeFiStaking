# ERC-20 DeFi 复合奖励质押协议需求规格说明书

## 1. 文档概览 (Document Overview)

* **架构模式**：平行双池 (Parallel Dual-Pool)。

* **Pool A (基础池)**：质押 Token A → 产出 Token B。

* **Pool B (收益池)**：质押 Token B → 产出 Token B（复利池）。

* **核心原则**：本金记账独立、收益确权线性化（负债模型）、时间加权防套利、紧急出口优先级最高。

* **放大因子**：固定为 `PRECISION = 1e18`，用于抵消 Solidity 整数除法精度损失（先乘后除，向下取整）。

---

## 2. 项目范围与角色定义 (Scope & Roles)

### 2.1 角色与权限模型

* **Operator (运维员)**：

  * 可执行：`pause/unpause`、`notifyRewardAmountA/B`（奖励注入与速率设置）、`setMinStakeAmount`。
  * 约束：建议使用 **多签 / Timelock**，至少关键操作走 **48h Timelock**。
* **Admin (管理员/多签)**：

  * 可执行：`setFees`、`setFeeRecipient`、`setMaxTVLCap`、`setLockDuration`、`toggleEmergencyMode`、`recoverToken`（受限）。
  * 约束：**必须多签**，强制建议 Timelock。
* **User (用户)**：

  * 可执行：`stakeA`、`stakeB`、`withdrawA/B`、`claimA/B`、`compound`、`emergencyWithdrawA/B`（仅在 Paused/Emergency）。

### 2.2 资产与隔离机制

* **Token A (Staking Token)**：Pool A 质押资产。

* **Token B (Reward Token)**：Pool A/Pool B 的奖励资产；Pool B 的质押资产也是 Token B。

* **物理隔离（强制）**：本协议 **不支持 A == B**，以避免准备金/负债核算复杂化。

  * 构造函数必须执行：

    * `require(address(stakingTokenA) != address(rewardTokenB), "A_EQ_B");`

* **逻辑隔离**：

  * Pool A 本金：`totalStakedA`
  * Pool B 本金：`totalStakedB`
  * Pool A/B 的奖励负债：`totalPendingA/B`
  * Pool A/B 的未释放预留：`availableRewardsA/B`

* **安全公式**：TokenB 的真实余额必须覆盖“本金 + 负债 + 预留”

  * `rewardTokenB.balanceOf(this) + dust >= totalStakedB + totalPendingA + totalPendingB + availableRewardsA + availableRewardsB`
  * `dust` 允许 1~2 wei（整数除法舍入）。

---

## 3. 全量状态变量与映射定义 (State Variables & Mappings)

### 3.1 核心资产与常量 (Constants & Assets)

| 变量名             | 类型        | 含义                       | 约束        |
| --------------- | --------- | ------------------------ | --------- |
| `stakingTokenA` | `IERC20`  | Pool A 质押资产              | Immutable |
| `rewardTokenB`  | `IERC20`  | Reward Token / Pool B 资产 | Immutable |
| `PRECISION`     | `uint256` | 放大因子 `1e18`              | 常量        |
| `PERCENT_BASE`  | `uint256` | BP 基数 `10000`            | 常量        |

### 3.2 收益分发控制 (Global Reward States)

| 变量名                  | 类型        | 含义             | 单位/备注       |
| -------------------- | --------- | -------------- | ----------- |
| `rewardRateA`        | `uint256` | A池每秒释放奖励速率     | weiB/sec    |
| `rewardRateB`        | `uint256` | B池每秒释放奖励速率     | weiB/sec    |
| `periodFinishA`      | `uint256` | A池奖励周期结束时间     | timestamp   |
| `periodFinishB`      | `uint256` | B池奖励周期结束时间     | timestamp   |
| `lastUpdateTimeA`    | `uint256` | A池上次全局结算锚点     | timestamp   |
| `lastUpdateTimeB`    | `uint256` | B池上次全局结算锚点     | timestamp   |
| `accRewardPerTokenA` | `uint256` | A池全局每单位累计收益指数  | 放大1e18      |
| `accRewardPerTokenB` | `uint256` | B池全局每单位累计收益指数  | 放大1e18      |
| `totalStakedA`       | `uint256` | A池总质押本金        | weiA（FOT净额） |
| `totalStakedB`       | `uint256` | B池总质押本金        | weiB        |
| `availableRewardsA`  | `uint256` | A池未释放奖励预留金     | weiB        |
| `availableRewardsB`  | `uint256` | B池未释放奖励预留金     | weiB        |
| `totalPendingA`      | `uint256` | A池已释放但未领取的负债总额 | weiB        |
| `totalPendingB`      | `uint256` | B池已释放但未领取的负债总额 | weiB        |

### 3.3 用户账本映射 (User Ledger Mappings)

| 映射名               | 类型                            | 含义                           |
| ----------------- | ----------------------------- | ---------------------------- |
| `userStakedA`     | `mapping(address => uint256)` | 用户 A池 本金                     |
| `userStakedB`     | `mapping(address => uint256)` | 用户 B池 本金                     |
| `rewardsA`        | `mapping(address => uint256)` | 用户 A池 已确权未领取收益（负债明细）         |
| `rewardsB`        | `mapping(address => uint256)` | 用户 B池 已确权未领取收益（负债明细）         |
| `userRewardPaidA` | `mapping(address => uint256)` | 用户 A池 指数快照                   |
| `userRewardPaidB` | `mapping(address => uint256)` | 用户 B池 指数快照                   |
| `unlockTimeA`     | `mapping(address => uint256)` | 用户 A池 解锁截止时间                 |
| `unlockTimeB`     | `mapping(address => uint256)` | 用户 B池 解锁截止时间                 |
| `stakeTimestampA` | `mapping(address => uint256)` | 用户 A池 持仓计时起点（费率阶梯）           |
| `stakeTimestampB` | `mapping(address => uint256)` | 用户 B池 持仓计时起点（费率阶梯）           |
| `lastClaimTime`   | `mapping(address => uint256)` | 用户上次 Claim/Compound 时间（全局冷却） |

### 3.4 费率与边界配置 (Fees & Configs)

| 变量名               | 类型        | 含义            | 默认值/约束                  |
| ----------------- | --------- | ------------- | ----------------------- |
| `lockDuration`    | `uint256` | 基础锁定期（秒）      | 7 days（建议 Max 90d）      |
| `penaltyFeeBP`    | `uint256` | 强制解押罚金（BP）    | 1000 (10%)（建议 Max 2000） |
| `withdrawFeeBP`   | `uint256` | 短期到期提现手续费（BP） | 100 (1%)                |
| `midTermFeeBP`    | `uint256` | 中期到期提现手续费（BP） | 50 (0.5%)               |
| `minStakeAmountA` | `uint256` | A池最小质押量       | 防粉尘                     |
| `minStakeAmountB` | `uint256` | B池最小质押量       | 防粉尘                     |
| `maxTVLCapA`      | `uint256` | A池TVL上限       | 可配                      |
| `maxTVLCapB`      | `uint256` | B池TVL上限       | 可配                      |
| `claimCooldown`   | `uint256` | 领取/复利冷却时间     | 24 hours                |
| `feeRecipient`    | `address` | 手续费/罚金接收地址    | Admin设定                 |
| `paused`          | `bool`    | 暂停状态          | -                       |
| `pausedAt`        | `uint256` | 暂停发生时间        | 用于平移周期                  |
| `emergencyMode`   | `bool`    | 紧急模式开关        | Admin                   |

---

## 4. 核心数学公式字段说明

### 4.1 全局收益累积指数公式 (Global Index)

用于在 **O(1)** 成本下滚动累计收益。

**有效时间截断：**

* `tApplicable = min(block.timestamp, periodFinish)`
* `deltaTime = tApplicable - lastUpdateTime`

**指数更新（仅 totalStaked > 0 时）：**
$$L_{new} = L_{old} + \frac{R \times \Delta t \times 10^{18}}{T}$$

| 字段 | 变量名 | 定义与单位 | 边界处理 |
| --- | --- | --- | --- |
| $L_{new}$ | `accRewardPerTokenX` | 更新后的每单位本金累计奖励量。 | 随时间单调递增。 |
| $R$ | `rewardRateX` | **奖励速率**。单位：**weiB/sec**。 | 由 notify 设置 |
| $\Delta t$ | `deltaTime` | 当前区块时间戳减去上次更新的时间戳。 | 单位：秒。 |
| $10^{18}$ | `Scaling Factor` | **放大因子**。用于在整数除法中保留精度。 | **必须使用**，防止$R < T$时结果为 0。 |
| $T$ | `totalStakedX` | weiA/weiB | 若 T=0，不释放奖励，只平移时间锚点 |

> **负债模型关键语义**：奖励不是在 Claim 时扣减，而是在 `_updateGlobalX()` 时，从 `availableRewardsX` 转移到 `totalPendingX`，并更新指数。

### 4.2 加权平均滚动锁定公式 (Rolling Lock)

用于防止 “到期前瞬间加仓套利”。

$$T_{new} = \text{now} + \frac{(V_{old} \times T_{rem}) + (V_{new} \times D)}{V_{old} + V_{new}}$$

* `T_rem = max(unlockOld - now, 0)`
* **PoolA**：只有 `stakeA` 会刷新 `unlockTimeA`
* **PoolB**：`stakeB` 和 `compound` 会刷新 `unlockTimeB`
* 任何情况下 **严禁 compound 刷新 A池 unlockTimeA**

---

## 5. 详细功能需求定义 (Detailed Functional Requirements)

### 5.1 质押模块 (Stake A)

#### 5.1.1 操作步骤（必须按序）

1. **状态校验**：`require(!paused)` 且 `require(!emergencyMode)`
2. **参数校验**：`require(amount >= minStakeAmountA)` 且 `require(totalStakedA + amount <= maxTVLCapA)`
3. **收益确权**：执行 `updateReward(user)`（内部会 `_updateGlobalA/_updateGlobalB` + 固化用户 rewards）
4. **FOT 净入账**：

   * `balBefore = stakingTokenA.balanceOf(this)`
   * `transferFrom(user -> this, amount)`
   * `received = balAfter - balBefore`
   * `require(received > 0)`
5. **账本更新**：

   * `userStakedA[user] += received`
   * `totalStakedA += received`
6. **滚动锁定刷新**（只影响 A 池）：

   * `unlockTimeA[user] = rollingLock(unlockTimeA[user], userStakedA_before, received, lockDuration)`
7. **费率计时器重置**：

   * `stakeTimestampA[user] = now`
8. **不变量校验**：`_assertInvariantB()`（TokenB 会计不变量）
9. **事件**：`Staked(user, received, unlockTimeA[user], "A")`

#### 5.1.2 Reads

* `paused`, `emergencyMode`
* `minStakeAmountA`, `maxTVLCapA`, `lockDuration`
* `userStakedA[user]`, `unlockTimeA[user]`, `stakeTimestampA[user]`
* 全局：`accRewardPerTokenA/B`, `lastUpdateTimeA/B`, `periodFinishA/B`, `rewardRateA/B`, `totalStakedA/B`, `availableRewardsA/B`, `totalPendingA/B`

#### 5.1.3 Writes

* 用户：`rewardsA/B[user]`, `userRewardPaidA/B[user]`
* A池本金：`userStakedA[user]`, `totalStakedA`
* A池时间：`unlockTimeA[user]`, `stakeTimestampA[user]`
* 全局指数：`accRewardPerTokenA/B`, `lastUpdateTimeA/B`, `availableRewardsA/B`, `totalPendingA/B`

#### 5.1.4 Failure Modes（revert 条件）

* `paused == true`
* `emergencyMode == true`
* `amount < minStakeAmountA`
* `totalStakedA + amount > maxTVLCapA`
* `transferFrom` 失败 / `received == 0`
* `_updateGlobalX` 中 `availableRewardsX < RewardDeltaX`（说明 notify 配置错误或余额不足，属于配置风险）

---

### 5.2 复利再质押 (Compound - B to B)

> 定义：将 **A池收益 + B池收益** 的 TokenB 统一结转到 **B池本金**，实现复利。

#### 5.2.1 操作步骤（必须原子）

1. **状态校验**：`require(!paused)` 且 `require(!emergencyMode)`
2. **冷却校验**：`require(now >= lastClaimTime[user] + claimCooldown)`
3. **收益确权**：执行 `updateReward(user)`（固化 rewardsA/rewardsB）
4. **读取并原子清零**（先清零防重入语义）：

   * `rA = rewardsA[user]`
   * `rB = rewardsB[user]`
   * `require(rA + rB > 0)`
   * `rewardsA[user] = 0`
   * `rewardsB[user] = 0`
5. **核销负债**（必须与用户清零对应）：

   * `totalPendingA -= rA`
   * `totalPendingB -= rB`
6. **结转本金**：

   * `userStakedB[user] += (rA + rB)`
   * `totalStakedB += (rA + rB)`
7. **刷新 B池滚动锁定**（只影响 B）：

   * `unlockTimeB[user] = rollingLock(unlockTimeB[user], userStakedB_before, rA+rB, lockDuration)`
8. **重置 B池持仓计时器**：

   * `stakeTimestampB[user] = now`
9. **更新冷却时间**：`lastClaimTime[user] = now`
10. **不变量校验**：`_assertInvariantB()`
11. **事件**：`Compounded(user, rA, rB, unlockTimeB[user])`

#### 5.2.2 Reads

* `paused`, `emergencyMode`
* `claimCooldown`, `lastClaimTime[user]`
* `rewardsA/B[user]`, `userStakedB[user]`, `unlockTimeB[user]`
* `totalPendingA/B`, `totalStakedB`

#### 5.2.3 Writes

* `rewardsA/B[user] = 0`
* `totalPendingA/B`（减少）
* `userStakedB`, `totalStakedB`（增加）
* `unlockTimeB`, `stakeTimestampB`, `lastClaimTime`

#### 5.2.4 Failure Modes

* `paused == true`
* `emergencyMode == true`
* `now < lastClaimTime + claimCooldown`
* `rA + rB == 0`
* `totalPendingA < rA` 或 `totalPendingB < rB`（理论不该发生；出现说明会计状态被破坏或代码错误，应 revert）

---

### 5.3 解押与提现 (Withdraw / Unstake)

> 提现分两类：
> ① **Early Exit（未到解锁时间）**：10% 罚金 + 收益回滚到 available
> ② **Mature Withdraw（到期）**：按持仓时长费率阶梯收取手续费

> 注意：A池提现只影响 A 的账本；B池提现只影响 B 的账本。

#### 5.3.1 操作步骤

1. **状态校验**：`require(!emergencyMode)`（Emergency 下统一走 emergencyWithdraw）
2. **收益确权**：`updateReward(user)`
3. **余额校验**：`require(amount > 0 && amount <= userStakedX[user])`
4. **判断是否 Early**：`isEarly = now < unlockTimeX[user]`
5. **分支执行（Early / Mature）**
6. **扣减本金账本**：`userStakedX -= amount; totalStakedX -= amount`
7. **转账**：`net -> user`，`fee/penalty -> feeRecipient`
8. **不变量校验**：`_assertInvariantB()`
9. **事件**：`Withdrawn(user, amount, feeOrPenalty, isEarly)`

---

#### 5.3.2 Early Exit 分支（会计回滚）

**Early Exit 必须包含“收益回滚分录”，否则可被套利。**

步骤：

5.1 读取并清零所有收益（A+B 同时清零，避免跨池套利）

* `rA = rewardsA[user]`
* `rB = rewardsB[user]`
* `rewardsA[user] = 0`
* `rewardsB[user] = 0`

5.2 回滚会计分录（负债→预留）

* `totalPendingA -= rA; totalPendingB -= rB`
* `availableRewardsA += rA; availableRewardsB += rB`

5.3 快照截断（防“旧指数回溯冒领”）

* `userRewardPaidA[user] = accRewardPerTokenA`
* `userRewardPaidB[user] = accRewardPerTokenB`

5.4 罚金计算

* `penalty = amount * penaltyFeeBP / PERCENT_BASE`
* `net = amount - penalty`

> 重要：Early Exit 不做 Claim，不发奖励，只回滚负债并罚本金。

**Reads**

* `unlockTimeA/B`, `penaltyFeeBP`
* `rewardsA/B`, `totalPendingA/B`, `availableRewardsA/B`
* `accRewardPerTokenA/B`, `userRewardPaidA/B`

**Writes**

* `rewardsA/B = 0`
* `totalPendingA/B -= r`
* `availableRewardsA/B += r`
* `userRewardPaidA/B = acc`
* `userStakedX`, `totalStakedX`

**Failure Modes**

* `amount > userStakedX`
* `totalPendingA < rA` 或 `totalPendingB < rB`（任何负数都必须 revert）
* `net underflow`（amount 太小且罚金大，通常不会；但 amount>0 下 net>=0）

---

#### 5.3.3 Mature Withdraw 分支（阶梯费率）

步骤：

5.1 费率计算依据：`tenure = now - stakeTimestampX[user]`

* `tenure < 90d` → `feeBP = withdrawFeeBP`
* `90d <= tenure < 180d` → `feeBP = midTermFeeBP`
* `tenure >= 180d` → `feeBP = 0`

5.2 计算手续费

* `fee = amount * feeBP / PERCENT_BASE`
* `net = amount - fee`

> Mature Withdraw **不清空 rewards**（收益仍在 rewardsX 中，用户可 later claim/compound）

**Reads**

* `stakeTimestampX`, `withdrawFeeBP`, `midTermFeeBP`
* `unlockTimeX`（用于判定不是 Early）

**Writes**

* 仅本金账本：`userStakedX`, `totalStakedX`
* 不修改 `rewards`（收益与提现解耦）

**Failure Modes**

* `amount > userStakedX`
* token transfer fail（net 或 fee 转账失败）

---

### 5.4 领取 (Claim) 流程

> Claim 只允许消费 **已释放负债 totalPendingX**。
> 不允许直接消耗 `availableRewardsX`（那是未释放预留金）。

#### 5.4.1 操作步骤

1. **状态校验**：`require(!emergencyMode)`（Emergency 禁止）
2. **冷却校验**：`require(now >= lastClaimTime[user] + claimCooldown)`
3. **收益确权**：`updateReward(user)`
4. **计算可支付额度（Partial 规则）**：

   * `owedA = rewardsA[user]`
   * `owedB = rewardsB[user]`
   * `payA = min(owedA, totalPendingA)`
   * `payB = min(owedB, totalPendingB)`
   * `require(payA + payB > 0)`
5. **核销负债与个人账本**：

   * `rewardsA[user] -= payA; totalPendingA -= payA`
   * `rewardsB[user] -= payB; totalPendingB -= payB`
6. **转账**：向用户发送 `payA + payB` 的 TokenB
7. **更新冷却**：`lastClaimTime[user] = now`
8. **不变量校验**：`_assertInvariantB()`
9. **事件**：`Claimed(user, payA, payB)`

#### 5.4.2 Reads

* `claimCooldown`, `lastClaimTime`
* `rewardsA/B`, `totalPendingA/B`

#### 5.4.3 Writes

* `rewardsA/B`（减少）
* `totalPendingA/B`（减少）
* `lastClaimTime`

#### 5.4.4 Failure Modes

* `emergencyMode == true`
* `now < lastClaimTime + claimCooldown`
* `payA + payB == 0`（无可领收益）
* `ERC20 transfer` 失败
* `totalPending` underflow（必须 revert）

---

## 6. 手续费与奖励速率管理 (Fees & Rates)

### 6.1 手续费衰减阶梯表

| 持仓时长 (T)            | 费率比例 (BP)  | 变量名             | 收益处理策略                           |
| ------------------- | ---------- | --------------- | -------------------------------- |
| `now < unlockTime`  | 1000 (10%) | `penaltyFeeBP`  | **清空 rewardsA/B 并回滚至 available** |
| `unlock <= T < 90d` | 100 (1%)   | `withdrawFeeBP` | rewards 保留                       |
| `90d <= T < 180d`   | 50 (0.5%)  | `midTermFeeBP`  | rewards 保留                       |
| `T >= 180d`         | 0          | -               | rewards 保留                       |

> 注：费率阶梯只在 Mature Withdraw 时适用；Early Exit 一律走 penalty。

### 6.2 奖励速率控制

* **模式**：线性释放（rate/sec），受 `periodFinish` 截断。
* **更新原则**：任何修改速率之前必须先 `_updateGlobalX()`，防止旧周期奖励错账。
* **溢出保护**（必须）：

  * `require(rewardRateX <= type(uint256).max / PRECISION / 1 days)`

---

## 7. 暂停与紧急提款 (Security Matrix)

### 7.1 期间关系说明

* **暂停 (Pause)**：Operator 权限

  * 禁止：`stakeA/stakeB/compound`
  * 允许：`withdrawA/withdrawB/claim`（释放挤兑压力）
  * 奖励语义：**暂停期间仍允许 claim 已确权 pending**；并通过 “时间平移” 保护奖励周期不爆发。
* **紧急模式 (Emergency Mode)**：Admin 权限

  * 禁止一切收益路径：`stake/compound/claim/notify`
  * 只允许：`emergencyWithdrawA/B`（0费率秒提本金）
  * 后果：用户奖励永久放弃（rewards 清零、pending 对应核减）

### 7.2 Pause/Unpause 时间平移

* `pause()`：

  1. `_updateGlobalA(); _updateGlobalB();`
  2. `paused = true; pausedAt = now;`
* `unpause()`：

  1. `require(paused)`
  2. `delta = now - pausedAt`
  3. `periodFinishA += delta; periodFinishB += delta`
  4. `lastUpdateTimeA = now; lastUpdateTimeB = now`
  5. `paused = false; pausedAt = 0`

### 7.3 EmergencyWithdraw（本金优先）

* 仅在 `paused==true` 或 `emergencyMode==true` 时允许（可二选一策略，建议 emergencyMode 才允许）
* 跳过收益结算：

  1. `amount = userStakedX[user]`
  2. `userStakedX[user]=0; totalStakedX -= amount`
  3. 清理收益并核减 pending（防坏账）：

     * `rA=rewardsA[user]; rB=rewardsB[user]; rewardsA=0; rewardsB=0`
     * `totalPendingA = max(totalPendingA - rA, 0)`（实现上建议直接 require 足够再减；若坏账则允许绕过）
  4. 退还本金 `amount`（0费率）
* **注意**：紧急提款允许绕过 `_assertInvariantB()`，避免坏账阻塞用户提币。

---

## 8. 事件系统 (Events)
* `event Staked(address indexed user, uint256 amount, uint256 newUnlockTime, string poolType)`
* `event Withdrawn(address indexed user, uint256 amount, uint256 feeOrPenalty, bool isEarly, string poolType)`
* `event Claimed(address indexed user, uint256 paidA, uint256 paidB, uint256 timestamp)`
* `event Compounded(address indexed user, uint256 amountA, uint256 amountB, uint256 newUnlockTimeB)`
* `event RewardRateUpdated(uint8 poolType, uint256 newRate, uint256 periodFinish)`
* `event Paused(address indexed by, uint256 at)`
* `event Unpaused(address indexed by, uint256 at)`
* `event EmergencyToggled(bool enabled)`
* `event PenaltyApplied(address indexed user, uint256 principalLoss, uint256 rewardReturnedA, uint256 rewardReturnedB)`

---

## 9. 业务边界场景 (Edge Case Analysis)

### 9.1 空池与首笔注入

* 若 `totalStakedX == 0`：

  * `_updateGlobalX()` 不释放 `availableRewardsX`
  * 只更新时间锚点 `lastUpdateTimeX`
* 结论：空池期间不会发生“首笔用户吃掉空窗奖励”的暴利问题。

### 9.2 巨鲸到期瞬间加仓套利

* rolling lock 会将 unlockTime 推近 `now + lockDuration`
* 结论：到期前加仓会显著延长解锁，套利成本显著增加。

### 9.3 复利后的本金隔离

* compound 只增加 B池本金、刷新 B池 unlockTime/stakeTimestamp
* A池 unlockTime 不受影响
* 结论：A池本金可按自身规则退出，B池复利资产独立锁定。

### 9.4 暂停 + 紧急叠加

* 暂停允许 Claim/Withdraw
* 紧急模式只允许本金秒提并放弃收益
* 结论：在发现漏洞时可快速“切断收益路径”，保护本金优先。

---
