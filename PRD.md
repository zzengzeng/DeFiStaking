# ERC20 (Staking) 协议需求规格说明书 v1.1

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
| **最小权限** | 遵循最小特权原则。治理性操作（调拨、费率、升级）的延迟由 **链上标准 `TimelockController`（或 Safe→Timelock）** 执行，目标最小延迟 **≥48h**（见 **§2.1.1**）。 |
| **安全降级与响应分离** | 阻断性操作（暂停、开启紧急模式）**0h 延迟**；恢复性操作（取消模式、提取资产）**≥48h 延迟**。 |
| **不变量弹性豁免** | `_assertInvariantB()` 在 Normal 模式失败时必 revert；在 **EmergencyWithdraw** 路径下仅警告不回滚。 |
| **WADP 防套利** | 任何追加质押行为必须通过时间加权算法重算持仓起点，严禁通过 1 wei 追加重置费率阶梯。 |
| **TVL 校验完整性** | 所有 Stake 操作的 Cap 检查必须包含 **“真实入账的拟新增量”**，防范闪电贷瞬时攻击与 FOT 额度虚占。 |
| **空池重锚** | 当池子为空时奖励不释放；`periodFinish` 已过期但预算仍在时由 `RewardReanchorLib` 重排；首位质押/复利进 B 池时按剩余窗口重锚 `rewardRate`，**活跃窗口与过期窗口均受 `MAX_REWARD_RATE_*` 约束**（见 **§4.5**）。 |
| **用户奖励账本对账** | Core 维护 `bookedUserRewardsA/B`（各池 `userInfo*.rewards` 之和），与 `totalPending` 对账，支撑停机 `forceShutdownFinalize` 与 orphan pending 清扫（见 **§3.2**、**§7.4**）。 |
| **FOT 税费由用户承担** | 入账与出账均不由池子补贴 FOT 税；`maxTransferFeeBP` 对称封顶；前端须展示「合约转出额 vs 预计到手」（见 **§4.6**）。 |

### 1.3 文档范围

本文档覆盖：角色与权限、资产隔离（TokenB 会计不变量）、状态变量、数学公式（WADP 与重锚）、详细功能需求（Stake/Withdraw/Compound/Emergency）、奖励通知与预算调拨、手续费阶梯、安全矩阵、事件系统、边界场景剖析。

**不覆盖**：前端实现、链下 Keeper 调度、多链部署差异。

**覆盖（治理部署）**：推荐主路径为 **OpenZeppelin `TimelockController`** 持有治理门面 `owner`、并由其 `schedule` / `execute` 调用带 `ADMIN_ROLE` 的链上入口；细节见 **§2.1.1**。

### 1.4 链上实现架构（与仓库对齐）

| 组件 | 职责 |
| --- | --- |
| **`DualPoolStaking`（Core）** | 角色、路由、`delegatecall` 至模块、`_assertInvariantB`、Operator 0h 入口 |
| **`DualPoolUserModule`** | `stake*` / `withdraw*` / `claimA` / `claimB` / `compoundB` / `forceClaimAll` / `emergencyWithdrawA/B`；维护 `bookedUserRewards*` |
| **`DualPoolAdminModule`** | `notifyRewardAmount*`、治理 setter、`forceShutdownFinalize`、`resolveBadDebt` 等 |
| **`DualPoolStakingAdmin`** | Timelock 可调用的 Admin 门面（`Ownable.owner` = Timelock） |
| **链接库（library）** | `PoolAccrualLib`、`PoolAStakeLib`、`PoolBStakeLib`、`PoolBWithdrawLib`、`PoolBCompoundLib`、`PoolSingleClaimLib`、`NotifyRewardLib`、`ForceClaimAllLib`、`StakingAdminLib`、**`PoolBWadpLib`**、**`RewardReanchorLib`** |

用户入口命名（与 Core 对外 ABI 一致）：**`claimA` / `claimB`**（分池领取）、**`compoundB`**（跨池复投进 B）、**`emergencyWithdrawA` / `emergencyWithdrawB`**（分池紧急退出）。

---

## 2. 项目范围与角色定义

### 2.1 角色与权限模型

| 角色 | 获取方式 | 核心权限 | 响应要求 (Timelock) |
| --- | --- | --- | --- |
| **Owner（`DEFAULT_ADMIN_ROLE`）** | 部署时授予 | 模块指针（`setUserModule` / `setAdminModule`）、`setAdmin` / `setOperator` 等超级配置 | 逻辑/实现升级等建议 **≥72h**，由 Timelock 或多签发起 |
| **Admin（`ADMIN_ROLE`）** | 授予治理门面；门面 `Ownable.owner` = **`TimelockController`** | 风险参数、`recoverToken`、`rebalanceBudgets`、`unpause` 等 | **≥48h**：须由 Timelock `schedule` → 到期 `execute` 再调用门面→Core |
| **Operator（`OPERATOR_ROLE`）** | `DEFAULT_ADMIN_ROLE` 单独授予运维地址 | **`pause()`、`enableEmergencyMode()`、`notifyRewardAmount*`**（不经治理门面） | **0h**（防御性/注资类）；**不得**仅挂在 `owner = Timelock` 的门面上以免被误加 48h |
| **User** | 任意地址 | `stakeA`/`stakeB`、`withdrawA`/`withdrawB`、`claimA`/`claimB`、`compoundB`、`forceClaimAll`、`emergencyWithdrawA`/`emergencyWithdrawB` | — |

#### 2.1.1 标准 Timelock 管 Admin（推荐主路径）

1. **时间锁合约**：采用 OpenZeppelin **`TimelockController`**（或与 **Gnosis Safe** 串联：Safe 投票通过 → Timelock `schedule` → 延迟届满 → `execute`）。`minDelay` 至少 **48 小时**；对模块替换、超级权限变更等可单独约定 **72 小时**（更高 `minDelay`、独立 Timelock 实例或链下流程约束均可）。
2. **治理门面**：`DualPoolStakingAdmin` 仅包装需延迟的 **Admin** 调用；向 Core 授予 **`ADMIN_ROLE`** 给该门面地址；将门面 **`Ownable` 的 `owner` 设为 `TimelockController`**。敏感 setter 的调用路径为：`Timelock.execute(admin.setX(...))` → Core `onlyRole(ADMIN_ROLE)`。
3. **运维与 0h 路径**：`pause`、`enableEmergencyMode`、`notifyRewardAmount*` 保留在 **Core** 上且为 **`OPERATOR_ROLE`**，由独立热钱包/运维多签持有；**不**经过上述门面，避免与 48h 延迟错误绑定。
4. **治理时间锁**：仅使用 OpenZeppelin **`TimelockController`**（`schedule` → 延迟 → `execute` / `cancel`）。审计与运维以 Timelock 的 `CallScheduled` / `CallExecuted` / `Cancelled` 为准。

> **关键操作 Timelock 要求（与上表一致，延迟在 Timelock 层落实）**
> * **0h (立即生效)**：`pause()`、`enableEmergencyMode()`、`notifyRewardAmount*`（及 PRD 中声明为 Operator 的同类防御/注资操作）。
> * **≥48h**：经 Timelock 调度的 `setFees`、`setLockDuration`、`shutdown`、`recoverToken(TokenB)`、`rebalanceBudgets`、`unpause`、预算/参数类等 **Admin** 路径。
> * **≥72h**：逻辑/实现升级、`DEFAULT_ADMIN_ROLE` 转移等超级变更（按部署配置落实）。
> 
> 

### 2.2 资产隔离与 TokenB 不变量

**物理隔离与 ERC777 防御基线（强制）**

