# ERC20 (Staking) 协议需求规格说明书 v1.0

## 1. 文档概览

### 1.1 架构概述

本协议实现一个**平行双池（Parallel Dual-Pool）复合奖励质押系统**：

* **Pool A（基础池）**：质押 TokenA → 产出 TokenB 奖励。
* **Pool B（收益池）**：质押 TokenB → 产出 TokenB 奖励（复利池）。
* **核心记账模型**：采用**负债累积模型（Liability Accumulation Model）**，通过全局指数 `accRewardPerToken` 与用户快照实现收益线性确权。
* **时间加权算法**：引入 **WADP (Weighted Average Deposit Period)**，通过时间加权平均值更新持仓起点，防止恶意稀释费率。
* **放大因子**：固定为 `PRECISION = 1e18`，所有涉及奖励分布的中间计算强制执行“先乘后除”。

### 1.2 核心设计原则

| 原则 | 说明 |
| --- | --- |
| **CEI 优先** | 严格遵循“检查-效果-交互”顺序（支持 FOT 代币的特定函数除外，详见具体声明）；所有外部 Token 转账必须在合约状态变量写入之后执行。 |
| **非重入保护** | 所有涉及资产变动或状态修改的外部调用函数，强制加载 `nonReentrant` 装饰器。 |
| **单一不变量** | **TokenB 余额不变量** 是资产安全的唯一真理，物理余额必须时刻覆盖账面债务总额。 |
| **最小权限** | 遵循最小特权原则。治理性操作（调拨、费率、升级）强制要求 **Timelock (≥48h)**。 |
| **安全降级与响应分离** | 阻断性操作（暂停、开启紧急模式）**0h 延迟**；恢复性操作（取消模式、提取资产）**≥48h 延迟**。 |
| **不变量弹性豁免** | `_assertInvariantB()` 在 Normal 模式失败时必 revert；在 **EmergencyWithdraw** 路径下仅警告不回滚。 |
| **WADP 防套利** | 任何追加质押行为必须通过时间加权算法重算持仓起点，严禁通过 1 wei 追加重置费率阶梯。 |
| **TVL 校验完整性** | 所有 Stake 操作的 Cap 检查必须包含 **“真实入账的拟新增量”**，防范闪电贷瞬时攻击与 FOT 额度虚占。 |
| **空池重锚** | 当池子为空时奖励不释放，首位质押者进入时根据剩余预算重新锚定 `rewardRate`。 |

### 1.3 文档范围

本文档覆盖：角色与权限、资产隔离（TokenB 会计不变量）、状态变量、数学公式（WADP 与重锚）、详细功能需求（Stake/Withdraw/Compound/Emergency）、奖励通知与预算调拨、手续费阶梯、安全矩阵、事件系统、边界场景剖析。

**不覆盖**：前端实现、链下 Keeper 调度、多链部署差异。

---

## 2. 项目范围与角色定义

### 2.1 角色与权限模型

| 角色 | 获取方式 | 核心权限 | 响应要求 (Timelock) |
| --- | --- | --- | --- |
| **Owner** | 部署时设定 | 转让所有权、设置 Admin | 72h（针对代码升级） |
| **Admin** | Owner 指定 | 风险参数设置、`recoverToken`、`rebalanceBudgets` | ≥48h |
| **Operator** | Admin 授权 | **立即 pause/enableEmergencyMode**、`notifyRewardAmount` | **0h (防御性操作)** / 24h (参数类) |
| **User** | 任意地址 | stake/withdraw/claim/compound/emergencyWithdraw | — |

> **关键操作 Timelock 要求**
> * **0h (立即生效)**: `pause()`、`enableEmergencyMode()`、`setMinStake()`。
> * **≥48h (时间锁)**: `setFees`、`setLockDuration`、`shutdown`、`recoverToken(TokenB)`、`rebalanceBudgets`。
> * **≥72h (时间锁)**: `upgradeImplementation` (逻辑升级)。
> 
> 

### 2.2 资产隔离与 TokenB 不变量

**物理隔离与 ERC777 防御基线（强制）**

> **安全预警**：由于 `!isContract` 校验会误杀多签钱包和账户抽象（AA），系统采用**部署期白名单**策略。在合约部署时，管理员必须确保传入的 TokenA 实现中**绝对不包含** `tokensReceived` 等 ERC777 钩子，从源头上斩断绕过 CEI 造成重入的可能。

```solidity
require(address(stakingTokenA) != address(rewardTokenB), "A_EQ_B");
require(rewardTokenB.decimals() == 18, "TOKEN_B_MUST_BE_18_DECIMALS");

```

**TokenB 会计不变量**

为了确保系统在任何极端模式下（包括产生坏账时）逻辑可控，公式必须引入 `BadDebt` 作为账目平衡调节项：

$$BalanceB + BadDebt_{A} + BadDebt_{B} + DUST\_TOLERANCE \ge TotalStakedB + TotalPending_{A+B} + AvailableRewards_{A+B} + UnclaimedFeesB$$

> **`_assertInvariantB()` 行为规范（必须）**
> 校验失败时强制回滚，但在 **EmergencyWithdraw** 路径下豁免。
> ```solidity
> function _assertInvariantB() internal view {
>     // 缓存 balance 以节省后续加法中的多次 SLOAD Gas 开销
>     uint256 balanceB = rewardTokenB.balanceOf(address(this));
>     
>     // actual 包含物理余额与已记录的坏账对冲额
>     uint256 actual = balanceB + badDebtA + badDebtB;
>     uint256 required = totalStakedB + totalPendingA + totalPendingB
>                       + availableRewardsA + availableRewardsB + unclaimedFeesB;
>     if (actual + DUST_TOLERANCE < required) {
>         emit InvariantViolated(actual, required, block.timestamp);
>         revert InvariantViolation(actual, required);
>     }
> }
> 
> ```
> 
> 
> **生产环境安全约定 (Gas 设计)**：该函数必须在所有涉及状态变更的外部函数末尾强制调用。`_assertInvariantB()` 仅包含 O(1) storage read，不涉及循环或复杂计算，Gas 开销通常 < 2000。**严禁**在 Production 环境中为了极致优化 Gas 而尝试移除该校验，它是拦截未知重入与逻辑破坏的最后物理防线。

**罚金路由与奖励没收（闭环逻辑）**

* **WithdrawA (TokenA 罚金)**: 转至外部 `forfeitedRecipient`。
* **WithdrawA (没收奖励 TokenB)**: 核减 `totalPendingA`，增加 `availableRewardsB`。
* > **经济模型声明 (Cross-pool Routing)**: Pool A 没收的奖励被刻意重定向至 Pool B（`availableRewardsB`），旨在将短视资金的流失转化为对长期复投者（Pool B）的长期激励，形成经济闭环。




* **WithdrawB (TokenB 罚金 & 没收奖励)**:
* 罚金留在合约内，增加 `availableRewardsB`。
* 没收奖励从 `totalPendingB` 转移至 `availableRewardsB`。
* **结果**: `balanceOf(this)` 无变动，不变量自动维持。



**不变量各项含义**

| 变量 | 含义 | 备注 |
| --- | --- | --- |
| `totalStakedB` | Pool B 全部质押本金之和 | TokenB |
| `totalPendingA/B` | 已确权但未支付奖励负债 | TokenB |
| `availableRewardsB` | 合约内所有可用奖励预算 | 含：外部注资 + 罚金回流 + 奖励没收回流 |
| `badDebtA/B` | 确权时产生的逻辑缺口 | 用于平配公式，防止系统因余额不足锁死 |
| `unclaimedFeesB` | 已产生但未提取的 Mature 提现手续费 | 提取后公式右侧同步减少 |

**recoverToken 受限规则（坏账敏感型）**

> 在系统存在坏账（`badDebt > 0`）时，严禁回收任何 TokenB，必须先通过 `resolveBadDebt` 补齐缺口。

```solidity
// TokenB：仅允许回收超额部分，且必须在 badDebt 清零前提下
require(badDebtA == 0 && badDebtB == 0, "BAD_DEBT_EXISTS");
uint256 requiredB = totalStakedB + totalPendingA + totalPendingB
                   + availableRewardsA + availableRewardsB + unclaimedFeesB;
uint256 balanceB  = rewardTokenB.balanceOf(address(this));
require(balanceB > requiredB, "NO_EXCESS_TOKEN_B");

```

---

## 3. 全量状态变量与映射定义

### 3.1 核心资产与常量

| 常量名 | 类型 | 值 | 说明 |
| --- | --- | --- | --- |
| `PRECISION` | uint256 | 1e18 | 定点数放大因子 |
| `BASIS_POINTS` | uint256 | **10000** | 费率基数（1 BP = 0.01%），必须显式声明 |
| `MAX_EARLY_EXIT_PENALTY_BP` | uint256 | 2000 | 提前退出罚金上限（20%） |
| `MAX_WITHDRAW_BP` | uint256 | 500 | 到期提现费上限（5%） |
| `MAX_MIDTERM_BP` | uint256 | 500 | 中期提现费上限（5%） |
| `MAX_LOCK_DURATION` | uint256 | 90 days | 锁定期上限 |
| `MAX_DELTA_TIME` | uint256 | 30 days | 单次时间差上限，防溢出 |
| `MAX_DURATION` | uint256 | **365 days** | `notifyRewardAmount` 周期上限 |
| `MIN_REWARD_RATE_DURATION` | uint256 | **1 days** | `notifyRewardAmount` 周期下限 |
| `MAX_REWARD_RATE_A / B` | uint256 | Immutable | 部署时通过 maxTotalSupplyB 传入计算 |
| `MAX_MIN_CLAIM_AMOUNT` | uint256 | 1e17 wei | `minClaimAmount` setter 上限 |
| `DUST_TOLERANCE` | uint256 | 10 wei | 不变量容忍的最大舍入误差，不可修改 |
| `UNPAUSE_COOLDOWN` | uint256 | **24 hours** | 解除暂停的最短冷却期（immutable） |
| `SECONDS_PER_YEAR` | uint256 | **31536000** | 常量 |
| `MAX_APR_BP` | uint256 | 20000 | 200%，用于推导速率上限（immutable） |

> **UNPAUSE_COOLDOWN 与 BASIS_POINTS 声明规范**
> 必须作为 `immutable` 或 `constant` 声明在合约顶部。禁止设为可修改的系统参数，防止管理员绕过安全窗口或计算精度偏差 10x。

**Token Decimals 规范（强制要求 18位）**

构造函数必须校验 TokenB 精度，防止因精度不一致导致的不变量雪崩：

```solidity
require(rewardTokenB.decimals() == 18, "TOKEN_B_MUST_BE_18_DECIMALS");

```

对于 TokenA，支持任意精度，入账金额不经 PRECISION 换算，直接记入本金。

**Pool 枚举类型**

```solidity
enum Pool { A, B } // 使用 enum 替代 string 节省 Gas

```

**核心布尔状态及全局控制变量声明**

```solidity
bool public paused;                // 暂停标志，可经冷却后 unpause
bool public emergencyMode;         // 紧急模式标志，单向不可逆
bool public shutdownMode;          // 停机模式标志，单向不可逆
uint256 public pausedAt;           // 最近一次 pause 时间戳
uint256 public unpauseAt;          // 最早允许 unpause 的时间戳
uint256 public shutdownAt;         // 停机时间戳
uint256 public badDebtA;           // Pool A 坏账缺口
uint256 public badDebtB;           // Pool B 坏账缺口
uint256 public minClaimAmount = 1e15; // 最小领取量防攻击，初始缺省 1e15 wei Admin 可通过 setMinClaimAmount 调整，上限 MAX_MIN_CLAIM_AMOUNT
address public forfeitedRecipient; // 仅接收 TokenA 类型本金罚金的地址

```

### 3.2 收益分发控制（Global Reward States）

| 变量名 | 类型 | 含义 | 单位 |
| --- | --- | --- | --- |
| `rewardRateA / B` | uint256 | 每秒释放奖励速率 | weiB/sec |
| `periodFinishA / B` | uint256 | 奖励周期结束时间 | timestamp |
| `lastUpdateTimeA / B` | uint256 | 上次全局结算锚点 | timestamp |
| `accRewardPerTokenA / B` | uint256 | 全局每单位累计收益指数（× PRECISION） | — |
| `totalStakedA / B` | uint256 | 全池质押总量 | weiA / weiB |
| `availableRewardsA / B` | uint256 | 未释放奖励预算（B 池含没收奖励及罚金） | weiB |
| `totalPendingA / B` | uint256 | 已释放且确权但未支付的奖励负债 | weiB |
| `unclaimedFeesB` | uint256 | **已收取但未被管理员提取的提现手续费** | weiB |
| `dustA / dustB` | uint256 | 每次结算累积的除法截断粉尘，按池严格物理隔离防溢出 | weiB |

> **⚠️ 实现警告（Critical）**：
> 开发者在实现对应的 `_updateGlobalX()` 函数时，**切勿将逻辑碎片化**。必须以 **§4.1** 中提供的统一代码块为准（包含提前 return 防除零、坏账映射、粉尘还原回收等），以保证时序的安全性和会计一致性。

### 3.3 用户账本映射

| 映射名 | 类型 | 含义 |
| --- | --- | --- |
| `userStakedA / userStakedB[user]` | mapping(address => uint256) | 用户本金余额 |
| `rewardsA / rewardsB[user]` | mapping(address => uint256) | 已确权未领收益 |
| `userRewardPaidA / userRewardPaidB[user]` | mapping(address => uint256) | 收益指数快照 |
| `unlockTimeA / unlockTimeB[user]` | mapping(address => uint256) | 滚动解锁截止时间 |
| `stakeTimestampA / stakeTimestampB[user]` | mapping(address => uint256) | **WADP 时间加权持仓起点** |
| `lastClaimTime[user]` | mapping(address => uint256) | 上次 Claim/Compound 时间 |

> **WADP (时间加权平均) 机制（核心防套利设计）**
> 严禁在每次追加质押（Stake/Compound）时将 `stakeTimestamp` 粗暴重置为 `block.timestamp`，否则将严重惩罚长期持有者的复投行为。必须按资金量进行时间加权：
> **WADP 公式**：
> 
> $$T_{new} = \frac{(Staked_{old} \times T_{old}) + (Amount_{new} \times Now)}{Staked_{old} + Amount_{new}}$$
> 
> 