> **安全预警**：由于 `!isContract` 校验会误杀多签钱包和账户抽象（AA），系统采用**部署期白名单**策略。在合约部署时，管理员必须确保传入的 **TokenA / TokenB** 实现中**绝对不包含** `tokensReceived` 等 ERC777 钩子，从源头上斩断绕过 CEI 造成重入的可能。

**链上实现（生产对齐）**：在存在 ERC1820 注册表的网络上，Core 构造函数会执行以下探测（无注册表则跳过）：

* **本合约地址**：不得注册 `ERC777TokensRecipient` / `ERC777TokensSender` 接口实现者（防止 Core 作为 777 钩子载体）。
* **TokenA / TokenB 地址**：不得注册上述接口实现者（部署期对质押与奖励资产地址的强制校验，`_assertTokenHasNoERC777Hooks`）。

```solidity
require(address(stakingTokenA) != address(rewardTokenB), "A_EQ_B");
require(rewardTokenB.decimals() == 18, "TOKEN_B_MUST_BE_18_DECIMALS");

```

**TokenB 会计不变量**

为了确保系统在任何极端模式下（包括产生坏账时）逻辑可控，公式必须引入 `BadDebt` 作为账目平衡调节项：

$$BalanceB + BadDebt_{A} + BadDebt_{B} + DUST\_TOLERANCE \ge TotalStakedB + TotalPending_{A+B} + AvailableRewards_{A+B} + UnclaimedFeesB + Dust_{A} + Dust_{B}$$

> **`Dust_{A/B}` 纳入右侧（required）的语义（与链上实现一致）**：`dustA` / `dustB` 为各池结算截断产生的粉尘暂存桶（wei），在尚未达到 `DUST_TOLERANCE` 回灌至 `availableRewards` 前，对应 wei **仍留在合约 TokenB 余额中**，但**未计入** `availableRewards`。将 `dustA + dustB` 并入 `required` 使校验**更严格**，避免账面漏计可动用余额。

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
>                       + availableRewardsA + availableRewardsB + unclaimedFeesB
>                       + dustA + dustB;
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

* **WithdrawA（正常路径）**：**无锁、无本金手续费**；仅扣减 `userStakedA` / `totalStakedA` 并全额转出 TokenA 本金。已确权奖励仍留在 `rewardsA`，由 `claimA()` 单独兑付，**不在 `withdrawA` 中没收或外转罚金**。
* **EmergencyWithdrawA**：紧急模式下用户退出 Pool A 本金时，将已确权但未领的奖励按负债安全上限从 `totalPendingA` 核销，并把对应 TokenB 记入 **`availableRewardsB`**（跨池预算回流，与正常 `withdrawA` 无关）。
* > **经济模型声明 (Cross-pool Routing)**：`emergencyWithdrawA` 等路径下 Pool A 侧未领奖励重定向至 Pool B（`availableRewardsB`），用于在极端情况下将预算回流至长期池侧；**与「Pool A 正常提款零费零锁」不矛盾**。




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
| `dustA / dustB` | 各池结算截断粉尘暂存（wei） | 未回灌前计入不变量 **required** 侧（见上文公式） |
| `badDebtA/B` | 确权时产生的逻辑缺口 | 用于平配公式，防止系统因余额不足锁死 |
| `unclaimedFeesB` | 已产生但未提取的 Mature 提现手续费 | 提取后公式右侧同步减少 |

**recoverToken 受限规则（坏账敏感型）**

> 在系统存在坏账（`badDebt > 0`）时，严禁回收任何 TokenB，必须先通过 `resolveBadDebt` 补齐缺口。

```solidity
// TokenB：仅允许回收超额部分，且必须在 badDebt 清零前提下
require(badDebtA == 0 && badDebtB == 0, "BAD_DEBT_EXISTS");
uint256 requiredB = totalStakedB + totalPendingA + totalPendingB
                   + availableRewardsA + availableRewardsB + unclaimedFeesB + dustA + dustB;
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
| `MAX_REWARD_RATE_A / B` | uint256 | 派生上界 | 由构造函数参数 **`maxTotalSupplyBForRewardRateCap`（>0，部署时一次性写入）** 与 `MAX_APR_BP`、`SECONDS_PER_YEAR` 推导；**禁止**在 `notifyRewardAmount*` 中使用运行时 `rewardTokenB.totalSupply()` 作为上界，以免增发/销毁改变经济边界。 |
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

**Core 构造函数（生产）** 签名为 `constructor(address stakingTokenA, address rewardTokenB, uint256 maxTotalSupplyBForRewardRateCap)`，其中 `maxTotalSupplyBForRewardRateCap` 须与代币经济模型一致（通常取 TokenB **最大可流通量/硬顶**；Mock 环境可取足够大的常数），且 **必须 `> 0`**。

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
uint256 public minClaimAmount;        // 合约初始值为 0（无门槛）；Admin 须在部署后尽早通过 setMinClaimAmount 设置（建议 ≥1e15 wei），上限 MAX_MIN_CLAIM_AMOUNT（1e17 wei）
address public forfeitedRecipient; // 治理可配置的接收地址（Timelock）；与 Pool B 罚金/费用等路由设计对齐，**不用于 Pool A 正常提款罚金**（`withdrawA` 无罚金）

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
| `rewardDurationA / B`（`PoolInfo.rewardDuration`） | uint256 | 各池默认排放时长（秒）；`notifyRewardAmount*(amount, 0)` 时使用；`0` 表示未设默认（须 Operator 传显式 `duration` 或 Admin 先 `setRewardDuration*`） | seconds |
| `bookedUserRewardsA / B` | uint256 | 链上汇总：该池所有 `userInfo*.rewards` 之和；在 settle / claim / compound / forfeit / emergency 路径增减；用于停机清算 | weiB |

> **`bookedUserRewards` 与 `totalPending`**
> * `totalPendingX`：池级「已释放、未兑付」负债（主要由 `_updateGlobalX` 增加）。
> * `bookedUserRewardsX`：已记入用户 `rewards` 字段、尚未 claim 的合计。
> * 正常态应满足 **`bookedUserRewardsX ≤ totalPendingX`**；差额 `orphanX = totalPendingX - bookedUserRewardsX` 为未挂到任何用户账上的 pending（停机 finalize 时仅在无剩余质押本金时并入 residual 清扫；deadlock bypass 后仍有质押者时保留在 `totalPending` 供后续 settle/claim，见 **§7.4**）。
> * 若 `bookedUserRewardsX > totalPendingX`，实现 **revert** `BookedRewardsExceedPending()`。

> **⚠️ 实现警告（Critical）**：
> 开发者在实现对应的 `_updateGlobalX()` 函数时，**切勿将逻辑碎片化**。必须以 **§4.1** 中提供的统一代码块为准（包含提前 return 防除零、坏账映射、粉尘还原回收等），以保证时序的安全性和会计一致性。

### 3.3 用户账本映射

| 映射名 | 类型 | 含义 |
| --- | --- | --- |
| `userStakedA / userStakedB[user]` | mapping(address => uint256) | 用户本金余额 |
| `rewardsA / rewardsB[user]` | mapping(address => uint256) | 已确权未领收益 |
| `userRewardPaidA / userRewardPaidB[user]` | mapping(address => uint256) | 收益指数快照 |
| `unlockTimeB[user]` | mapping(address => uint256) | **仅 Pool B**：滚动解锁截止时间（Pool A 无此字段） |
| `stakeTimestampB[user]` | mapping(address => uint256) | **仅 Pool B**：WADP 时间加权持仓起点（Pool A 无此字段） |
| `lastClaimTime[user]` | mapping(address => uint256) | 上次 Claim/Compound 时间 |

> **WADP (时间加权平均) 机制（核心防套利设计）**
> 严禁在每次追加质押（Stake/Compound）时将 `stakeTimestamp` 粗暴重置为 `block.timestamp`，否则将严重惩罚长期持有者的复投行为。必须按资金量进行时间加权：
> **WADP 公式**：
> 
> $$T_{new} = \left\lceil\frac{(Staked_{old} \times T_{old}) + (Amount_{new} \times Now)}{Staked_{old} + Amount_{new}}\right\rceil$$
> 
> 实现见 **`PoolBWadpLib`**（OpenZeppelin `Math.Rounding.Ceil`），详见 **§4.4**。

### 3.4 费率与边界配置

| 变量名 | 类型 | 含义 | 默认值 / 约束 |
| --- | --- | --- | --- |
| `lockDuration` | uint256 | 基础锁定期 | 7 days（Max 90 days） |
| `penaltyfeeBP` | uint256 | **Pool B** Early Exit 罚金（BP） | 1000（Max 2000） |
| `withdrawFeeBP` | uint256 | 短期到期手续费（BP） | 100（Max 500） |
| `midTermFeeBP` | uint256 | 中期到期手续费（BP） | 50（Max 500） |
| `minStakeAmountA / B` | uint256 | 最小质押量 | 防粉尘攻击 |
| `maxTVLCapA / B` | uint256 | TVL 上限 | 0=无限 |
| `claimCooldown` | uint256 | Claim/Compound 冷却 | 24h |
| `feeRecipient` | address | 提现手续费接收地址 | Admin 设定，≥48h Timelock |
| `minEarlyExitAmountB` | uint256 | **仅 Pool B**：最小提前退出量 | 须满足计算罚金 $\ge 1 \text{ wei}$ |
| `forfeitedRecipient` | address | 治理配置的接收地址（预留/与 B 池路由设计对齐） | Admin 设定，≥48h Timelock |

> **minEarlyExitAmountB 最小值除零约束（安全基线，仅 Pool B）**
> 为防止提现 1 wei 时导致罚金因整除被截断为 0，系统设置函数必须强制校验：
> ```solidity
> // 如果罚金率大于 0，最小退出额产生的罚金必须大于等于 1 wei
> if (penaltyfeeBP > 0) {
>     require(newMinEarlyExitAmountB * penaltyfeeBP / BASIS_POINTS >= 1, "PENALTY_TOO_SMALL");
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

> **补充机制：空池重锚 (Re-anchor)** — 详见 **§4.5**。当 `totalStakedX == 0` 时 `_updateGlobalX` 不消耗 `availableRewards`；在 `stakeX` / `compoundB` 增加 B 池本金后须重锚 `rewardRate`（活跃窗受 `MAX_REWARD_RATE_X` clamp），防止预算空转或 APR 被空置期稀释，同时避免短窗口无界抬高瞬时发射速率。

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
        // UserModule 同步：bookedUserRewardsX += earned（与 rewards 映射一致）
    }
    // 【核心优化】为了节省一次 SSTORE 的 Gas 操作，移除对 userRewardPaidX[user] 的内部重写。
    // 该快照变量交由外层操作 (Stake/Withdraw/Compound) 在合适的生命周期内统一固化。
}