### 3.4 费率与边界配置

| 变量名 | 类型 | 含义 | 默认值 / 约束 |
| --- | --- | --- | --- |
| `lockDuration` | uint256 | 基础锁定期 | 7 days（Max 90 days） |
| `penaltyFeeBP` | uint256 | Early Exit 罚金（BP） | 1000（Max 2000） |
| `withdrawFeeBP` | uint256 | 短期到期手续费（BP） | 100（Max 500） |
| `midTermFeeBP` | uint256 | 中期到期手续费（BP） | 50（Max 500） |
| `minStakeAmountA / B` | uint256 | 最小质押量 | 防粉尘攻击 |
| `maxTVLCapA / B` | uint256 | TVL 上限 | 0=无限 |
| `claimCooldown` | uint256 | Claim/Compound 冷却 | 24h |
| `feeRecipient` | address | 提现手续费接收地址 | Admin 设定，≥48h Timelock |
| `minEarlyExitAmountA / B` | uint256 | 最小提前退出量 | 须满足计算罚金 $\ge 1 \text{ wei}$ |
| `forfeitedRecipient` | address | TokenA 罚金接收地址 | Admin 设定，≥48h Timelock |

> **minEarlyExitAmountX 最小值除零约束（安全基线）**
> 为防止提现 1 wei 时导致罚金因整除被截断为 0，系统设置函数必须强制校验：
> ```solidity
> // 如果罚金率大于 0，最小退出额产生的罚金必须大于等于 1 wei
> if (penaltyFeeBP > 0) {
>     require(newMinExitAmount * penaltyFeeBP / BASIS_POINTS >= 1, "PENALTY_TOO_SMALL");
> }
> 
> ```
> 
> 

---

## 4. 核心数学公式

### 4.1 全局收益累积指数：统一实现规范 (The Engine)

为了防止逻辑割裂导致的“空池除零（Division by Zero）”或“执行顺序混乱”问题，全局更新引擎 `_updateGlobalX()` 必须严格遵循以下合并后的单段式伪代码实现：

```solidity
function _updateGlobalX() internal {
    // 1. 获取有效时间窗口
    uint256 tApplicable = Math.min(block.timestamp, periodFinishX);
    
    // 2. 空池拦截 (Critical)：防止除零崩溃与无效预算消耗
    if (totalStakedX == 0) {
        lastUpdateTimeX = tApplicable;
        return; // 必须在此提前退出！
    }
    
    // 3. 计算本期应发奖励
    // 溢出防护说明：deltaTime ≤ MAX_DELTA_TIME，rewardRateX ≤ MAX_REWARD_RATE_X
    // 合理区间内的乘积远小于 uint256.max，因此绝对安全。
    uint256 deltaTimeRaw = tApplicable - lastUpdateTimeX;
    uint256 deltaTime = Math.min(deltaTimeRaw, MAX_DELTA_TIME);
    uint256 deltaRewardX = rewardRateX * deltaTime;

    // 4. 预算核销与坏账记录
    if (availableRewardsX >= deltaRewardX) {
        availableRewardsX -= deltaRewardX;
        totalPendingX += deltaRewardX;
    } else {
        // 【核心修复】计算真实 shortfall 时必须快照现有 availableRewards，因为赋值为 0 后该值将丢失
        uint256 shortfall = deltaRewardX - availableRewardsX;
        totalPendingX += availableRewardsX;  
        badDebtX += shortfall;               
        availableRewardsX = 0;
        emit InsufficientBudget(Pool.X, shortfall, block.timestamp);
    }

    // 5. 粉尘（舍入误差）安全回收与噪音控制
    // 采用 Solidity 原生 mulmod 防止在截断计算中发生极大数溢出
    // 【核心修复】由于 mulmod 结果位于 PRECISION 放大域内，必须除以 PRECISION 还原为真实的 Wei 数量，
    // 否则 dustX 会虚高 1e18 倍，导致错误的粉尘回收。
    uint256 remainder = mulmod(deltaRewardX, PRECISION, totalStakedX);
    uint256 truncatedWei = remainder / PRECISION;
    dustX += truncatedWei;
    
    // dustX 是 Wei 级别，采用 DUST_TOLERANCE 为起回收线，防止虚高条件锁死粉尘
    if (dustX >= DUST_TOLERANCE) {
        availableRewardsX += dustX; // 积少成多，反哺回本池预算
        dustX = 0; 
        // 优化：当 dust 被整笔回流至预算时，不再单独触发 DustAccumulated，旨在减少链上事件噪音
    } else if (truncatedWei > 0) {
        emit DustAccumulated(Pool.X, dustX, block.timestamp);
    }

    // 6. 全局指数安全累加与时间推进
    accRewardPerTokenX += Math.mulDiv(deltaRewardX, PRECISION, totalStakedX);
    // 【核心修复】必须增加实际被计算的 deltaTime，而非暴力重置为 tApplicable。
    // 这防止了当休眠时间超过 MAX_DELTA_TIME 截断后，中间的未结算时间锚点凭空蒸发。
    lastUpdateTimeX += deltaTime; 
}

```

> **补充机制：空池重锚 (Re-anchor)**
> 当 `totalStakedX` 从 `0` 变为 `> 0` 时（首个用户入场），由于此前 `_updateGlobalX` 执行了拦截并返回，不会结算历史时间。因此在用户**完成本金入账后**，系统必须立即重锚真实速率，防止 APR 被闲置期稀释。此逻辑应内嵌于 `stake` 和 `compound` 函数中（见 §5）。

### 4.2 用户奖励结算 _settleUserX(user)

**状态更新顺序强制约束（High · 必须）**

所有修改 `userStakedX / totalStakedX` 的入口函数必须严格按以下顺序执行，禁止乱序：

```text
①  _updateGlobalX()          // 固化全局指数与全局负债至当前时刻
②  _settleUserX(user)        // 用旧本金快照计算历史收益，写入 rewardsX[user]
③  [所有 require 校验]       // 参数、余额、状态机检查
④  更新快照                  // userRewardPaidX[user] = accRewardPerTokenX (Fail-safe)
⑤  修改本金账本              // userStakedX += / -= ; totalStakedX += / -=
⑥  执行外部转账              // ERC20 safeTransfer / safeTransferFrom
⑦  _assertInvariantB()       // 终末不变量校验

```

> **禁止行为**：绝不允许先修改本金（步骤⑤），再调用 `_settleUserX(user)`。否则新本金将无端参与历史奖励的瓜分，导致“无中生有”的双重奖励攻击。

**_settleUserX 内部实现**

```solidity
function _settleUserX(address user) internal {
    // 此时 accRewardPerTokenX 已由 _updateGlobalX() 更新至最新
    uint256 earned = Math.mulDiv(
        userStakedX[user],
        accRewardPerTokenX - userRewardPaidX[user],
        PRECISION
    );
    if (earned > 0) {
        // 仅修改个人账本，严禁再累加全局 totalPendingX 造成复算
        rewardsX[user] += earned; 
    }
    // 【核心优化】为了节省一次 SSTORE 的 Gas 操作，移除对 userRewardPaidX[user] 的内部重写。
    // 该快照变量交由外层操作 (Stake/Withdraw/Compound) 在合适的生命周期内统一固化。
}

```

### 4.3 Rolling Lock 算法 (大值覆盖法)

每次操作（Stake/Compound）仅允许维持或向后推延解锁时间，绝对禁止缩短：

```solidity
function _updateRollingLock(uint256 oldUnlockTime, uint256 lockDuration) internal view returns (uint256) {
    uint256 newUnlockFromNow = block.timestamp + lockDuration;
    return oldUnlockTime > newUnlockFromNow ? oldUnlockTime : newUnlockFromNow;
}

```

*注：`lockDuration` 变量的治理修改仅对未来的操作生效，对已存在的 `unlockTime` 不具有追溯力。*

### 4.4 WADP 时间加权平均算法（核心防套利）

**设计边界声明：WADP 与 Rolling Lock 的刻意脱钩**

* **Rolling Lock (`unlockTime`)**：防止资金外逃。采用大值覆盖，追加质押必须全额重新锁定 90 天。
* **WADP (`stakeTimestamp`)**：防止费率套利。采用加权平滑，追加质押的提现费率进度按资金比例部分倒退。在 `CompoundB` 发生时，解锁期被强制重置，但费率仅受微弱惩罚（Fee ladder != Lock duration）。

```solidity
function _updateWADP(
    uint256 oldStaked,
    uint256 oldTimestamp,
    uint256 addedAmount
) internal view returns (uint256) {
    if (oldStaked == 0) return block.timestamp;
    if (addedAmount == 0) return oldTimestamp;

    // 常规乘法在 uint256 (上界达 1e77) 的充足空间下已绝对安全。
    // 移除不必要的 Math.mulDiv 调用，节省 Gas 消耗。
    uint256 weightedOld = oldStaked * oldTimestamp;
    uint256 weightedNew = addedAmount * block.timestamp;

    return (weightedOld + weightedNew) / (oldStaked + addedAmount);
}

```

---

## 5. 详细功能需求

### 5.1 StakeA（质押 TokenA）/ StakeB（质押 TokenB）

**前置条件**

```solidity
require(!paused && !emergencyMode && !shutdownMode, "WRONG_STATE");
require(amount >= minStakeAmountX, "BELOW_MIN_STAKE");
// 移除旧版的粗暴 Cap 检查，移至后方处理真实入账

```

**执行步骤（严格顺序）**

1. `_updateGlobalX()` + `_settleUserX(user)` — 固化历史收益。
2. 快照空池状态：`bool isFirstDeposit = (totalStakedX == 0); // 明确：此处判断的是 totalStakedX_before`
3. FOT 净入账防御与 Cap 检查：
```solidity
uint256 balBefore = stakingTokenX.balanceOf(address(this));
stakingTokenX.safeTransferFrom(msg.sender, address(this), amount);
uint256 received = stakingTokenX.balanceOf(address(this)) - balBefore;
require(received > 0, "ZERO_RECEIVED");

// 【安全基线】启用 FOT 最大滑点保护，防止恶意代币极高税率（如 99%）导致 UX 灾难
require(received * 100 >= amount * 90, "EXCESSIVE_FEE");

// 【核心修复】必须使用真实入账金额 received 进行 Cap 检查，防止 FOT 扣税导致提前爆表
require(maxTVLCapX == 0 || totalStakedX + received <= maxTVLCapX, "CAP_EXCEEDED");

```


4. **WADP 更新**：`stakeTimestampX[user] = _updateWADP(userStakedX[user], stakeTimestampX[user], received)`
5. **更新快照 (Fail-safe)**：`userRewardPaidX[user] = accRewardPerTokenX`
6. **修改本金**：`userStakedX[user] += received; totalStakedX += received`
7. **Rolling Lock**：`unlockTimeX[user] = _updateRollingLock(unlockTimeX[user], lockDuration)`
8. **触发重锚机制 (Re-anchor)**：
```solidity
uint256 remainingTime = periodFinishX > block.timestamp ? periodFinishX - block.timestamp : 0;
if (isFirstDeposit && remainingTime > 0) {
    rewardRateX = availableRewardsX / remainingTime;
}

```


9. **终检与事件**：`_assertInvariantB()`; emit `Staked(...)`

### 5.2 CompoundB（复投：Pool A/B 奖励 → Pool B 本金）

**完整步骤顺序（Critical · 必须）**

```text
步骤 1：状态与冷却校验
  require(!paused && !emergencyMode && !shutdownMode)
  require(block.timestamp >= lastClaimTime[user] + claimCooldown)
  require(badDebtA == 0 && badDebtB == 0, "BAD_DEBT_EXISTS")  // 坏账期禁止 compound

步骤 2：全局状态更新（必须在本金变更前）
  _updateGlobalA()
  _updateGlobalB()

步骤 3：用户收益结算（settle 在本金变更前）
  _settleUserA(user)
  _settleUserB(user)

步骤 4：读取并原子清零（先清零防重入语义）
  rA = rewardsA[user]; rB = rewardsB[user]
  require(rA + rB > 0)
  rewardsA[user] = 0; rewardsB[user] = 0

步骤 5：负债可用性校验（Critical）
  require(totalPendingA >= rA, "INSUFFICIENT_PENDING_A")
  require(totalPendingB >= rB, "INSUFFICIENT_PENDING_B")

步骤 6：核销负债（effects 先于 transfer）
  totalPendingA -= rA
  totalPendingB -= rB

步骤 7：更新 rewardDebt 快照 (Fail-safe 强拦截)
  // 【核心修复】必须在增加本金前更新 A/B 两池快照！
  // 防止如果未来 _settleUserX 逻辑变更，导致新复投的本金错误地瓜分历史产生的奖励。
  userRewardPaidA[user] = accRewardPerTokenA 
  userRewardPaidB[user] = accRewardPerTokenB 

步骤 8：结转本金 (UX 优化：豁免外部 Cap 限制)
  // 说明：此豁免仅适用于由已确权奖励转化而来的内部复利，绝不适用于任何外部 stakeB 转入行为。
  // 旨在防止池子接近饱满时直接卡死用户的自动复投。
  bool wasEmptyB = (totalStakedB == 0); // [优化] 快照 B 池初始状态，用于后续重锚判断
  userStakedB_before = userStakedB[user]
  userStakedB[user] += (rA + rB)
  totalStakedB += (rA + rB)

步骤 9：Rolling Lock B 与 WADP 更新（A池时间严禁修改）
  unlockTimeB[user] = _updateRollingLock(unlockTimeB[user], lockDuration)
  stakeTimestampB[user] = _updateWADP(userStakedB_before, stakeTimestampB[user], rA + rB)

步骤 10：判断空池重锚 (安全拦截除零)
  uint256 remTime = periodFinishB > block.timestamp ? periodFinishB - block.timestamp : 0;
  if (wasEmptyB && remTime > 0) {
      rewardRateB = availableRewardsB / remTime;
  }

步骤 11：更新冷却与终检
  lastClaimTime[user] = block.timestamp
  _assertInvariantB()
  emit Compounded(user, rA, rB, userStakedB[user], unlockTimeB[user])

```