```

> **实现说明（与仓库代码对齐）**：链接库中的 `_settleUser` 可在同一调用内将 `userRewardPaidX` 同步为最新 `accRewardPerTokenX`（含 `earned == 0` 的舍入边界），与「仅在外层 Fail-safe 写入快照」在**语义结果**上等价，并减少重复 SSTORE。外部审计以链上实现为准。

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

* **Rolling Lock (`unlockTime`)**：防止资金外逃。采用大值覆盖，追加质押必须全额重新锁定 lockDuration。
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

    // 链上实现（PoolBWadpLib）：向上取整，避免多次小额 stake 因 floor 系统性压低 stakeTimestamp、虚增 holdingDuration 而提前进入低费率档
    return Math.mulDiv(weightedOld + weightedNew, 1, oldStaked + addedAmount, Math.Rounding.Ceil);
}

```

> **舍入方向（实现约束）**：WADP 必须使用 **Ceil**（`PoolBWadpLib`）。Floor 会使 `stakeTimestampB` 偏旧、`holdingDuration = now - stakeTimestampB` 偏大，有利于用户、不利于协议费率阶梯。

### 4.5 空池 / 过期窗口重锚（`RewardReanchorLib`）

在 **`stakeA` / `stakeB` / `compoundB`** 增加本金后，若 `availableRewardsX > 0` 且 `totalStakedX > 0`，按剩余排放窗口重算速率。另：**`availableRewards` 在活跃窗口内被动增长**（Pool B Early Exit 罚金/没收、`rebalanceBudgets` 调入、`resolveBadDebt` 盈余等）时，由 **`RewardReanchorLib.reanchorOnBudgetInjection`** 刷新 `rewardRate`（与下表活跃窗路径共用同一 cap 逻辑）。

| 条件 | 行为 |
| --- | --- |
| **首笔进池**（`totalStaked` 由 0 变 >0，含全员撤出后的「第二轮首笔」）且 `remainingTime = periodFinish - now > 0` | 调用 **`RewardReanchorLib.applyCappedRateForRemainingWindow`**：`rawRate = availableRewards / remainingTime`，`rewardRate = min(rawRate, MAX_REWARD_RATE_X)`（压缩剩余窗口、抬高 APR，**但不突破 notify 同源速率上限**） |
| **活跃窗预算注入**（`remainingTime > 0` 且 `availableRewards` 增长） | 同上 **`applyCappedRateForRemainingWindow`**（`reanchorOnBudgetInjection` 活跃分支） |
| **`remainingTime == 0`**（`periodFinish` 已过）且 `availableRewards > 0` | 调用 **`RewardReanchorLib.reanchorStaleSchedule`**：用当前 `availableRewards` 按 `MIN_REWARD_RATE_DURATION`～`MAX_DURATION` 与 `MAX_REWARD_RATE_*` 上限重设 `rewardRate`、`periodFinish`、`lastUpdateTime` |
| 否则 | 不重锚 |

**速率上限（与 `NotifyRewardLib` / 附录 A 一致）**

$$
MAX\_REWARD\_RATE\_X = \frac{\text{maxTotalSupplyBForRewardRateCap} \times MAX\_APR\_BP}{BASIS\_POINTS \times SECONDS\_PER\_YEAR}
$$

**超额预算处理**：当 `rawRate > MAX_REWARD_RATE_X` 时，**clamp 而非 revert**；未按 `rawRate` 即时排完的预算保留在 `availableRewards`，由后续 accrual、`reanchorStaleSchedule`（`remainingTime` 归零后）或运维 `notify` 的 `carryStranded` 继续释放。**不重锚路径与 notify 的差异**：`notify` 对超 cap 的 `newRate` 仍 **revert**（`RewardRateExceedsMax`），因属主动注资；用户侧/被动注入重锚则优先保证可继续排放。

**Operator 二次注资**：若上一周期在空池下结束导致 `availableRewards` 滞留，下一次 `notifyRewardAmount*` 须将 **`carryStranded = availableRewards`**（当 `now >= periodFinish`）并入 `merged = actualAmount + leftover + carryStranded` 再算新速率（`NotifyRewardLib`，见 **§6.2**）。

### 4.6 FOT（Fee-On-Transfer）税费承担原则

本协议对 FOT 类 ERC20 采用**对称、由用户承担**的税费模型：池子金库不为用户补贴链上转账税，避免不可持续的隐性补贴与账本/物理余额长期偏离。