### 5.3 WithdrawA / WithdrawB（提款）

#### 5.3.1 WithdrawA 状态检查

```solidity
// 完整状态机检查，顺序不可交换
require(!paused, "PAUSED");
require(!emergencyMode || shutdownMode, "EMERGENCY_MODE: use emergencyWithdraw");
require(amount > 0 && amount <= userStakedA[user], "INVALID_AMOUNT");

// Early Exit 量的下限校验
if (block.timestamp < unlockTimeA[user]) {
    require(amount >= minEarlyExitAmountA, "BELOW_MIN_EARLY_EXIT_A");
}

```

#### 5.3.2 Early Exit Pool B (会计闭环)

```solidity
// 前置状态检查同上...
require(amount >= minEarlyExitAmountB, "BELOW_MIN_EARLY_EXIT_B");

// 步骤 1：结算 B 池收益
_updateGlobalB(); _settleUserB(user);

// 步骤 2：清零与核销负债
uint256 rB = rewardsB[user];
rewardsB[user] = 0;
require(totalPendingB >= rB, "BAD_DEBT_B");
totalPendingB -= rB;

// 步骤 3：没收的奖励路由至 availableRewardsB（维持不变量，不对外转账）
availableRewardsB += rB;  

// 步骤 4：罚金计算与路由（留在合约，不对外转账）
uint256 penalty = amount * penaltyFeeBP / BASIS_POINTS;
availableRewardsB += penalty;  

// 步骤 5：强固化债务快照 (Fail-safe)
userRewardPaidB[user] = accRewardPerTokenB;

// 步骤 6：扣减本金与净额转账
uint256 net = amount - penalty;
userStakedB[user] -= amount;
totalStakedB -= amount;

// 步骤 7：执行转账与不变量终检
rewardTokenB.safeTransfer(user, net);
_assertInvariantB();
emit Withdrawn(user, amount, penalty, true, Pool.B);  

```

> **注意**：WithdrawA Early Exit 的本金罚金（TokenA）仍可对外转给 `forfeitedRecipient`，因为 TokenA 不参与 TokenB 不变量；WithdrawA 没收的奖励（TokenB）统一路由至 `availableRewardsB`。

#### 5.3.3 Mature Withdraw 费率阶梯 (费用留存账本)

```solidity
// 步骤 1：必须先结算全局与个人收益，防止奖励丢失 (Critical)
_updateGlobalX(); 
_settleUserX(user);

// 步骤 2：费率匹配与持仓时长计算
uint256 holdingDuration = block.timestamp - stakeTimestampX[user];
// 费率匹配: < 90d (withdrawFeeBP) | 90-180d (midTermFeeBP) | >= 180d (0%)
uint256 fee = amount * currentFeeBP / BASIS_POINTS;
uint256 net = amount - fee;

// 步骤 3：手续费路由
// 手续费不直接对外转账，TokenB 必须进入系统账本，节省用户 Gas
if (fee > 0) {
    if (pool == Pool.A) {
        stakingTokenA.safeTransfer(feeRecipient, fee); // TokenA 依然外转
    } else {
        unclaimedFeesB += fee; // TokenB 截留在合约，待 Admin 提取
    }
}

// 步骤 4：强固化快照并在后扣减本金 (Fail-safe)
userRewardPaidX[user] = accRewardPerTokenX; 
userStakedX[user] -= amount;
totalStakedX -= amount;

// 步骤 5：执行转账与终检 (Critical: 涉及不变量变化的物理出口必须校验)
tokenX.safeTransfer(user, net); 
if (pool == Pool.B) {
    _assertInvariantB();
}
emit Withdrawn(user, amount, fee, false, pool);

```

### 5.4 ClaimReward 与 forceClaimAll

**标准 claim()：刚性兑付**

```solidity
require(!paused, "PAUSED");
require(!emergencyMode || shutdownMode, "EMERGENCY_MODE");
require(block.timestamp >= lastClaimTime[msg.sender] + claimCooldown, "COOLDOWN");
// 结算后...
require(badDebtA == 0 && badDebtB == 0, "BAD_DEBT_EXISTS"); // 拒绝物理坏账支付
uint256 totalToPay = payA + payB;
require(totalToPay >= minClaimAmount, "BELOW_MIN_CLAIM"); 

```

**forceClaimAll()：坏账逃生舱与粉尘清扫**

> **UX 指引**：`forceClaimAll` 豁免了 `minClaimAmount` 限制。为了防止正常用户误触折损条件，系统强制设置了其调用前提。前端层面仅推荐在系统出现物理坏账 (`badDebt > 0`) 或是彻底提款离场时引导用户使用此接口。

```solidity
function forceClaimAll() external nonReentrant {
    require(!paused, "PAUSED");
    require(!emergencyMode || shutdownMode, "EMERGENCY_MODE");
    require(block.timestamp >= lastClaimTime[msg.sender] + claimCooldown, "COOLDOWN");
    
    // 作为逃生舱，额外置入安全阀拦截正常状态下的恶意误触，防止用户少拿钱
    require(rA + rB >= minClaimAmount || badDebtA > 0 || badDebtB > 0 || shutdownMode, "USE_STANDARD_CLAIM");

    _updateGlobalA(); _updateGlobalB();
    _settleUserA(msg.sender); _settleUserB(msg.sender);
    
    uint256 rA = rewardsA[msg.sender];
    uint256 rB = rewardsB[msg.sender];
    require(rA + rB > 0, "NOTHING_TO_CLAIM");
    
    // 【核心修复】：精准扣除受保护的“硬性锁定资金”（本金+未提手续费）
    // 防止极端坏账时 forceClaimAll 穿透并吃掉其他 Pool B 用户的本金
    uint256 balanceB = rewardTokenB.balanceOf(address(this));
    uint256 lockedB = totalStakedB + unclaimedFeesB;
    uint256 remain = balanceB > lockedB ? balanceB - lockedB : 0;
    
    uint256 payA = Math.min(rA, remain);
    remain -= payA;
    uint256 payB = Math.min(rB, remain); 

    // 计算用户自愿放弃（未偿还）的债务额度
    uint256 unpaidA = rA - payA;
    uint256 unpaidB = rB - payB;

    rewardsA[msg.sender] = 0; totalPendingA -= rA; // 逻辑负债按原额全额核销
    rewardsB[msg.sender] = 0; totalPendingB -= rB;
    lastClaimTime[msg.sender] = block.timestamp;
    
    // 【会计平衡核心】
    // 维持不变量平衡：用户少拿了钱，代表系统整体债务缩减，相应的历史坏账也必须等额核销
    // 采用精准的最小值对冲计算，防止出现 underflow 或无意义消耗 gas 的 0 减操作
    uint256 reduceA = Math.min(unpaidA, badDebtA);
    uint256 reduceB = Math.min(unpaidB, badDebtB);
    if (reduceA > 0) badDebtA -= reduceA;
    if (reduceB > 0) badDebtB -= reduceB;

    // 【UX优化】粉尘清扫：如果 unpaid 超过了当前记录的 badDebt（极少见的残余死账）
    // 必须将其注入 dust 变量以维持会计等式绝对平衡，防止永远死锁在系统内。
    uint256 dustSweepA = unpaidA - reduceA;
    uint256 dustSweepB = unpaidB - reduceB;
    if (dustSweepA > 0) dustA += dustSweepA;
    if (dustSweepB > 0) dustB += dustSweepB;

    rewardTokenB.safeTransfer(msg.sender, payA + payB);
    _assertInvariantB();
    
    // 触发带有完整 unpaid 记录的事件，便于索引器与前端绘制坏账图表
    emit ForceClaimed(msg.sender, payA, payB, unpaidA, unpaidB, block.timestamp);
}

```

### 5.5 EmergencyWithdrawA / EmergencyWithdrawB

```solidity
require(emergencyMode == true && !shutdownMode, "NOT_EMERGENCY"); // 仅纯 Emergency 状态

// 闭环维持不变量：放弃个人全部收益，核减系统总负债，转入系统预算
uint256 principal = userStakedA[user];
uint256 forfeited = rewardsA[user];

userStakedA[user] = 0;
totalStakedA -= principal;
rewardsA[user] = 0;

if (totalPendingA >= forfeited) totalPendingA -= forfeited;
availableRewardsB += forfeited;

stakingTokenA.safeTransfer(user, principal);
// 豁免 _assertInvariantB() 的 revert，仅 emit 事件

```

---

## 6. 奖励通知与治理预算调拨

### 6.1 手续费与罚金流向表

| 场景 | Token 类型 | 费率 | 罚金/费用去向 |
| --- | --- | --- | --- |
| WithdrawA (本金罚金) | TokenA | `penaltyFeeBP` | 外转 `forfeitedRecipient` |
| WithdrawA (没收奖励) | TokenB | 全部没收 | **`availableRewardsB`** (留在合约) |
| WithdrawB (本金罚金) | TokenB | `penaltyFeeBP` | **`availableRewardsB`** (留在合约) |
| WithdrawB (没收奖励) | TokenB | 全部没收 | **`availableRewardsB`** (留在合约) |
| Mature Withdraw | TokenA | 1% 或 0.5% | 外转 `feeRecipient` |
| Mature Withdraw | TokenB | 1% 或 0.5% | **`unclaimedFeesB`** (留存在合约，待提取) |

> **业务说明：Pool A 没收奖励流向 Pool B 的设计依据**
> 为了强化整个协议的长线持有吸引力，发生于 Pool A 的所有 `TokenB` 奖励没收事件（例如早退罚没），均被刻意**跨池重定向**至 `availableRewardsB`。这一设定将短线投机者的流失直接转化为 Pool B 复投者的长期红利。

### 6.2 奖励注入 notifyRewardAmountX

**前置条件**

```solidity
require(!shutdownMode, "SHUTDOWN");
require(duration >= MIN_REWARD_RATE_DURATION && duration <= MAX_DURATION, "DURATION_ERR");
require(amount > 0, "ZERO_AMOUNT");

```

**执行步骤（防御 FOT 变种 CEI）**

> **架构声明**：为了原生支持具有 FOT (Fee On Transfer) 机制的 TokenB，本函数刻意采用 `Check → Interaction → Effects` 的变种 CEI 顺序。外部调用的安全性完全由 `nonReentrant` 锁保证，且部署期的 TokenA 白名单已将 ERC777 钩子阻绝于门外。

```solidity
// 1. 先结算旧周期，固化已产生的债务
_updateGlobalX();

// 2. Synthetix 标准剩余预算计算
uint256 leftover = 0;
// 开发者注意：必须使用 lastUpdateTimeX 而非 block.timestamp，防止 double-count！
// 因为 _updateGlobalX() 已经安全推进了时间锚点。
uint256 remaining = periodFinishX > lastUpdateTimeX ? periodFinishX - lastUpdateTimeX : 0;
leftover = remaining * rewardRateX; 

// 3. Interaction: 先转账验证真实到账资金
uint256 balBefore = rewardTokenB.balanceOf(address(this));
rewardTokenB.safeTransferFrom(msg.sender, address(this), amount);
uint256 actualAmount = rewardTokenB.balanceOf(address(this)) - balBefore;
require(actualAmount > 0, "ZERO_TRANSFER");

// 4. 计算新速率 (防稀释)
uint256 newRate = (actualAmount + leftover) / duration;
require(newRate <= MAX_REWARD_RATE_X, "RATE_EXCEEDS_MAX"); // 速率硬顶保护

// 5. Effects: 更新周期与状态
rewardRateX = newRate;
periodFinishX = block.timestamp + duration;
lastUpdateTimeX = block.timestamp;
availableRewardsX += actualAmount; 

_assertInvariantB();
emit RewardNotified(Pool.X, actualAmount, duration, newRate); 

```

### 6.3 治理 Setter 接口 (Admin Only)

必须实现以下函数以消耗事件定义（均需 ≥48h Timelock，且不可重入）：

* `rebalanceBudgets(Pool from, Pool to, uint256 amt)`: `require(badDebtA == 0 && badDebtB == 0)`，触发 `BudgetRebalanced`。
* `claimFees()`: Admin 提取 `unclaimedFeesB`，提取后清零，外转 TokenB。
* `setTVLCapX(uint256 cap)`: 触发 `TVLCapUpdated`。
* `setMinStakeAmountX(uint256 amt)`: 触发 `MinStakeAmountUpdated`。
* `setRewardDurationX(uint256 duration)`: 触发 `RewardDurationUpdated`。
* `setMinClaimAmount(uint256 newAmount)`  
  - Admin Only，≥48h Timelock  
  - `require(newAmount <= MAX_MIN_CLAIM_AMOUNT)`  
  - 用于调整 Claim 的最小金额限制，防止 dust 攻击或 gas griefing  
  - 触发 `MinClaimAmountUpdated(oldValue, newValue, timestamp)`
```solidity
function setMinClaimAmount(uint256 newAmount)
    external
    onlyAdmin
    timelocked(48 hours)
{
    require(newAmount <= MAX_MIN_CLAIM_AMOUNT, "EXCEEDS_MAX");
    
    uint256 old = minClaimAmount;
    minClaimAmount = newAmount;

    emit MinClaimAmountUpdated(old, newAmount, block.timestamp);
}
```
---

## 7. 暂停与紧急操作

### 7.1 状态机与行为矩阵

| 操作 | Normal | Paused | Emergency | Emergency+Paused | Shutdown |
| --- | --- | --- | --- | --- | --- |
| stake / compound / notify | ✅ | ❌ | ❌ | ❌ | ❌ |
| withdraw / claim | ✅ | ❌ | ❌ | ❌ | ✅ |
| emergencyWithdraw | ❌ | ❌ | ✅ | ✅ | ❌ |
| pause | ✅ | ❌ | ✅ | ❌ | ❌ |
| unpause | ❌ | ⚠冷却 | ❌ | ⚠冷却 | ❌ |
| enableEmergencyMode | ✅ | ✅ | ❌ | ❌ | ❌ |
| shutdown | ❌ | ❌ | ⚠≥48h | ⚠≥48h | ❌ |