| 方向 | 行为 | 账本语义 |
| --- | --- | --- |
| **入账**（`stakeA` / `stakeB` / `notifyRewardAmount*`） | `balanceOf` 前后差得到 `received`；若隐含税率超过 `maxTransferFeeBP` 则 `ExcessiveTransferFee` | `user.staked`、`availableRewards` 等按 **实收 net** 记账 |
| **出账**（`claimA` / `claimB` / `withdrawA` / `withdrawB` / `forceClaimAll` / `emergencyWithdraw*` / `claimFees`） | 按账面 **gross** 调用 `transfer`；**不 gross-up**；转出后校验收款方 implied fee ≤ `maxTransferFeeBP` | `user.rewards`、提现 `netAmount` 等为合约转出额；钱包实收可能更低 |

**链上辅助**：`FOTTransferLib.walletReceiveAfterFee(gross, maxTransferFeeBP, BASIS_POINTS)` 与 `transferGross` 供库内及链下预览共用同一公式。

**前端要求（产品）**

* 当 `maxTransferFeeBP > 0` 时，Claim / Withdraw 预览须区分：
  * **合约转出额**（链上 `rewards` 或扣费后本金净额）；
  * **预计钱包到手**（按 `maxTransferFeeBP` 上限估算，非保证值；实际以 Token 合约税率为准）。
* 标准 ERC20 生产部署应将 `maxTransferFeeBP` 设为 **0**（跳过出账税后校验，行为等同普通 `safeTransfer`）。

**合理性说明（设计取舍）**

* FOT 税是 Token 合约属性，任意钱包间转账均可能扣税；由协议池子补贴会使金库持续失血且难以审计。
* 入账已按实收 net 记账，出账由用户承担转出税在语义上**对称、可预期**。
* 行业常见做法为披露税率 + 前端估算到手；本协议以 `maxTransferFeeBP` 提供链上封顶保护，拒绝超出容忍度的恶意高税 Token。

> **非 FOT 费用**：Pool B 的 `withdrawFeeBP` / `midTermFeeBP` / `penaltyfeeBP` 等**协议费**仍按 PRD 既有流向表处理（留池或记入 `unclaimedFeesB`），与 FOT 链上转账税无关。

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
8. **触发重锚机制 (Re-anchor)**（与 **§4.5** 一致）：
```solidity
uint256 remainingTime = periodFinishX > block.timestamp ? periodFinishX - block.timestamp : 0;
if (totalStakedX > 0 && availableRewardsX > 0) {
    if (remainingTime > 0 && isFirstDeposit) {
        RewardReanchorLib.applyCappedRateForRemainingWindow(
            poolX, remainingTime, maxTotalSupplyBForRewardRateCap, MAX_APR_BP, BASIS_POINTS, SECONDS_PER_YEAR
        );
    } else if (remainingTime == 0) {
        RewardReanchorLib.reanchorStaleSchedule(poolX, MIN_REWARD_RATE_DURATION, MAX_DURATION, ...);
    }
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

步骤 4：读取收益并执行前置校验（Check 先于 Effect，遵循 CEI）
  rA = rewardsA[user]; rB = rewardsB[user]
  require(rA + rB > 0)
  // 必须先校验负债可用性，revert 时无需回滚清零操作
  require(totalPendingA >= rA, "INSUFFICIENT_PENDING_A")
  require(totalPendingB >= rB, "INSUFFICIENT_PENDING_B")

步骤 5：清零收益（Effect：校验通过后再清零，与合约实现一致）
  rewardsA[user] = 0; rewardsB[user] = 0

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

步骤 10：判断 Pool B 重锚（与 §4.5 一致；`wasEmptyB` 或 `remTime == 0` 路径）
  uint256 remTime = periodFinishB > block.timestamp ? periodFinishB - block.timestamp : 0;
  if (poolB.totalStaked > 0 && poolB.availableRewards > 0) {
      if (wasEmptyB && remTime > 0)
          RewardReanchorLib.applyCappedRateForRemainingWindow(poolB, remTime, ...);
      else if (remTime == 0) RewardReanchorLib.reanchorStaleSchedule(...);
  }
  bookedUserRewardsA -= rA; bookedUserRewardsB -= rB;  // 与 rewards 清零同步

步骤 11：更新冷却与终检
  lastClaimTime[user] = block.timestamp
  _assertInvariantB()
  emit Compounded(user, rA, rB, userStakedB[user], unlockTimeB[user])

```

### 5.3 WithdrawA / WithdrawB（提款）

#### 5.3.1 WithdrawA 状态检查

与业务决策一致：**Pool A 正常提款无锁、无本金手续费**（合约侧无 `unlockTimeA` / `minEarlyExitAmountA` 等状态）。示意代码仅反映 `withdrawA` 实际守卫逻辑：

```solidity
// 完整状态机检查，顺序不可交换（与实现一致：无 Early Exit / 无 Mature Fee 分支）
require(!paused, "PAUSED");
require(!emergencyMode || shutdownMode, "EMERGENCY_MODE: use emergencyWithdraw");
require(amount > 0 && amount <= userStakedA[user], "INVALID_AMOUNT");

_updateGlobalA();
_settleUserA(user);
// 扣减本金、更新指数快照后，全额转出 TokenA 本金；fee/penalty 为 0
userStakedA[user] -= amount;
totalStakedA -= amount;
stakingTokenA.safeTransfer(user, amount);

```

#### 5.3.2 Early Exit Pool B (会计闭环)

```solidity
// 前置状态检查同上...
require(amount >= minEarlyExitAmountB, "BELOW_MIN_EARLY_EXIT_B");

// 步骤 1：结算 B 池收益
_updateGlobalB(); _settleUserB(user);

// 步骤 2：校验负债可覆盖后再清零（CEI 严格顺序：Check → Effect）
uint256 rB = rewardsB[user];
require(totalPendingB >= rB, "BAD_DEBT_B");  // ← Check 先行
rewardsB[user] = 0;                           // ← Effect 在后
totalPendingB -= rB;

// 步骤 3：没收的奖励路由至 availableRewardsB（维持不变量，不对外转账）
availableRewardsB += rB;  

// 步骤 4：罚金计算与路由（留在合约，不对外转账）
uint256 penalty = amount * penaltyfeeBP / BASIS_POINTS;
availableRewardsB += penalty;

// 步骤 4b：活跃窗预算增长后重锚（与 §4.5 一致，受 MAX_REWARD_RATE_B 约束）
if (rB > 0 || penalty > 0) {
    RewardReanchorLib.reanchorOnBudgetInjection(poolB, reanchorCaps);
}

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

> **注意**：正常 **`withdrawA` 不产生** Early Exit 本金罚金、也不外转 TokenA 手续费；已确权奖励通过 **`claimA`** 领取。仅在 **`emergencyWithdrawA`** 等紧急路径下，未领奖励可能按实现核销并记入 **`availableRewardsB`**（见 §5.5）。

#### 5.3.3 Pool B：Mature Withdraw 费率阶梯（费用留存账本）

**本小节仅描述 Pool B**：`withdrawB` 在**已过锁定期**（非 Early Exit）时，按持仓时长匹配 `withdrawFeeBP` / `midTermFeeBP` / `0`，手续费计入 **`unclaimedFeesB`**（TokenB 留在合约）。**Pool A 无对称逻辑**——`withdrawA` 无费率阶梯、无 `unclaimedFees` 分支。

```solidity
// 步骤 1：必须先结算全局与个人收益，防止奖励丢失 (Critical)
_updateGlobalB();
_settleUserB(user);