> **状态覆写规则**：
> Emergency 优先级最高。只要 `emergencyMode == true`，`emergencyWithdraw` 就必须可用，完全无视 `paused` 状态。

**Withdraw 状态逻辑说明**

Withdraw 操作的内部校验为：

require(!paused, "PAUSED");
require(!emergencyMode || shutdownMode, "EMERGENCY_MODE");

其语义等价于：

- Normal 状态：允许 Withdraw
- Paused 状态：禁止 Withdraw
- Emergency 状态：禁止 Withdraw，必须使用 emergencyWithdraw
- Shutdown 状态：允许 Withdraw（用于系统清算退出）

### 7.2 Pause / Unpause

```solidity
// pause() 
_updateGlobalA(); _updateGlobalB(); 
paused = true; pausedAt = block.timestamp;
unpauseAt = block.timestamp + UNPAUSE_COOLDOWN; // 24小时不可变冷却

// unpause() 必须补偿周期流失
uint256 delta = block.timestamp - pausedAt;
periodFinishA += delta; periodFinishB += delta;
lastUpdateTimeA = block.timestamp; lastUpdateTimeB = block.timestamp;
paused = false; pausedAt = 0;

```

### 7.3 EmergencyMode（单向不可逆）

* **激活**：Operator 权限，0h 延迟立即生效（`enableEmergencyMode`）。**不可撤销**，彻底消灭中心化开关作恶的可能。
* 期间仅允许 `emergencyWithdrawA/B`，其内部状态检查为：`require(!paused || emergencyMode); require(emergencyMode && !shutdownMode);`（确保无视暂停）。

### 7.4 ShutdownMode (彻底清扫)

* **激活**：前提是 `emergencyMode == true`，经 Admin ≥48h Timelock 激活。
* **僵尸死锁防护**：引入超时清算机制扫除一切残余以维持不变量：

```solidity
function forceShutdownFinalize() external onlyAdmin {
    require(shutdownMode, "NOT_SHUTDOWN");
    // 必须在 Shutdown 开启 365 天后才能强制清算
    require(block.timestamp >= shutdownAt + 365 days, "GRACE_PERIOD_NOT_MET");
    
    // 安全阻断：确保所有用户的本金已被提走，防止强制销毁破坏了对应的收益提现权
    require(totalStakedA == 0 && totalStakedB == 0, "STILL_STAKED");
    
    // 一波清空所有未认领的逻辑负债与预算
    uint256 residual = totalPendingA + totalPendingB + availableRewardsA + availableRewardsB + unclaimedFeesB;
    
    totalPendingA = 0; totalPendingB = 0;
    availableRewardsA = 0; availableRewardsB = 0;
    unclaimedFeesB = 0;
    
    if (residual > 0) rewardTokenB.safeTransfer(feeRecipient, residual);
    emit ProtocolShutdownComplete(block.timestamp);
}

```

### 7.5 resolveBadDebt（坏账物理修复）

> **治理策略声明 (Cross-pool Injection)**：`resolveBadDebt` 操作中修复坏账后如果仍有多余的 TokenB 资金注资（`rem > 0`），这笔溢出的资金将被强制并入 `availableRewardsB`。这是协议经济模型的**刻意设计选择**，旨在利用坏账修复期反哺 Pool B 的核心长期复投者，**并非跨池会计错误**。

```solidity
function resolveBadDebt(uint256 amount) external onlyAdmin timelocked(48 hours) nonReentrant {
    require(badDebtA > 0 || badDebtB > 0, "NO_BAD_DEBT");
    
    // CEI 原则：先转账入场
    uint256 balBefore = rewardTokenB.balanceOf(address(this));
    rewardTokenB.safeTransferFrom(msg.sender, address(this), amount);
    uint256 rem = rewardTokenB.balanceOf(address(this)) - balBefore;

    uint256 totalRepaid = 0;

    if (rem > 0 && badDebtA > 0) {
        uint256 repayA = Math.min(rem, badDebtA);
        badDebtA -= repayA; rem -= repayA;
        totalRepaid += repayA;
        emit BadDebtResolved(Pool.A, repayA, block.timestamp);
    }
    if (rem > 0 && badDebtB > 0) {
        uint256 repayB = Math.min(rem, badDebtB);
        badDebtB -= repayB; rem -= repayB;
        totalRepaid += repayB;
        emit BadDebtResolved(Pool.B, repayB, block.timestamp);
    }
    
    if (totalRepaid > 0) {
        emit BadDebtResolvedTotal(totalRepaid, block.timestamp);
    }

    // 多余资金化作未来预算（流入 Pool B 激励层）
    if (rem > 0) availableRewardsB += rem; 
    _assertInvariantB();
}

```

### 7.6 recoverToken（防窃取修正）

```solidity
// TokenA 的已知限制
if (token == address(stakingTokenA)) {
    uint256 excess = stakingTokenA.balanceOf(address(this)) - totalStakedA;
    require(amount <= excess, "CANNOT_RECOVER_STAKED_TOKEN_A");
}

if (token == address(rewardTokenB)) {
    require(badDebtA == 0 && badDebtB == 0, "BAD_DEBT_EXISTS");
    // 必须保护 unclaimedFeesB
    uint256 required = totalStakedB + totalPendingA + totalPendingB
                      + availableRewardsA + availableRewardsB + unclaimedFeesB;
    uint256 balance = rewardTokenB.balanceOf(address(this));
    require(balance > required, "NO_EXCESS_TOKEN_B");
    require(amount <= balance - required, "EXCEEDS_EXCESS");
}

IERC20(token).safeTransfer(msg.sender, amount);
emit TokenRecovered(token, amount, msg.sender);

```

---

## 8. 事件与自定义错误系统

### 8.1 核心事件定义