// 步骤 2：费率匹配与持仓时长计算（仅 B：stakeTimestampB / unlockTimeB）
uint256 holdingDuration = block.timestamp - stakeTimestampB[user];
// 费率匹配: < 90d (withdrawFeeBP) | 90-180d (midTermFeeBP) | >= 180d (0%)
uint256 fee = amount * currentFeeBP / BASIS_POINTS;
uint256 net = amount - fee;

// 步骤 3：手续费路由 — TokenB 进入系统账本
if (fee > 0) {
    unclaimedFeesB += fee;
}

// 步骤 4：强固化快照并在后扣减本金 (Fail-safe)
userRewardPaidB[user] = accRewardPerTokenB;
userStakedB[user] -= amount;
totalStakedB -= amount;

// 步骤 5：执行转账与终检
rewardTokenB.safeTransfer(user, net);
_assertInvariantB();
emit Withdrawn(user, amount, fee, false, Pool.B);

```

### 5.4 claimA / claimB 与 forceClaimAll

**分池领取 `claimA()` / `claimB()`（刚性兑付）**

两函数共享 `lastClaimTime` 与 `claimCooldown`（首次成功 claim/compound/forceClaim 后生效）。各自只结算并支付对应池的 `rewards`（均为 TokenB）。

```solidity
require(!paused, "PAUSED");
require(!emergencyMode || shutdownMode, "EMERGENCY_MODE");
require(block.timestamp >= lastClaimTime[msg.sender] + claimCooldown, "COOLDOWN");
// _updateGlobalX(); _settleUserX(msg.sender);
require(badDebtA == 0 && badDebtB == 0, "BAD_DEBT_EXISTS"); // 任一池坏账则两池标准 claim 均阻断
uint256 reward = rewardsX[msg.sender];
require(reward >= minClaimAmount, "BELOW_MIN_CLAIM");
// 支付后：rewardsX[user]=0; totalPendingX -= reward; bookedUserRewardsX -= reward;
emit Claimed(user, paidA, paidB, timestamp);  // 单池路径另一侧为 0