```solidity
enum Pool { A, B }

// ── 用户操作事件 ──────────────────────────────────────────────────────────
event Staked(address indexed user, uint256 amount, uint256 newUnlockTime, Pool indexed pool);
event Withdrawn(address indexed user, uint256 amount, uint256 feeOrPenalty, bool isEarly, Pool indexed pool);
event Claimed(address indexed user, uint256 paidA, uint256 paidB, uint256 timestamp);
event ForceClaimed(address indexed user, uint256 paidA, uint256 paidB, uint256 unpaidA, uint256 unpaidB, uint256 timestamp); 
event Compounded(address indexed user, uint256 amountA, uint256 amountB, uint256 newUserStakedB, uint256 newUnlockTimeB);
event EmergencyWithdrawn(address indexed user, uint256 amount, Pool indexed pool, uint256 at); 

// ── 管理员与系统操作事件 ──────────────────────────────────────────────────
event RewardNotified(Pool indexed pool, uint256 amount, uint256 duration, uint256 rate);
event BudgetRebalanced(Pool indexed from, Pool indexed to, uint256 amount, uint256 at);
event Paused(address indexed by, uint256 at);
event Unpaused(address indexed by, uint256 at);
event EmergencyModeActivated(address indexed by, uint256 at);
event ShutdownActivated(address indexed by, uint256 at); 
event ProtocolShutdownComplete(uint256 at);
event BadDebtResolved(Pool indexed pool, uint256 amount, uint256 at); 
event BadDebtResolvedTotal(uint256 totalRepaid, uint256 at);
event InvariantViolated(uint256 actual, uint256 required, uint256 at);
event InsufficientBudget(Pool indexed pool, uint256 shortfall, uint256 at); 
event TokenRecovered(address indexed token, uint256 amount, address indexed to);
event DustAccumulated(Pool indexed pool, uint256 dustTotal, uint256 at); 

// ── 参数变更事件 ──────────────────────────────────────────────────────────
event FeeRecipientUpdated(address indexed oldAddr, address indexed newAddr, uint256 at);
event FeesUpdated(uint256 penaltyBP, uint256 withdrawBP, uint256 midTermBP, uint256 at);
event LockDurationUpdated(uint256 oldDuration, uint256 newDuration, uint256 at);
event MinClaimAmountUpdated(uint256 oldVal, uint256 newVal, uint256 at); 
event ForfeitedRecipientUpdated(address indexed oldAddr, address indexed newAddr, uint256 at);
event TVLCapUpdated(Pool indexed pool, uint256 oldCap, uint256 newCap, uint256 at);
event MinStakeAmountUpdated(Pool indexed pool, uint256 oldAmount, uint256 newAmount, uint256 at);
event RewardDurationUpdated(Pool indexed pool, uint256 oldDuration, uint256 newDuration, uint256 at);

```

### 8.2 自定义错误定义

```solidity
error Paused_();
error EmergencyModeActive();
error ShutdownModeActive();
error InsufficientBalance(uint256 requested, uint256 available);
error InsufficientPending(uint256 requested, uint256 available); 
error UnlockTimePending(uint256 unlockTime, uint256 now_);
error BelowMinClaim(uint256 claimable, uint256 minAmount);
error BelowMinEarlyExit(uint256 requested, uint256 minAmount); 
error RewardRateExceedsMax(uint256 rate, uint256 maxRate);
error UnpauseCooldownPending(uint256 unpauseAt, uint256 now_);
error InvariantViolation(uint256 actual, uint256 required);
error ZeroDuration();
error ZeroAmount();
error Unauthorized(address caller);
error TokenRecoveryRestricted();
error BadDebtExists();

```

---

## 9. 边界场景分析汇总

| 场景 | 处理规则与底层逻辑 |
| --- | --- |
| **空池首笔注入** | 采用 **Re-anchor（重锚）算法**。不推延周期，首位用户进入时按剩余预算重算 `rewardRate`，防止 APR 被前期空置时间稀释。 |
| **巨鲸追加仓位** | 取 `max(oldUnlock, now+lockDuration)`。大额资金追加无法压缩原有解锁时间，强制遵守锁定期限。 |
| **WADP 与 Lock 差异** | 属故意设计：提现费率由 WADP 加权更新（平滑后退），而锁定周期受 `Rolling Lock` 约束全额延长。 |
| **CompoundB 豁免 Cap** | 复投产生的增加不占用 TVL Cap 配额限制，防止池子接近饱满时直接卡死用户的自动复投。 |
| **Pause + Emergency** | **Emergency 优先级最高**。只要 `emergencyMode == true`，`emergencyWithdraw` 就必须可用，无视 `paused` 状态。 |
| **WithdrawB 罚金闭环** | TokenB 产生的 Early Exit 罚金与没收奖励**绝对不对外转账**，直接原路路由至 `availableRewardsB`，维持 TokenB 物理与逻辑不变量。 |
| **坏账期 Claim** | 标准 `claim` 刚性阻断；`forceClaimAll()` 允许用户在退池前按物理残值折损清算，并按重叠部分核减 BadDebt 维持公式平衡。 |
| **奖励预算不足** | 触发 `_updateGlobalX` 时若余额不足，必须显式记录 `badDebtX` 并 emit 告警，**严禁静默截断**。 |
| **Bad Debt 期间复投** | `CompoundB` 强制 `require(badDebt == 0)`，防止系统在资不抵债时允许用户将“虚假负债”转化为“真实本金”。 |
| **僵尸粉尘死锁** | Shutdown 开启 365 天后，且在所有质押本金已提走的先决条件下，Admin 有权调用 `forceShutdownFinalize` 清空残值。 |
| **防零罚金漏洞** | 若设置了 `penaltyFeeBP`，则 `minEarlyExitAmountX` 必须满足计算出的罚金 $\ge 1 \text{ wei}$，防止利用整除截断零成本逃逸。 |
| **ERC777 绕过 CEI** | 在部署时通过白名单严格过滤，确保 TokenA 绝不包含 `tokensReceived` 回调，从而阻断针对 `_updateGlobalX` 的重入窃取。 |

---

## 附录 A：关键公式汇总

| 公式用途 | 表达式说明 |
| --- | --- |
| **有效时间窗口** | $t_{Applicable}=\min(\text{block.timestamp},periodFinishX)$ |
| **时间差上限** | $deltaTime=\min(tApplicable-lastUpdateTimeX,MAX\_DELTA\_TIME)$ |
| **收益指数更新** (防溢出) | $accX=accX+\text{mulDiv}(rewardRateX \times deltaTime,PRECISION,totalStakedX)$ |
| **用户已赚奖励** | $Earned=\text{mulDiv}(userStakedX,accX-userRewardPaidX,PRECISION)$ |
| **Rolling Lock** (大值覆盖) | $unlockTime=\max(oldUnlock,\text{block.timestamp}+lockDuration)$ |
| **WADP 费率计时** (防套利) | $T_{new}=\frac{(Staked_{old} \times T_{old})+(Amount_{new} \times \text{block.timestamp})}{Staked_{old}+Amount_{new}}$ |
| **新奖励速率** (重锚/平滑) | $rewardRateX=\frac{amount+leftover}{duration}$ *(注: leftover 为按期折算的剩余流速)* |
| **Early Exit 罚金** | $Penalty=\frac{Amount \times penaltyFeeBP}{10000}$ |
| **minEarlyExit 约束** (防零) | $minEarlyExitAmountX \ge \lceil \frac{BASIS\_POINTS}{penaltyFeeBP} \rceil$ |
| **TokenB 终极不变量** (防死锁) | $BalanceB+BadDebt_{A+B}+DUST\_TOLERANCE \ge TotalStakedB+TotalPending_{A+B}+AvailableRewards_{A+B}+UnclaimedFeesB$ |
| **dustX 监控累计** (还原精度) | $dustX=dustX+(\text{mulmod}(\text{deltaRewardX}, \text{PRECISION}, \text{totalStakedX}) / \text{PRECISION})$ |
| **最大速率约束** (上限保护) | $MAX\_REWARD\_RATE\_X=\frac{maxSupplyB \times MAX\_APR\_BP}{10000 \times SECONDS\_PER\_YEAR}$ |
| **Excess TokenB 可回收量** | $Excess=BalanceB-(TotalStakedB+TotalPending_{A+B}+AvailableRewards_{A+B}+UnclaimedFeesB)$ |
| **Shutdown 有序退出检查** | require(!emergencyMode 或 shutdownMode) |