```

**`forceClaimAll()`：跨池领取 / 坏账逃生舱**

> **UX 指引**：正常态下各池须满足与单池 claim 相同的 **`minClaimAmount`（按池、不可相加凑门槛）**；仅在 **`shutdownMode`** 或 **任一侧 `badDebt > 0`** 时放宽最小额并允许按物理流动性部分兑付。前端在健康态应引导 `claimA`/`claimB`，坏账或停机离场时再引导 `forceClaimAll`。

```solidity
function forceClaimAll() external nonReentrant {
    require(!paused, "PAUSED");
    require(!emergencyMode || shutdownMode, "EMERGENCY_MODE");
    require(block.timestamp >= lastClaimTime[msg.sender] + claimCooldown, "COOLDOWN");

    // 必须先更新全局状态并结算个人收益，才能拿到准确的 rA / rB（CEI 前置）
    _updateGlobalA(); _updateGlobalB();
    _settleUserA(msg.sender); _settleUserB(msg.sender);

    uint256 rA = rewardsA[msg.sender];   // ← 声明必须在 settle 之后
    uint256 rB = rewardsB[msg.sender];
    require(rA + rB > 0, "NOTHING_TO_CLAIM");

    // 正常态：有奖励的每一池均须 >= minClaimAmount（与 claimA/claimB 一致，禁止两池各低于门槛却相加通过）
    if (!shutdownMode && badDebtA == 0 && badDebtB == 0) {
        if (rA > 0) require(rA >= minClaimAmount);
        if (rB > 0) require(rB >= minClaimAmount);
    }
    
    // 清算策略：仅隔离硬性锁定资金（Pool B 本金 + 未提手续费）。
    // 不再隔离 availableRewards / dust，因为该入口只在停机或坏账下开放；
    // 此时已确权用户奖励优先于未来预算，兑付顺序为 Pool A -> Pool B。
    uint256 balanceB = rewardTokenB.balanceOf(address(this));
    uint256 lockedB = totalStakedB + unclaimedFeesB;
    uint256 remain = balanceB > lockedB ? balanceB - lockedB : 0;
    
    uint256 payA = Math.min(rA, remain);
    remain -= payA;
    uint256 payB = Math.min(rB, remain); 

    // 计算用户自愿放弃（未偿还）的债务额度
    uint256 unpaidA = rA - payA;
    uint256 unpaidB = rB - payB;

    rewardsA[msg.sender] = 0; totalPendingA -= rA; bookedUserRewardsA -= (payA + unpaidA);
    rewardsB[msg.sender] = 0; totalPendingB -= rB; bookedUserRewardsB -= (payB + unpaidB);
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
uint256 forfeited = rewardsA[user];  // 事件字段 rewardsForfeited 快照

userStakedA[user] = 0;
totalStakedA -= principal;
rewardsA[user] = 0;
bookedUserRewardsA -= forfeited;

if (totalPendingA >= forfeited) totalPendingA -= forfeited;
availableRewardsB += forfeited;

stakingTokenA.safeTransfer(user, principal);
emit EmergencyWithdrawn(user, principal, forfeited, Pool.A, block.timestamp);
// 豁免 _assertInvariantB() 的 revert，仅 emit 事件

```

---

## 6. 奖励通知与治理预算调拨

### 6.1 手续费与罚金流向表

| 场景 | Token 类型 | 费率 | 罚金/费用去向 |
| --- | --- | --- | --- |
| WithdrawA（正常） | TokenA | **0**（无锁、无本金费） | 本金全额转回用户；**无** `penaltyfeeBP` / `withdrawFeeBP` 分支 |
| EmergencyWithdrawA | TokenB（已确权未领奖励部分） | 按负债安全核销 | 核销部分记入 **`availableRewardsB`**（跨池预算回流；非正常提款） |
| WithdrawB (本金罚金) | TokenB | `penaltyfeeBP` | **`availableRewardsB`** (留在合约) |
| WithdrawB (没收奖励) | TokenB | 全部没收 | **`availableRewardsB`** (留在合约) |
| Mature Withdraw（仅 B） | TokenB | `withdrawFeeBP` / `midTermFeeBP` / 0（按持仓阶梯） | **`unclaimedFeesB`** (留存在合约，待提取) |

> **业务说明：与「Pool A 无锁无费」一致的路由**
> 正常 **`withdrawA` 不没收、不外转** 与 Pool A 相关的 TokenB 奖励；用户通过 **`claimA`** 领取 Pool A 奖励。仅在 **`emergencyWithdrawA`** 等紧急路径下，为保全本金退出，可能将已确权未领的 TokenB 奖励按实现核销并回流至 **`availableRewardsB`**，与 Pool B 预算联动。

### 6.2 奖励注入 notifyRewardAmountX

**前置条件**

```solidity
require(!shutdownMode, "SHUTDOWN");
require(amount > 0, "ZERO_AMOUNT");
// effectiveDuration：若调用方传入 duration == 0，则使用 poolX.rewardDuration（须已由 Admin 设在 [MIN_REWARD_RATE_DURATION, MAX_DURATION] 内；0 表示未设默认则 revert）
uint256 effectiveDuration = duration == 0 ? poolX.rewardDuration : duration;
require(effectiveDuration >= MIN_REWARD_RATE_DURATION && effectiveDuration <= MAX_DURATION, "DURATION_ERR");

```

**执行步骤（防御 FOT 变种 CEI）**

> **架构声明**：为了原生支持具有 FOT (Fee On Transfer) 机制的 TokenB，本函数刻意采用 `Check → Interaction → Effects` 的变种 CEI 顺序。外部调用的安全性完全由 `nonReentrant` 锁保证，且部署期的 TokenA 白名单已将 ERC777 钩子阻绝于门外。

> **`MAX_REWARD_RATE_X` 上界**：须使用部署时一次性写入的 **`maxTotalSupplyBForRewardRateCap`**（见 §3.1）按附录公式推导。**禁止**使用 `notifyRewardAmount*` 执行时的动态 `rewardTokenB.totalSupply()` 作为上界——后者会随增发/销毁漂移，合约实现采用固定 cap **更利于审计与边界稳定**。

```solidity
// 1. 先结算旧周期，固化已产生的债务
_updateGlobalX();

// 2. Synthetix 标准剩余预算计算
uint256 leftover = 0;
// 开发者注意：必须使用 lastUpdateTimeX 而非 block.timestamp，防止 double-count！
// 因为 _updateGlobalX() 已经安全推进了时间锚点。
uint256 remaining = periodFinishX > lastUpdateTimeX ? periodFinishX - lastUpdateTimeX : 0;
leftover = remaining * rewardRateX;
// 空池跑完一整窗后 availableRewards 可能滞留：若 now >= periodFinish，carryStranded = availableRewards（NotifyRewardLib）
uint256 carryStranded = (periodFinishX > 0 && block.timestamp >= periodFinishX) ? availableRewardsX : 0;

// 3. Interaction: 先转账验证真实到账资金
uint256 balBefore = rewardTokenB.balanceOf(address(this));
rewardTokenB.safeTransferFrom(msg.sender, address(this), amount);
uint256 actualAmount = rewardTokenB.balanceOf(address(this)) - balBefore;
require(actualAmount > 0, "ZERO_TRANSFER");

// 4. 计算新速率 (防稀释)
uint256 newRate = (actualAmount + leftover + carryStranded) / effectiveDuration;
// MAX_REWARD_RATE_X 由 maxTotalSupplyBForRewardRateCap 与 MAX_APR_BP 推导（§3.1 / 附录 A），非 totalSupply()
require(newRate <= MAX_REWARD_RATE_X, "RATE_EXCEEDS_MAX"); // 速率硬顶保护

// 5. Effects: 更新周期与状态
rewardRateX = newRate;
periodFinishX = block.timestamp + effectiveDuration;
lastUpdateTimeX = block.timestamp;
availableRewardsX += actualAmount;  // carryStranded 已并入 rate 计算，不重复加账

_assertInvariantB();
emit RewardNotified(Pool.X, actualAmount, effectiveDuration, newRate); 

```

### 6.3 治理 Setter 接口 (Admin Only)

必须实现以下函数以消耗事件定义。合约层为 **`onlyRole(ADMIN_ROLE)`**（及 `nonReentrant` 等）；**生产环境**下须由 **`TimelockController` 在达到 `minDelay`（例如 ≥48h）后** 调用治理门面再触发 Core（见 **§2.1.1**）。伪代码中的 `timelocked(48 hours)` **仅表示产品级延迟要求**，**不**表示在 Core 上实现同名修饰符。

* `rebalanceBudgets(Pool from, Pool to, uint256 amt)`: `require(badDebtA == 0 && badDebtB == 0)`；目标池在活跃排放窗内须触发 **`reanchorOnBudgetInjection`**（`applyCappedRateForRemainingWindow`），触发 `BudgetRebalanced`。
* `claimFees()`: Admin 提取 `unclaimedFeesB`，提取后清零，外转 TokenB。
* `setTVLCapX(uint256 cap)`: 触发 `TVLCapUpdated`。
* `setMinStakeAmountX(uint256 amt)`: 触发 `MinStakeAmountUpdated`。
* `setRewardDurationA(uint256 duration)` / `setRewardDurationB(uint256 duration)`：`duration == 0` 清除默认；否则须在 `[MIN_REWARD_RATE_DURATION, MAX_DURATION]`；供 `notifyRewardAmount*(amount, 0)` 使用；触发 `RewardDurationUpdated`。
* `setMinClaimAmount(uint256 newAmount)`  
  - Admin Only；**≥48h** 由 Timelock 调度落实  
  - `require(newAmount <= MAX_MIN_CLAIM_AMOUNT)`  
  - 用于调整 Claim 的最小金额限制，防止 dust 攻击或 gas griefing  
  - 触发 `MinClaimAmountUpdated(oldValue, newValue, timestamp)`
```solidity
function setMinClaimAmount(uint256 newAmount)
    external
    onlyAdmin
    nonReentrant
{
    // 产品级 ≥48h 延迟由 TimelockController + 治理门面执行路径保证，非本函数内嵌修饰符。
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

* **激活**：前提是 `emergencyMode == true`，经 **Timelock 调度后的 Admin 路径**激活（延迟 **≥48h**，由 `TimelockController.minDelay` 落实）。
* **僵尸死锁防护**：引入超时清算机制扫除一切残余以维持不变量：

```solidity
// 僵尸死锁旁路常量：Shutdown 激活满 3 年后可无视 totalStaked 强制清算
uint256 public constant SHUTDOWN_DEADLOCK_BYPASS = 1095 days;

function forceShutdownFinalize() external onlyAdmin {
    require(shutdownMode, "NOT_SHUTDOWN");
    // 必须在 Shutdown 开启 365 天后才能强制清算（宽限期保障用户退出）
    require(block.timestamp >= shutdownAt + 365 days, "GRACE_PERIOD_NOT_MET");

    // 安全阻断：确保所有用户的本金已被提走
    // 例外：Shutdown 满 3 年后（SHUTDOWN_DEADLOCK_BYPASS），即便仍有未提取本金
    // 也允许强制清算，防止少数失联用户永久锁死整个协议的残余预算
    if (block.timestamp < shutdownAt + SHUTDOWN_DEADLOCK_BYPASS) {
        require(totalStakedA == 0 && totalStakedB == 0, "STILL_STAKED");
    }

    // 保留用户仍可 claim 的 pending：无剩余质押时裁到 bookedUserRewards；
    // deadlock bypass 后仍有质押时，未逐用户 settle 的 pending 仍需保留
    require(bookedUserRewardsA <= totalPendingA && bookedUserRewardsB <= totalPendingB, "BOOKED_EXCEEDS_PENDING");
    uint256 orphanA = totalPendingA - bookedUserRewardsA;
    uint256 orphanB = totalPendingB - bookedUserRewardsB;
    bool hasRemainingStake = totalStakedA != 0 || totalStakedB != 0;

    uint256 residual = availableRewardsA + availableRewardsB + unclaimedFeesB + dustA + dustB;
    if (!hasRemainingStake) residual += orphanA + orphanB;

    if (!hasRemainingStake) {
        totalPendingA = bookedUserRewardsA;
        totalPendingB = bookedUserRewardsB;
    }
    availableRewardsA = 0; availableRewardsB = 0;
    unclaimedFeesB = 0;
    dustA = 0; dustB = 0;

    if (residual > 0) rewardTokenB.safeTransfer(feeRecipient, residual);
    emit ProtocolShutdownComplete(block.timestamp);
}
```

> **语义**：无剩余质押本金时，`orphan` pending 与预算残渣 sweep 至 `feeRecipient`，并将 **`totalPending` 裁至 `bookedUserRewards`**；若 deadlock bypass 后仍有质押者，`orphan` pending 不 sweep、不裁剪，保留给剩余用户后续 `withdraw` settle 与 `claimA`/`claimB`（与链上 `StakingAdminLib.executeForceShutdownFinalize` 一致）。

### 7.5 resolveBadDebt（坏账物理修复）

> **治理策略声明 (Cross-pool Injection)**：`resolveBadDebt` 操作中修复坏账后如果仍有多余的 TokenB 资金注资（`rem > 0`），这笔溢出的资金将被强制并入 `availableRewardsB`。这是协议经济模型的**刻意设计选择**，旨在利用坏账修复期反哺 Pool B 的核心长期复投者，**并非跨池会计错误**。

```solidity
function resolveBadDebt(uint256 amount) external onlyAdmin nonReentrant {
    // ≥48h：由 TimelockController 调度，非本函数修饰符。
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
    // 必须保护本金、待付负债、预算、手续费与粉尘桶（与 _assertInvariantB required 一致）
    uint256 required = totalStakedB + totalPendingA + totalPendingB
                      + availableRewardsA + availableRewardsB + unclaimedFeesB + dustA + dustB;
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
event EmergencyWithdrawn(
    address indexed user, uint256 principal, uint256 rewardsForfeited, Pool indexed pool, uint256 at
);

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

**`EmergencyWithdrawn` 字段说明（与合约一致）**：`principal` 为退回的本金（A 池为 TokenA wei，B 池为 TokenB wei）；`rewardsForfeited` 为该池上紧急退出前用户已计提、本次被清零的奖励（`userInfo*.rewards` 快照，A/B 均为对应池奖励代币 wei），供链下监控统计没收量。

### 8.2 自定义错误定义

```solidity
error ContractPaused();
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
error BookedRewardsExceedPending();
error NoRewardsToClaim();
error ZeroRewardRate(uint256 mergedBudget, uint256 duration);
error StillStaked();

```

> **部署角色交接（`script/DualPoolStaking.s.sol`）**：部署后将 `ADMIN_ROLE` 与 `DEFAULT_ADMIN_ROLE` 授予 `DualPoolStakingAdmin` 并从 deployer 撤销；Admin 门面 `owner` 转至 `TimelockController`；`OPERATOR_ROLE` 保留在运维热钱包（`pause` / `notify` / `enableEmergencyMode` 不经 Timelock）。

---

## 9. 边界场景分析汇总

| 场景 | 处理规则与底层逻辑 |
| --- | --- |
| **空池首笔注入** | 采用 **Re-anchor（重锚）算法**。不推延周期，首位用户进入时按剩余预算重算 `rewardRate`（`min(available/remainingTime, MAX_REWARD_RATE_X)`），防止 APR 被前期空置时间稀释，同时封堵短窗口超高瞬时 APR（含闪电贷抢首笔、池子清零后再首笔）。 |
| **巨鲸追加仓位** | 取 `max(oldUnlock, now+lockDuration)`。大额资金追加无法压缩原有解锁时间，强制遵守锁定期限。 |
| **WADP 与 Lock 差异** | 属故意设计：提现费率由 WADP 加权更新（平滑后退），而锁定周期受 `Rolling Lock` 约束全额延长。 |
| **CompoundB 豁免 Cap** | 复投产生的增加不占用 TVL Cap 配额限制，防止池子接近饱满时直接卡死用户的自动复投。 |
| **Pause + Emergency** | **Emergency 优先级最高**。只要 `emergencyMode == true`，`emergencyWithdrawA/B` 就必须可用，无视 `paused` 状态。 |
| **WithdrawB 罚金闭环** | TokenB 产生的 Early Exit 罚金与没收奖励**绝对不对外转账**，直接原路路由至 `availableRewardsB`，维持 TokenB 物理与逻辑不变量。 |
| **坏账期 Claim** | `claimA`/`claimB` 在任一侧 `badDebt > 0` 时阻断；`forceClaimAll()` 允许按物理残值部分兑付，并按重叠部分核减 BadDebt。 |
| **`bookedUserRewards` 对账** | 各池 `booked ≤ totalPending`；finalize 时若无剩余质押，`orphan = totalPending - booked` 并入 residual；若 deadlock bypass 后仍有质押，orphan pending 保留；`booked > totalPending` → `BookedRewardsExceedPending`。 |
| **过期窗滞留预算** | `periodFinish` 已过且 `availableRewards > 0`：用户侧 `RewardReanchorLib`；运维侧下次 `notify` 的 `carryStranded`。 |
| **WADP 取整** | `PoolBWadpLib` 使用 **Ceil**，防止 floor 叠加导致提前进入低提现费档。 |
| **奖励预算不足** | 触发 `_updateGlobalX` 时若余额不足，必须显式记录 `badDebtX` 并 emit 告警，**严禁静默截断**。 |
| **Bad Debt 期间复投** | `CompoundB` 强制 `require(badDebt == 0)`，防止系统在资不抵债时允许用户将“虚假负债”转化为“真实本金”。 |
| **僵尸粉尘死锁** | Shutdown 开启 365 天后，且在所有质押本金已提走的先决条件下，Admin 有权调用 `forceShutdownFinalize` 清空残值。 |
| **防零罚金漏洞** | 若设置了 `penaltyfeeBP`（**仅 Pool B** Early Exit），则 `minEarlyExitAmountB` 必须满足计算出的罚金 $\ge 1 \text{ wei}$，防止利用整除截断零成本逃逸。 |
| **ERC777 绕过 CEI** | 部署期：TokenA / TokenB 不得为带 ERC777 钩子的资产；链上在 ERC1820 可用时对 **Core、TokenA、TokenB** 做接口实现者探测（见 §2.2）。 |

---

## 附录 A：关键公式汇总

| 公式用途 | 表达式说明 |
| --- | --- |
| **有效时间窗口** | $t_{Applicable}=\min(\text{block.timestamp},periodFinishX)$ |
| **时间差上限** | $deltaTime=\min(tApplicable-lastUpdateTimeX,MAX\_DELTA\_TIME)$ |
| **收益指数更新** (防溢出) | $accX=accX+\text{mulDiv}(rewardRateX \times deltaTime,PRECISION,totalStakedX)$ |
| **用户已赚奖励** | $Earned=\text{mulDiv}(userStakedX,accX-userRewardPaidX,PRECISION)$ |
| **Rolling Lock** (大值覆盖) | $unlockTime=\max(oldUnlock,\text{block.timestamp}+lockDuration)$ |
| **WADP 费率计时** (防套利) | $T_{new}=\left\lceil\frac{(Staked_{old} \times T_{old})+(Amount_{new} \times Now)}{Staked_{old}+Amount_{new}}\right\rceil$（`PoolBWadpLib`，Ceil） |
| **新奖励速率** (notify) | $rewardRate=\frac{actual+leftover+carryStranded}{effectiveDuration}$；`duration==0` → `effectiveDuration=pool.rewardDuration` |
| **过期窗重锚** (stake/compound) | `remainingTime==0` 且 `availableRewards>0` → `RewardReanchorLib.reanchorStaleSchedule` |
| **活跃窗重锚** (首笔进池 / 预算注入) | `remainingTime>0` 且预算需重排 → `rawRate=availableRewards/remainingTime`，`rewardRate=min(rawRate, MAX_REWARD_RATE_X)`（`applyCappedRateForRemainingWindow` / `reanchorOnBudgetInjection`） |
| **停机 orphan** | $orphan_X=totalPending_X-bookedUserRewards_X$；无剩余质押 finalize 后 $totalPending_X \leftarrow bookedUserRewards_X$；deadlock bypass 仍有质押时不裁剪 $totalPending_X$ |
| **Early Exit 罚金（Pool B）** | $Penalty=\frac{Amount \times penaltyfeeBP}{10000}$ |
| **minEarlyExit 约束** (防零，Pool B) | $minEarlyExitAmountB \ge \lceil \frac{BASIS\_POINTS}{penaltyfeeBP} \rceil$ |
| **TokenB 终极不变量** (防死锁) | $BalanceB+BadDebt_{A+B}+DUST\_TOLERANCE \ge TotalStakedB+TotalPending_{A+B}+AvailableRewards_{A+B}+UnclaimedFeesB+Dust_{A}+Dust_{B}$ |
| **dustX 监控累计** (还原精度) | $dustX=dustX+(\text{mulmod}(\text{deltaRewardX}, \text{PRECISION}, \text{totalStakedX}) / \text{PRECISION})$ |
| **最大速率约束** (上限保护) | $MAX\_REWARD\_RATE\_X=\frac{\text{maxTotalSupplyBForRewardRateCap} \times MAX\_APR\_BP}{10000 \times SECONDS\_PER\_YEAR}$（构造函数写入的 cap；**非** `notify` 时刻 `totalSupply()`） |
| **Excess TokenB 可回收量** | $Excess=BalanceB-(TotalStakedB+TotalPending_{A+B}+AvailableRewards_{A+B}+UnclaimedFeesB+Dust_{A}+Dust_{B})$（与 §2.2 / §7.6、`recoverToken` 链上一致） |
| **Shutdown 有序退出检查** | require(!emergencyMode 或 shutdownMode) |

---

## 10. 上线前风险假设与验收清单

本节列出合约无法单方面消除、但生产上线前必须由治理、运营、前端和监控共同承认并落实的风险假设。任何一项不满足，都应视为上线阻断项或降级上线项。

### 10.1 必须写入上线公告/审计范围的风险假设

| 假设 | 必须满足的上线条件 | 失效后的影响 |
| --- | --- | --- |
| **治理密钥安全** | `DEFAULT_ADMIN_ROLE`、Timelock proposer/executor、Admin 门面 owner 必须由多签/Timelock 控制；模块替换、超级权限变更延迟建议 ≥72h。 | 可替换 delegatecall 模块或重配关键权限，等价于协议升级/接管风险。 |
| **模块地址有效性** | `setUserModule` / `setAdminModule` 目标地址必须为已部署合约，并在上线记录中保存 bytecode hash、源码版本、部署交易。 | delegatecall 到错误模块会导致入口异常、交易空执行或状态破坏。 |
| **Operator 热权限边界** | `OPERATOR_ROLE` 仅用于 `pause`、`enableEmergencyMode`、`notifyRewardAmount*`；不得同时持有 Admin/Super 权限；地址应独立于治理门面。 | 热钱包被盗可暂停、进入紧急模式或注入异常奖励预算。 |
| **TokenA/TokenB 类型限制** | TokenB 必须 18 decimals；TokenA 与 TokenB 不得是 ERC777 钩子资产；不支持 rebasing、黑名单、恶意 `balanceOf`、回调型或可阻断转账资产。 | 不变量、真实入账、奖励分配或退出路径可能失真或被阻断。 |
| **FOT TokenB 出账税费由用户承担** | 前端与公告必须展示合约转出 gross、用户预计到手 net、最大税费保护 `maxTransferFeeBP`；链上账本按 gross 核销。 | 用户实际到账少于 claim/withdraw 账面金额，属于代币税费经济结果而非协议补贴项。 |
| **长时间无人交互的奖励结算** | 所有会影响奖励预算、用户份额、领取、退出、重排期、坏账修复和停机的入口必须先 catch-up 到 `min(block.timestamp, periodFinish)`，不能只推进一次 `MAX_DELTA_TIME`。 | 旧周期奖励可能被新用户分走、重复排期、跳过确权或产生非预期坏账。 |
| **BadDebt 修复路径资金来源** | 生产路径中 `resolveBadDebt` 的付款人必须能真实向 Core 转账/授权；若通过治理门面调用，必须由门面持币或采用先转入/专用 payer 设计。 | 坏账无法修复，`recoverToken`、预算调拨等依赖无坏账的治理操作被永久阻断。 |
| **Shutdown 终态语义** | `forceShutdownFinalize` 是防死锁终态工具，调用前必须完成全局 catch-up；无剩余质押时清扫 residual/orphan，deadlock bypass 仍有质押时保留 orphan pending 给后续 settle/claim。 | 若前端/公告仍按“一律清扫 orphan”解释，会误导留仓用户对可领取奖励的预期。 |
| **forceClaimAll 部分兑付顺序** | 坏账/停机下允许按物理余额部分兑付；链上只保护 Pool B 本金与未提手续费，不保护 `availableRewards` 等未来预算；A/B 池兑付顺序与 unpaid 事件是既定政策，前端必须清晰展示。 | 用户可能误以为所有池子等比例兑付，或误以为未来预算仍被隔离，导致争议。 |
| **链下监控依赖** | 监控必须覆盖 `InvariantViolated`、`InsufficientBudget`、`BadDebtResolved*`、`OutboundTransfer`、pause/emergency/shutdown、rewardRate/availableRewards 异常。 | 异常会计状态无法被及时发现，治理响应滞后。 |

### 10.2 上线前必须调整/确认的实现项

1. **全入口 catch-up 规则**
   `stake*`、`notifyRewardAmount*`、`rebalanceBudgets`、`resolveBadDebt` 余款重排期、`forceShutdownFinalize`、`claim*`、`withdraw*`、`emergencyWithdraw*`、`compoundB`、`forceClaimAll` 必须统一使用 catch-up 语义：当旧周期已经过期时，应循环推进到 `periodFinish`，再执行会改变用户份额、预算或终态的逻辑。

2. **活跃预算不可直接搬走**
   `rebalanceBudgets` 在移动预算前必须先结算源池和目标池，并禁止或正确重排正在排放中的源池预算。不得出现 `availableRewards` 被移走但 `rewardRate` 仍按旧计划继续扣减的状态。

3. **FOT 出账可观测性**
   出账路径必须记录 gross 与 net，用户承担税费，但协议必须让前端和索引器能证明差额来自 Token 税费，而不是协议少付。

4. **坏账修复生产路径**
   若 Timelock 通过 `DualPoolStakingAdmin` 门面调用 Core，则不能默认 Core 从 Timelock 拉款。上线前必须确认资金路径：门面持币并授权、先转入 Core 后核销、或调整接口传入真实 payer。

5. **模块升级校验**
   模块 setter 除非已在链上强制 `code.length > 0`，否则部署流程必须把“地址有代码、bytecode hash 匹配、角色延迟生效”作为上线脚本断言和多签检查项。

6. **前端风险展示**
   claim/withdraw/forceClaimAll 需展示 FOT gross/net、坏账下 partial payout、停机/紧急模式状态、Timelock 延迟、Operator 热权限说明，不得只展示理想到账金额。

### 10.3 生产监控阈值

| 指标 | 触发动作 |
| --- | --- |
| `badDebtA > 0 || badDebtB > 0` | 立即阻断 TokenB recover/rebalance 操作；准备 `resolveBadDebt`。 |
| `balanceB + badDebt + DUST_TOLERANCE < requiredB` | 触发 P0 告警，优先 pause，再评估 emergency。 |
| `block.timestamp > periodFinish` 且 `availableRewards > 0` | 标记为 stale schedule，下一次用户/运维入口必须完成 catch-up 或重锚。 |
| `rewardRate == 0 && availableRewards > 0 && periodFinish > block.timestamp` | 标记为 dust-like emission window，需要治理重排或等待下次 notify 合并。 |
| `OutboundTransfer.grossAmount > netReceived` | 前端/索引器展示 FOT 税费，若超过 `maxTransferFeeBP` 应回滚或告警。 |
| pause 超过 `UNPAUSE_COOLDOWN` | 检查 catch-up 完整性后才允许治理 unpause。 |
