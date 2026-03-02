# ERC-20 DeFi 复合奖励质押协议需求规格说明书

## 1. 文档概览 (Document Overview)

* **架构模式**：平行双池 (Parallel Dual-Pool)。
* **Pool A (基础池)**：质押 Token A → 产出 Token B。
* **Pool B (收益池)**：质押 Token B → 产出 Token B（复利池）。
* **核心原则**：本金记账独立、收益确权线性化（负债模型）、时间加权防套利、紧急出口优先级最高。
* **放大因子**：固定为 `PRECISION = 1e18`，用于抵消 Solidity 整数除法精度损失（先乘后除，向下取整）。

> **补充（明确系统级约束 · 必须）**
>
> 1. **发放周期语义**：奖励的“释放（budget → pending）”由 `_updateGlobalX()` 驱动，属于“惰性结算”。因此所有会改变用户/池状态的入口函数必须统一走 `updateReward(user)`（或等价 modifier）。
> 2. **Token 标准兼容**：所有 ERC20 转账必须使用安全封装（兼容 `return false`/无返回值/USDT 风格）。PRD 层面要求：实现需使用 `SafeERC20`。
> 3. **重入模型**：所有涉及外部 ERC20 transfer 的函数必须符合“先写状态、后转账”的顺序，并配合 `nonReentrant`（尤其 claim/withdraw/earlyExit/emergencyWithdraw）。

> **补充（全局不变量检查点 · 必须）**
>
> * `_assertInvariantB()` 必须在以下入口的“状态更新完成后、外部 TokenB 转账前/后”按要求执行（实现可选择前后各一次，但不得缺失）：
>   `stakeB`、`compound`、`claim`、`withdrawB`、`earlyExitB`、`notifyRewardAmountA/B`、`recoverToken(TokenB)`、`resolveBadDebt`、`shutdown` 相关资产回收动作。
> * 非 Emergency 模式下，任何一次 `_assertInvariantB()` 不满足必须 revert。
> **补充（【2026-03-02 新增】updateReward 调用顺序约束 · Critical · 必须）**
>
> * 为防止“新增本金参与历史收益计算”导致奖励被放大，所有会改变 `userStakedX/totalStakedX` 的入口必须严格按序：
>
>   1. `updateReward(user)`（固化旧本金对应收益）
>   2. 执行所有 `require` 校验
>   3. 修改本金账本（stake/withdraw/compound 引起的本金变动）
>   4. 执行任何外部 transfer
>   5. 执行 `_assertInvariantB()`（按要求前/后各一次或至少一次）
> * **禁止**：先修改 `userStakedX/totalStakedX` 再调用 `updateReward(user)`。

> **补充（【2026-03-02 新增】外部交互统一顺序 · Critical · 必须）**
>
> * 所有包含外部 ERC20 transfer 的函数（含罚金/手续费/forfeit 转出）必须遵循统一顺序：
>
>   1. `updateReward(user)`
>   2. 所有 `require` 校验
>   3. 完成所有 state writes（含 user rewards 清零、pending 核减、stake/unstake 记账）
>   4. 执行外部 transfer（本金 net、fee/penalty、forfeitedReward）
>   5. 执行 `_assertInvariantB()`
> * **禁止**：transfer 后再写任何会计/余额状态。

> **补充（【2026-03-02 新增】数学溢出保护总约束 · Critical · 必须）**
>
> * 为防止 `rewardRate * deltaTime * PRECISION` 溢出，实现必须确保：
>
>   * `MAX_REWARD_RATE_X * MAX_DELTA_TIME * PRECISION <= type(uint256).max`
>   * `notifyRewardAmountX` 内必须强制 `rewardRateX <= MAX_REWARD_RATE_X`，不满足 revert。

> **补充（【2026-03-02 新增】Token 类型约束 · 必须）**
>
> * 为保证会计不变量与“余额=债务覆盖”语义成立，本协议默认 **不支持** 以下 Token 作为 TokenA/TokenB：
>
>   * Rebase / Elastic Supply（余额自动变化）
>   * ERC777 或带回调 hook 的 token（可能重入）
> * TokenA 允许 FOT（已按净入账处理）。TokenB 若为 FOT，必须同样按净入账并确保不变量语义不被破坏；若无法保证则禁止。

---

## 2. 项目范围与角色定义 (Scope & Roles)

### 2.1 角色与权限模型

* **Operator (运维员)**：

  * 可执行：`pause/unpause`、`notifyRewardAmountA/B`（奖励注入与速率设置）、`setMinStakeAmountA/B`、`setMaxTVLCapA/B`（可选）。
  * 约束：建议使用 **多签 / Timelock**，至少关键操作走 **48h Timelock**。
  * 责任：负责协议日常运维、奖励计划发布与续期（见 6.2.1 冷启动与注入流程）。

* **Admin (管理员/多签)**：

  * 可执行：`setFees`、`setFeeRecipient`、`setLockDuration`、`toggleEmergencyMode`、`setRewardProvider`（可选）、`recoverToken`（受限）。

  * 约束：**必须多签**，强制建议 Timelock。

  * 责任：配置风险参数上限、进入紧急模式、回收误转资产（严格限制）。

  > **recoverToken 受限规则（必须）**
  > 为防止管理员通过 recover 抽走用户本金/奖励资金导致坏账：
  >
  > * 默认只允许回收 **非 TokenA、非 TokenB** 的误转资产。
  > * 若确需回收 TokenB（例如用户误转、空投尘埃等），必须满足并校验：
  >   `excess = balanceB - (totalStakedB + totalPendingA + totalPendingB + availableRewardsA + availableRewardsB)`
  >   仅允许回收 `<= excess` 的部分，否则 revert。
  > * 不允许回收 TokenA（PoolA 本金），除非明确设计“关闭协议/清算”流程（本 PRD 不包含）。

  > **补充（recoverToken 与 shutdown 的关系 · 必须）**
  >
  > * `recoverToken(TokenB)` 在 `shutdownMode == false` 时必须遵循 “excess” 公式严格限制；不得以“停机/运维”为由放宽。
  > * `shutdownMode == true` 时仍必须遵循 “excess” 公式；不得触碰 `totalPendingA/B` 对应资金覆盖。

  > **补充（notifyRewardAmount 的权限边界 · 必须）**
  >
  > * `notifyRewardAmountA/B` 仅允许 Operator 调用，但 Reward Token 的资金来源属于 Reward Provider。
  > * 推荐做法：合约持有 `rewardProvider` 地址，要求 `notify` 前必须 `balanceB` 覆盖新增预算（见 6.2.1 的 budget check）。
  > * 若未来需要“第三方奖励方”，必须通过 allowlist 或 `setRewardProvider` 限定可注资主体，避免任意人注资造成前端/风控混乱。

* **User (用户)**：

  * 可执行：`stakeA`、`stakeB`、`withdrawA/B`、`claim`、`compound`、`emergencyWithdrawA/B`（**仅在 Emergency Mode**）。

> **（Pause vs Emergency 边界）**：
>
> * `pause` 是“临时风控”状态：允许用户继续走**标准 Claim/Withdraw**（不迫使放弃奖励）。
> * `emergencyMode` 是“终极逃生”状态：只允许 `emergencyWithdraw`，且放弃奖励。
> * **紧急提现仅在 `emergencyMode == true` 时允许**（见第 7.3）。
> **补充（【2026-03-02 新增】关键参数治理延迟 · 必须）**
>
> * 以下操作必须通过 Admin 多签 + Timelock（建议 `>= 48h`）：
>
>   * `setFees`
>   * `setFeeRecipient`
>   * `setLockDuration`
>   * `toggleEmergencyMode`
>   * `shutdown`
>   * `recoverToken(TokenB)`（若存在此能力）
> * 且必须 emit 事件，前端必须展示历史与当前生效版本。


### 2.2 资产与隔离机制

* **Token A (Staking Token)**：Pool A 质押资产。

* **Token B (Reward Token)**：Pool A/Pool B 的奖励资产；Pool B 的质押资产也是 Token B。

* **物理隔离（强制）**：本协议 **不支持 A == B**，以避免准备金/负债核算复杂化。

  * 构造函数必须执行：`require(address(stakingTokenA) != address(rewardTokenB), "A_EQ_B");`

* **奖励来源（冷启动前置条件）**：

  * Token B 由 **Reward Provider（项目方国库多签/金库）** 提供。
  * Operator 负责执行 `notifyRewardAmountA/B` 发布奖励计划（见 6.2.1）。

* **逻辑隔离（会计分仓）**：

  * Pool A 本金：`totalStakedA`
  * Pool B 本金：`totalStakedB`
  * Pool A/B 的奖励负债：`totalPendingA/B`
  * Pool A/B 的未释放预留：`availableRewardsA/B`

* **安全公式（TokenB 会计不变量）**：TokenB 的真实余额必须覆盖“本金 + 负债 + 预留”

  * `rewardTokenB.balanceOf(this) + dust >= totalStakedB + totalPendingA + totalPendingB + availableRewardsA + availableRewardsB`
  * `dust` 允许 1~2 wei（整数除法舍入）。

* **罚金/手续费资产类型（必须）**：

  * `withdrawA` 的 penalty/fee 以 **TokenA** 计价并转给 `feeRecipient`
  * `withdrawB` 的 penalty/fee 以 **TokenB** 计价并转给 `feeRecipient`
  * `feeRecipient` 必须能够接收两种 token（或在前端/运维层面保证可管理）

> **补充（TokenB 可用性约束 · 必须）**
>
> * 由于 TokenB 同时承担“奖励预算/负债/PoolB本金”，任何导致 `balanceB` 低于会计不变量的动作都必须 revert（除 Emergency 模式按 7.3 走坏账记录）。
> * **禁止**用 TokenB 的“余额差”推导奖励；必须严格依赖 `availableRewardsX/totalPendingX` 双账本（已在 3.2 定义语义）。

> **补充（TokenB 流动性挤兑防护 · 必须）**
>
> * 为防止 PoolB 本金提现挤兑影响奖励支付能力，以下约束必须存在：
>
>   1. **withdrawB（Early/Mature）**：执行对外转账前必须保证转账完成后仍满足会计不变量；且必须额外满足：
>      `balanceB_after >= totalPendingA + totalPendingB + dust`。不满足则 revert。
>   2. **claim**：在转账前必须检查 TokenB 实际余额足以完成本次支付，且支付后仍满足会计不变量。不满足则 revert。
>   3. **compound**：不发生对外支付但会增加 `totalStakedB`，因此完成结转后必须 `_assertInvariantB()`；不满足则 revert。
> * 非 Emergency 模式下，禁止使用“尽可能支付/尽可能提现”的隐式降级路径（claim 的 partial 仅限 pending 维度，见 5.4）。

> **补充（dust / 最小剩余限制 · 必须）**
>
> * `dust` 仅用于 **舍入误差容忍**（整数除法向下取整导致的 1~2 wei 偏差），不得作为绕过不变量的窗口。
> * 除 `dust` 外，不允许引入额外“容忍比例/容忍百分比”。
> * 用户本金侧不允许产生“最小质押以下残留”（见 5.3.1 的 dust / 最小剩余条款）。
> **补充（【2026-03-02 新增】forfeitedRecipient 回调风险防护 · 必须）**
>
> * 若 `forfeitedRecipient` 为合约地址，可能触发回调/重入风险（取决于 token 实现）。
> * 因此所有涉及 `forfeitedRecipient` 的转账必须在 state 更新后执行，并强制 `nonReentrant`。
> * 推荐治理层限制 `forfeitedRecipient` 为 EOA 或 allowlist 地址。
---

## 3. 全量状态变量与映射定义 (State Variables & Mappings)

### 3.1 核心资产与常量 (Constants & Assets)

| 变量名             | 类型        | 含义                       | 约束        |
| --------------- | --------- | ------------------------ | --------- |
| `stakingTokenA` | `IERC20`  | Pool A 质押资产              | Immutable |
| `rewardTokenB`  | `IERC20`  | Reward Token / Pool B 资产 | Immutable |
| `PRECISION`     | `uint256` | 放大因子 `1e18`              | 常量        |
| `PERCENT_BASE`  | `uint256` | BP 基数 `10000`            | 常量        |
| `MAX_DELTA_TIME` | `uint256` | 单次时间差上限 建议 30 days  | 常量        |
| `DUST`           | `uint256` | 不变量容忍误差 ≤ 10  |      常量        |
| `MAX_REWARD_RATE_A` | `uint256` | A池最大速率 | 常量        |
| `MAX_REWARD_RATE_B` | `uint256` | B池最大速率 | 常量        |
| `badDebtA` | `uint256` | A池坏账 |
| `badDebtB` | `uint256` | B池坏账 |
| `shutdownMode` | `bool`    | 停机模式 |
| `shutdownAt`   | `uint256` | 停机时间 |
| `forfeitedRecipient` | `address` | Early Exit 收益接收地址 |

> **新增（为解决溢出与极端时间差风险）**：
>
> * `MAX_DELTA_TIME`：`uint256`，建议 `30 days`。

> **新增（为紧急模式会计透明）**：
>
> * `badDebtA` / `badDebtB`：`uint256`，用于在 Emergency 模式下记录坏账差额（仅审计记录，不参与正常结算）。

> **新增（Early Exit 没收奖励会计归集）**
>
> * `forfeitedRecipient` 接收没收的 TokenB（可复用 `feeRecipient`）。

> **补充（rewardRate 上限常量 · 必须）**
>
> * 实现中必须包含 `MAX_REWARD_RATE_A / MAX_REWARD_RATE_B` 并在 `notifyRewardAmountX` 中强制 `rewardRateX <= MAX_REWARD_RATE_X`。

> **补充（dust 常量化 · 必须）**
>
> * `dust` 必须为合约层可读常量/配置（例如 `DUST = 2`），用于 `_assertInvariantB` 的统一误差容忍。
> * `dust` 不得被 admin 动态修改为大数；若可配置则必须有硬上限（例如 `<= 10` wei）。

> **补充（Shutdown 状态常量 · 必须）**
>
> * 为支持协议停机清算流程，实现必须包含：
>
>   * `bool shutdownMode`
>   * `uint256 shutdownAt`
> * `shutdownMode` 一旦开启，不允许关闭（不可逆）。
> **补充（【2026-03-02 新增】最小 Claim 限制 · 必须）**
>
> * 为防止 dust claim spam/事件刷屏/链上垃圾交易，必须新增：
>
>   * `uint256 minClaimAmount`
> * `claim` 必须 enforce：
>
>   * `require(payA + payB >= minClaimAmount, "CLAIM_TOO_SMALL");`

### 3.2 收益分发控制 (Global Reward States)

| 变量名                  | 类型        | 含义                  | 单位/备注       |
| -------------------- | --------- | ------------------- | ----------- |
| `rewardRateA`        | `uint256` | A池每秒释放奖励速率          | weiB/sec    |
| `rewardRateB`        | `uint256` | B池每秒释放奖励速率          | weiB/sec    |
| `periodFinishA`      | `uint256` | A池奖励周期结束时间          | timestamp   |
| `periodFinishB`      | `uint256` | B池奖励周期结束时间          | timestamp   |
| `lastUpdateTimeA`    | `uint256` | A池上次全局结算锚点          | timestamp   |
| `lastUpdateTimeB`    | `uint256` | B池上次全局结算锚点          | timestamp   |
| `accRewardPerTokenA` | `uint256` | A池全局每单位累计收益指数       | 放大 1e18     |
| `accRewardPerTokenB` | `uint256` | B池全局每单位累计收益指数       | 放大 1e18     |
| `totalStakedA`       | `uint256` | A池总质押本金             | weiA（FOT净额） |
| `totalStakedB`       | `uint256` | B池总质押本金             | weiB        |
| `availableRewardsA`  | `uint256` | A池未释放奖励预留金          | weiB        |
| `availableRewardsB`  | `uint256` | B池未释放奖励预留金          | weiB        |
| `totalPendingA`      | `uint256` | A池已释放但未领取的负债总额（总债务） | weiB        |
| `totalPendingB`      | `uint256` | B池已释放但未领取的负债总额（总债务） | weiB        |

> **会计语义说明**：
>
> * `availableRewardsX` 表示“未来可释放的奖励预算”（尚未确权）。
> * `totalPendingX` 表示“已释放确权但未支付的奖励负债”（必须可被支付）。
> * `_updateGlobalX()` 是“预算 → 负债”的唯一入口：将本次可释放金额从 `availableRewardsX` 迁移到 `totalPendingX`，并更新指数。
> * `claim/compound` 只能消费 `totalPendingX`，不得直接消费 `availableRewardsX`。

> **补充（预算不足的系统行为 · 必须）**
>
> * 若出现 `availableRewardsX < deltaRewardX`：必须 revert；不得部分迁移预算或按余额“降级释放”。

> **补充（rewardRate 修改语义依赖 · 必须）**
>
> * 所有 `rewardRateX/periodFinishX` 的修改，只允许通过 `notifyRewardAmountX`（或等价的“注入+重算”入口）完成；禁止提供 `setRewardRateX` 直接修改接口。
> **补充（【2026-03-02 新增】空池行为硬约束 · Critical · 必须）**
>
> * 当 `totalStakedX == 0` 时，必须满足：
>
>   * `deltaRewardX = 0`
>   * `availableRewardsX` 不变
>   * `totalPendingX` 不变
>   * `accRewardPerTokenX` 不变
> * 仅允许：
>
>   * `periodFinishX += deltaTime`
>   * `lastUpdateTimeX = tApplicable`
> * 目的：避免“空池时奖励预算被消耗”的严重实现错误。

> **补充（【2026-03-02 新增】rewardRate == 0 语义 · 必须）**
>
> * `rewardRateX == 0` 表示当前不释放奖励；
> * `_updateGlobalX()` 仅更新时间锚点（及空池顺延），不得迁移预算或增加负债。

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

> **补充（claimCooldown 的一致性 · 必须）**
>
> * `claimCooldown` 必须同时约束 `claim` 与 `compound`。
> * `withdraw` 不受 `claimCooldown` 影响。

### 3.4 费率与边界配置 (Fees & Configs)

| 变量名               | 类型        | 含义            | 默认值/约束                       |
| ----------------- | --------- | ------------- | ---------------------------- |
| `lockDuration`    | `uint256` | 基础锁定期（秒）      | 7 days（建议 Max 90d）           |
| `penaltyFeeBP`    | `uint256` | 强制解押罚金（BP）    | 1000 (10%)（**硬上限 Max 2000**） |
| `withdrawFeeBP`   | `uint256` | 短期到期提现手续费（BP） | 100 (1%)（**硬上限 Max 500**）    |
| `midTermFeeBP`    | `uint256` | 中期到期提现手续费（BP） | 50 (0.5%)（**硬上限 Max 500**）   |
| `minStakeAmountA` | `uint256` | A池最小质押量       | 防粉尘                          |
| `minStakeAmountB` | `uint256` | B池最小质押量       | 防粉尘                          |
| `maxTVLCapA`      | `uint256` | A池TVL上限       | 可配                           |
| `maxTVLCapB`      | `uint256` | B池TVL上限       | 可配                           |
| `claimCooldown`   | `uint256` | 领取/复利冷却时间     | 24 hours                     |
| `feeRecipient`    | `address` | 手续费/罚金接收地址    | Admin设定                      |
| `paused`          | `bool`    | 暂停状态          | -                            |
| `pausedAt`        | `uint256` | 暂停发生时间        | 用于平移周期                       |
| `emergencyMode`   | `bool`    | 紧急模式开关        | Admin                        |
| `MAX_PENALTY_BP`  | `uint256` | 最大罚金  |           | -                            |
| `MAX_WITHDRAW_BP` | `uint256` | 最大提现费 |          | -                            |
| `MAX_MIDTERM_BP`  | `uint256` | 最大中期费 |           | -                            | 
| `MAX_LOCK_DURATION` | `uint256` | 最大锁定期 |          | -                            |
| `unpauseCooldown` | `uint256` | 解锁冷却 |
| `unpauseAt`       | `uint256` | 解锁时间 |
| `minEarlyExitAmountA` | `uint256` | A最小退出 |
| `minEarlyExitAmountB` | `uint256` | B最小退出 |


> **（无上限费率漏洞 · Critical）**：
>
> * 必须定义常量并在 setter 强制校验：
>
>   * `MAX_PENALTY_BP = 2000`
>   * `MAX_WITHDRAW_BP = 500`
>   * `MAX_MIDTERM_BP = 500`

> **补充（lockDuration 上限 · 必须）**
>
> * `MAX_LOCK_DURATION = 90 days`，setter 必须 enforce。

---

## 4. 核心数学公式字段说明

### 4.1 全局收益累积指数公式 (Global Index)

用于在 **O(1)** 成本下滚动累计收益。

**有效时间截断：**

* `tApplicable = min(block.timestamp, periodFinishX)`
* `deltaTimeRaw = tApplicable - lastUpdateTimeX`
* **溢出保护（必须）**：`deltaTime = min(deltaTimeRaw, MAX_DELTA_TIME)`

**指数更新（仅 totalStakedX > 0 时）：**
$$L_{new} = L_{old} + \frac{R \times \Delta t \times 10^{18}}{T}$$

> **负债模型关键语义（必须）**：
>
> * `_updateGlobalX()` 内计算 `deltaRewardX = R * deltaTime`。
> * 必须执行：
>
>   * `require(availableRewardsX >= deltaRewardX, "INSUFFICIENT_AVAILABLE");`
>   * `availableRewardsX -= deltaRewardX;`
>   * `totalPendingX += deltaRewardX;`
> * 指数用 `deltaRewardX` 更新。

> **补充（lastUpdateTime 的更新规则 · 必须）**
>
> * `lastUpdateTimeX` 必须更新为 `tApplicable`（不是 now）。

### 4.2 加权平均滚动锁定公式 (Rolling Lock)

$$T_{new} = \text{now} + \frac{(V_{old} \times T_{rem}) + (V_{new} \times D)}{V_{old} + V_{new}}$$

> **补充（滚动锁定的边界 · 必须）**
>
> * `V_old == 0` 时直接 `unlockTime = now + lockDuration`。
> * withdraw 不应回溯缩短 unlockTime（只在新增仓位时更新 unlockTime）。

> **补充【2026-03-02 新增】lockDuration 变更的非追溯性条款（Non-Retroactive LockDuration）**
>
> **规则（必须）**：
> `lockDuration` 的修改 **仅作用于修改之后发生的新操作**（`stakeA/stakeB/compound`）。
> 对于已存在仓位：
>
> * `unlockTimeA[user]`、`unlockTimeB[user]` **保持不变**
> * 不允许因为参数变更而“追溯性延长/缩短”用户既有解锁时间
>
> **解释**：
> 用户在质押时形成的锁定预期属于协议契约的一部分。参数变更只能影响未来行为，不能改变历史承诺。

---

## 5. 详细功能需求定义 (Detailed Functional Requirements)

### 5.1 质押模块 (Stake A)

#### 5.1.1 操作步骤（必须按序）

1. **状态校验**：`require(!paused)` 且 `require(!emergencyMode)`
2. **参数校验**：

   * `require(amount >= minStakeAmountA)`
   * `require(maxTVLCapA == 0 || totalStakedA + amount <= maxTVLCapA)`
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

> **补充（StakeA 不应依赖 TokenB 的充足性 · 条款）**
>
> * StakeA 的入账不消耗 TokenB，但会触发 `updateReward` → `_updateGlobal`。若预算不足导致 `_updateGlobal` revert，则 stakeA 必须一并 revert（保持惰性结算一致性）。
> **补充（【2026-03-02 新增】shutdownMode 状态限制 · 必须）**
>
> * 若实现包含 `shutdownMode`（见 7.1），则在 `shutdownMode == true` 时必须禁止 `stakeA/stakeB/compound/notifyRewardAmountA/B`（对应章节已定义）。

---

#### 5.1.5 质押模块 (Stake B)

> 说明：StakeB 的结构与 StakeA 平行，但质押资产为 TokenB，且会影响 B 池 rolling lock 与计时器。

##### 5.1.5.1 操作步骤（必须按序）

1. **状态校验**：`require(!paused)` 且 `require(!emergencyMode)`
2. **参数校验**：

   * `require(amount >= minStakeAmountB)`
   * `require(maxTVLCapB == 0 || totalStakedB + amount <= maxTVLCapB)`
3. **收益确权**：`updateReward(user)`（固化 rewardsA/rewardsB；并滚动 `_updateGlobalA/_updateGlobalB`）
4. **入账**（TokenB 一般不需要 FOT 处理，但仍建议按净入账兼容）：

   * `balBefore = rewardTokenB.balanceOf(this)`
   * `transferFrom(user -> this, amount)`
   * `received = balAfter - balBefore`
   * `require(received > 0)`
5. **账本更新**：

   * `userStakedB[user] += received`
   * `totalStakedB += received`
6. **滚动锁定刷新**（只影响 B 池）：

   * `unlockTimeB[user] = rollingLock(unlockTimeB[user], userStakedB_before, received, lockDuration)`
7. **费率计时器重置**：

   * `stakeTimestampB[user] = now`
8. **不变量校验**：`_assertInvariantB()`
9. **事件**：`Staked(user, received, unlockTimeB[user], "B")`

##### 5.1.5.2 Failure Modes

* `paused == true`
* `emergencyMode == true`
* `amount < minStakeAmountB`
* `maxTVLCapB != 0 && totalStakedB + amount > maxTVLCapB`
* transferFrom 失败 / received==0
* `_updateGlobalX` budget 不足导致 revert

> **补充（StakeB 与会计不变量的关系 · 必须）**
>
> * StakeB 增加 `totalStakedB`，必须在完成后 `_assertInvariantB()`，确保 TokenB 真实余额覆盖新增本金。
> **补充（【2026-03-02 新增】StakeB 触发不变量校验不可省略 · 必须）**
>
> * `stakeB` 完成 `totalStakedB` 增加后必须执行 `_assertInvariantB()`，不得仅依赖“转账成功”判断。

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
5. **负债可用性校验（Critical）**：

   * `require(totalPendingA >= rA, "INSUFFICIENT_PENDING_A")`
   * `require(totalPendingB >= rB, "INSUFFICIENT_PENDING_B")`
6. **核销负债**：

   * `totalPendingA -= rA`
   * `totalPendingB -= rB`
7. **结转本金**：

   * `userStakedB[user] += (rA + rB)`
   * `totalStakedB += (rA + rB)`
8. **刷新 B池滚动锁定**（只影响 B）：

   * `unlockTimeB[user] = rollingLock(unlockTimeB[user], userStakedB_before, rA+rB, lockDuration)`
9. **重置 B池持仓计时器**：

   * `stakeTimestampB[user] = now`
10. **更新冷却时间**：`lastClaimTime[user] = now`
11. **不变量校验**：`_assertInvariantB()`
12. **事件**：`Compounded(user, rA, rB, unlockTimeB[user])`

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
* `totalPendingA < rA` 或 `totalPendingB < rB`

> **补充（与 Claim 的 partial 行为差异 · 必须）**
>
> * `compound` **不允许 partial**。若 `totalPendingX < rX` 必须 revert。
> * 原因：compound 会把奖励“变成本金”（提升提现优先级与风险面）。若在 pending 不足时允许转换，将再次形成“绕过债务模型”的跨池价值抽取通道。
> **补充（【2026-03-02 新增】badDebt 存在时禁止 compound · 必须）**
>
> * 当 `badDebtA > 0 || badDebtB > 0` 时：
>
>   * `compound` 必须 revert（避免把奖励转成本金扩大风险面）。

---

### 5.3 解押与提现 (Withdraw / Unstake)

> 提现分两类：
> ① **Early Exit（未到解锁时间）**：罚金 + 该池收益没收（见 5.3.2）
> ② **Mature Withdraw（到期）**：按持仓时长费率阶梯收取手续费
>
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
9. **事件**：`Withdrawn(user, amount, feeOrPenalty, isEarly, poolType)`

> **补充（Withdraw 的外部转账顺序 · 必须）**
>
> * 实现必须满足：
>
>   * 先完成所有账本扣减与奖励处理（含 pending 核减/forfeit 转出）
>   * 再进行 ERC20 transfer（本金 net、fee/penalty、forfeitedReward）
> * 并使用 `nonReentrant`。
>
> **补充（dust / 最小剩余限制 · 必须）**
>
> * 用户提现后若出现 `0 < userStakedX[user] < minStakeAmountX` 的“粉尘本金”，必须禁止留存。
> * 允许的实现策略（二选一，必须固定一种，前端明确提示）：
>
>   1. **硬 revert 策略**：若本次 withdraw 导致剩余本金落入 `(0, minStakeAmountX)`，则 revert。
>   2. **自动清仓策略（推荐）**：若剩余落入 `(0, minStakeAmountX)`，则将剩余本金作为同一笔提现的一部分一并提走（并按本次分支规则计算 fee/penalty）。
> * 不允许存在用户长期持有粉尘本金导致后续任何操作无法满足最小质押限制的状态。
>
> **补充（TokenB 挤兑保护在 withdrawB 的硬约束 · 必须）**
>
> * 针对 `withdrawB`，除 `_assertInvariantB()` 外，还必须确保“奖励负债优先级”不被本金提现侵蚀：
>
>   * 在执行对外转账前，必须保证：
>     `balanceB_after >= totalPendingA + totalPendingB + dust`
> * 若不满足，必须 revert。该约束用于防止用户通过集中提现 PoolB 本金导致系统无法支付已确权 pending。

---

#### 5.3.2 Early Exit 分支（会计处理）——按池隔离 + 防回流套利（Critical）

> **原则 1（跨池公平）**：Early Exit 只能影响“退出的那个池”的奖励，不得连带清空另一个池的奖励。
> **原则 2（防回流套利）**：Early Exit 没收的奖励不得回流 `availableRewardsX` 重新分配；应从合约余额中**真实转出**到 `forfeitedRecipient` 或 burn。
> **原则 3（负债一致）**：被没收的奖励来自 `rewardsX`（已确权负债），因此必须同步减少 `totalPendingX`，否则会计失真。

> **补充【2026-03-02 新增】零罚金绕过防护（Zero-Penalty Bypass Mitigation）**
>
> **问题（必须）**：
> 当 `amount` 很小时，`penalty = amount * penaltyFeeBP / 10000` 可能因整数除法向下取整得到 0，造成用户通过拆分小额 Early Exit 绕过罚金。
>
> **强制约束（必须）**：
>
> **方案：设置最小提前退出金额 `minEarlyExitAmountX`**
>
> * Early Exit 仅允许当：
>   `amount >= minEarlyExitAmountX`
> * 且必须满足：
>   `minEarlyExitAmountX >= ceil(10000 / penaltyFeeBP)`
>   以确保 `penalty >= 1`。
> * `minEarlyExitAmountA`、`minEarlyExitAmountB` 可分别配置（建议默认等于 `minStakeAmountA/B` 或更高）。
>

##### 5.3.2.1 触发与基本规则

* `isEarly = now < unlockTimeX[user]`
* Early Exit 可通过 `withdrawX(amount)` 自动触发，或提供显式函数 `earlyExitX(amount)`（推荐显式，便于前端提示风险）

> **补充（Early Exit 与 Mature Withdraw 的收益处理边界 · 必须）**
>
> * Early Exit：会没收“退出池”的确权奖励（rewardsX）并核减 totalPendingX。
> * Mature Withdraw：**不触碰 rewardsX**（收益可 later claim/compound）。
> * 该边界必须体现在代码路径上：不得在 withdraw 的公共逻辑里同时清理 rewardsA 与 rewardsB。

##### 5.3.2.2 Early Exit（Pool A）步骤（仅处理 A）

1. 读取并清零 **A 池**收益（仅 A）：

   * `rA = rewardsA[user]`
   * `rewardsA[user] = 0`
2. 核销 A 池负债（必须）：

   * `require(totalPendingA >= rA, "BAD_DEBT_A");`
   * `totalPendingA -= rA`
3. 截断快照（防回溯冒领）：

   * `userRewardPaidA[user] = accRewardPerTokenA`
4. 罚金（基于本次提现本金 amount，计价为 TokenA）：

   * `penalty = amount * penaltyFeeBP / PERCENT_BASE`
   * `net = amount - penalty`
5. **没收奖励的真实去向（必须真实转账，禁止回流）**：

   * `forfeitedA = rA`
   * 从合约余额中转出 TokenB：`rewardTokenB.transfer(forfeitedRecipient, forfeitedA)`（或 burn）
   * **禁止**：`availableRewardsA += rA`

> Pool A Early Exit 不得修改：`rewardsB[user]`、`totalPendingB`、`userRewardPaidB[user]`。

##### 5.3.2.3 Early Exit（Pool B）步骤（仅处理 B）

1. `rB = rewardsB[user]`；`rewardsB[user] = 0`
2. `require(totalPendingB >= rB, "BAD_DEBT_B"); totalPendingB -= rB`
3. `userRewardPaidB[user] = accRewardPerTokenB`
4. 罚金（基于本次提现本金 amount，计价为 TokenB）：

   * `penalty = amount * penaltyFeeBP / PERCENT_BASE`
   * `net = amount - penalty`
5. `forfeitedB = rB`，从合约余额中转出 TokenB：`rewardTokenB.transfer(forfeitedRecipient, forfeitedB)`（或 burn）
6. 禁止回流：`availableRewardsB += rB`（禁止）

##### 5.3.2.4 Failure Modes

* 任一 `totalPendingX < rX` 必须 revert（正常模式保持会计一致性）
* 不允许跨池清零（设计硬约束）
* `rewardTokenB.transfer(forfeitedRecipient, rX)` 失败必须 revert
* `penaltyFeeBP` 必须硬上限（见 3.4、6.1）

> **补充（为什么 Early Exit 要“真实转出”而不是“仅记账” · 必须）**
>
> * 若仅清零 rewards 并核减 pending，但不把 TokenB 从合约转出，则“没收奖励”在合约内部仍然存在，会被后续 claim/compound 间接消耗，形成隐性回流。
> * 因此没收奖励必须转出到外部接收方或 burn。

---

#### 5.3.3 Mature Withdraw 分支（阶梯费率）

步骤：

1. 费率计算依据：`tenure = now - stakeTimestampX[user]`

   * `tenure < 90d` → `feeBP = withdrawFeeBP`
   * `90d <= tenure < 180d` → `feeBP = midTermFeeBP`
   * `tenure >= 180d` → `feeBP = 0`
2. 手续费：

   * `fee = amount * feeBP / PERCENT_BASE`
   * `net = amount - fee`
3. Mature Withdraw **不清空 rewardsX**（收益与本金提现解耦，用户可 later claim/compound）

**Failure Modes**

* `amount > userStakedX`
* ERC20 transfer fail（net 或 fee 转账失败）

> **补充（StakeTimestamp 的更新一致性 · 必须）**
>
> * `stakeTimestampX` 仅在新增仓位（stake/compound）时重置。
> * Mature Withdraw 不应重置 `stakeTimestampX`。

> **补充（【2026-03-02 新增】withdrawB 的 pending 优先级保护标为 Critical · 必须）**
>
> * `withdrawB` 除 `_assertInvariantB()` 外，“奖励负债优先级保护”是强制硬约束：
>
>   * `balanceB_after >= totalPendingA + totalPendingB + dust` 不满足必须 revert。
> * 不允许任何“尽可能提现/按比例提现”的降级逻辑（非 Emergency）。

---

### 5.4 领取 (Claim) 流程

> Claim 只允许消费 **已释放负债 totalPendingX**。
> 不允许直接消耗 `availableRewardsX`（未释放预留金）。
>
> **一致性原则**：Claim 与 Compound 同级约束；Compound 已在 5.2 加入 `totalPendingX` 校验。

#### 5.4.1 操作步骤

1. **状态校验**：`require(!emergencyMode)`（Emergency 禁止）
2. **冷却校验**：`require(now >= lastClaimTime[user] + claimCooldown)`
3. **收益确权**：`updateReward(user)`
4. **计算可支付额度（Partial 支付规则）**：

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
9. **事件**：`Claimed(user, payA, payB, now)`

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

> **补充（Claim partial 行为定义 · 最重要 · 必须）**
>
> 1. **partial 的唯一原因**：仅允许由于 `totalPendingX` 不足导致的 partial。不得由于 `availableRewardsX` 不足而 partial（available 不可支付）。
> 2. **partial 的边界**：
>
>    * `payX = min(owedX, totalPendingX)` 必须作为唯一计算规则。
>    * 未支付部分必须保留在 `rewardsX[user]`，不得清零。
> 3. **禁止“跨池补贴支付”**：
>
>    * A池 owed 不得使用 B池 pending 支付，反之亦然。
> 4. **支付资金来源与实际余额检查（TokenB 挤兑防护 · 必须）**：
>
>    * 在执行 TokenB transfer 前必须检查：
>      `rewardTokenB.balanceOf(this) >= payA + payB`
>    * 且 transfer 后必须仍满足会计不变量（见 2.2）。
>    * 若不满足，必须 revert，不允许“尽可能转出”。
> 5. **partial 的可观察性（必须）**：
>
>    * `Claimed(paidA, paidB, ...)` 中 `paidA/paidB` 必须为实际支付值（可能小于 owed）。
>    * 前端必须能从事件与读取接口判断“本次为 partial”。
> 6. **partial 不等同于坏账**：
>
>    * `totalPending` 不足不写入 `badDebtX`。
>    * `badDebtX` 仅由 EmergencyWithdraw 路径产生（见 7.3）。
> 7. **partial 的系统约束**：
>
>    * 若系统处于 `shutdownMode == true`（见 7.1 shutdown 条款），claim 仍允许，但仍需按上述规则执行，不得绕过会计不变量。

> **补充（【2026-03-02 新增】最小领取金额 enforce · 必须）**
>
> * 若配置了 `minClaimAmount`，则在 `require(payA + payB > 0)` 后必须追加：
>
>   * `require(payA + payB >= minClaimAmount, "CLAIM_TOO_SMALL");`

---

## 6. 手续费与奖励速率管理 (Fees & Rates)

## 6.1 手续费衰减阶梯表

| 持仓时长 (T)            | 费率比例 (BP)  | 变量名             | 收益处理策略                                                                                                     |
| ------------------- | ---------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| `now < unlockTime`  | 1000 (10%) | `penaltyFeeBP`  | **仅清空退出池 rewardsX，核减 totalPendingX，并将 forfeitedReward 从合约余额转出到 forfeitedRecipient / burn（禁止回流 available）** |
| `unlock <= T < 90d` | 100 (1%)   | `withdrawFeeBP` | rewards 保留                                                                                                 |
| `90d <= T < 180d`   | 50 (0.5%)  | `midTermFeeBP`  | rewards 保留                                                                                                 |
| `T >= 180d`         | 0          | -               | rewards 保留                                                                                                 |

> 注：费率阶梯只在 Mature Withdraw 时适用；Early Exit 一律走 penalty。

> **强约束（必须）**：

* `penaltyFeeBP <= 2000`
* `withdrawFeeBP <= 500`
* `midTermFeeBP <= 500`
  以上为**代码硬限制**（不是建议），setter 必须 enforce（见 3.4）。

> **补充（feeRecipient 可更换的风险 · 必须）**
>
> * `setFeeRecipient` 必须受 Admin+Timelock 约束；
> * 必须事件记录；前端需展示历史变更。

### 6.2 奖励速率控制

* **模式**：线性释放（rate/sec），受 `periodFinish` 截断。
* **更新原则**：任何修改速率之前必须先 `_updateGlobalX()`。

#### 6.2.1 奖励注入与来源（冷启动补齐）

> **Reward Token B 资金来源**：

* 由 Reward Provider（项目方金库多签）提供。
* 资金进入合约后，才可以启动任何发放计划。

**前置条件**：

**transfer-then-notify**

* Reward Provider 先将 TokenB 转入合约
* Operator 调用 `notifyRewardAmountX(amount, duration)`（或等价参数）

**notifyRewardAmountX 会计规则（必须）**：

* `availableRewardsX += amount`
* “leftover 合并”更新 `rewardRateX / periodFinishX`
* 必须保证：后续 `_updateGlobalX()` 不会因 `availableRewardsX` 不足而 revert

> **冷启动约束（必须）**：
>
> 若 `rewardRateA == 0 && rewardRateB == 0`，前端应提示“当前无奖励计划”；
> 协议建议在公开质押前完成首次 `notifyRewardAmount`，避免“首批用户长时间无收益”。

> **补充（notify 的 budget 覆盖校验 · 必须）**
>
> * `notifyRewardAmountX` 执行时必须校验 TokenB 实际余额足以覆盖新增预算：
>
>   * 令 `balanceB = rewardTokenB.balanceOf(this)`
>   * 必须满足：
>     `balanceB + dust >= totalStakedB + totalPendingA + totalPendingB + (availableRewardsA + availableRewardsB)`
>     且在将 `availableRewardsX += amount` 后仍满足上述不变量。
> * 目的：避免 operator 在未转入 TokenB 的情况下“空记账 availableRewards”，导致后续 claim/compound 失败或坏账。

#### 6.2.2 空池奖励处理（修复奖励锁死）

> **设计目标**：当 `totalStakedX == 0` 时，奖励计划不应“空耗”，也不应“永久锁死/浪费”。

本协议采用：**顺延 periodFinish**

在 `_updateGlobalX()` 中，当 `totalStakedX == 0` 时：

* 仍计算 `deltaTime`（需 `MAX_DELTA_TIME` cap）
* 将空池时间顺延：

  * `periodFinishX += deltaTime`
* `lastUpdateTimeX = tApplicable`
* `accRewardPerTokenX` 不变，`availableRewardsX/totalPendingX` 不变

> 说明（必须）：
> 若长期无人调用导致多次累积空池时间，本机制将以 `MAX_DELTA_TIME` 为步长逐次顺延，不会因单次超大 deltaTime 导致溢出或不可用。

> **补充（返还未释放预算的非目标行为 · 必须）**
>
> * 本 PRD 明确采用“顺延”，不支持“自动返还未释放预算给 rewardProvider”。实现中不得引入任何自动返还逻辑，避免改变预算守恒与治理争议。

#### 6.2.3 溢出保护（rewardRate * deltaTime * PRECISION）

* 增加 `MAX_DELTA_TIME = 30 days`
* 每次 `_updateGlobalX()` 使用：

  * `deltaTime = min(deltaTimeRaw, MAX_DELTA_TIME)`

> **补充（rewardRate 修改语义 · 必须）**
>
> * `rewardRateX` 的修改必须遵循以下顺序语义，且只能通过 `notifyRewardAmountX`（或等价“注入+重算”入口）实现：
>
>   1. **先结算旧周期**：调用 `_updateGlobalX()`，将旧周期截至当前的应释放额度从 `availableRewardsX` 迁移到 `totalPendingX`，并更新指数与 `lastUpdateTimeX`。
>   2. **计算 leftover（如 period 未结束）**：
>      `leftover = (periodFinishX - now) * oldRewardRateX`（当 `now < periodFinishX` 时，否则为 0）。
>   3. **合并新预算**：
>      `newBudget = leftover + amountInjected`
>      且 `availableRewardsX` 必须新增 `amountInjected`（leftover 本质仍在 available 中，通过步骤1/2的语义保证不重复计）。
>   4. **重算新速率**：
>      `rewardRateX = newBudget / duration`（duration 必须 > 0）
>   5. **重设周期结束**：
>      `periodFinishX = now + duration`
>   6. **上限校验**：
>      `rewardRateX <= MAX_REWARD_RATE_X` 必须成立，否则 revert。
> * 禁止行为：
>
>   * 禁止在不执行 `_updateGlobalX()` 的情况下直接覆盖 `rewardRateX`；
>   * 禁止修改 `rewardRateX` 后不重设 `periodFinishX`；
>   * 禁止跳过余额 budget 覆盖校验（见 6.2.1）。
>
> **补充（APY 定义与展示口径 · 必须）**
>
> * 合约不负责存储或输出“APY 数值”，但 PRD 必须定义前端/运营口径：
>
>   1. **APR（单利）口径（用于透明展示）**：
>
>      * PoolX 的瞬时 APR（以 TokenB 计价）定义为：
>        `APR_X = rewardRateX * 365 days / totalStakedX`
>      * 若 `totalStakedX == 0`，APR_X 视为 0（或不可用）。
>   2. **APY（复利）口径（仅估算）**：
>
>      * APY 依赖复利频率 n（由用户/前端假设），定义为：
>        `APY_X = (1 + APR_X / n)^n - 1`
>      * 合约层不承诺 APY，因用户是否执行 `compound` 以及时点不同会造成差异。
> * 前端必须明确标注：
>
>   * APR 为“按当前 rewardRate 与 TVL 的瞬时值”，随 TVL/速率变化；
>   * APY 为“基于假设复利频率的估算值”。

> **补充（【2026-03-02 新增】notifyRewardAmountX 的顺序语义不可变更 · Critical · 必须）**
>
> * `notifyRewardAmountX` 必须在重算速率前先 `_updateGlobalX()`，避免旧周期释放额被遗漏/重复计算。
> * `transfer-then-notify` 必须为唯一允许的注资语义。

---

## 7. 暂停与紧急提款 (Security Matrix)

### 7.1 期间关系说明（Pause vs Emergency 明确边界）

* **暂停 (Pause)**：Operator 权限

  * 禁止：`withdrawA/withdrawB/stakeA/stakeB/compound`
  * 允许：`claim`（标准路径）
  * 奖励语义：

    * 允许 claim 已确权 pending
    * `_updateGlobalX()` 仍可运行（lazy）
    * **periodFinish 平移**避免暂停期“奖励计划被消耗”

* **紧急模式 (Emergency Mode)**：Admin 权限

  * 禁止一切收益与标准路径：`stake/compound/claim/notify/withdraw`
  * 只允许：`emergencyWithdrawA/B`（0费率秒提本金）
  * 后果：用户奖励永久放弃（rewards 清零、pending 对应核减/记录）

> **强制边界（必须）**：

* **emergencyWithdraw 仅在 `emergencyMode == true` 时可用**
* 暂停状态 `paused == true` **不开放 emergencyWithdraw**
* 避免“暂停期用户在 claim 与放弃奖励之间两难”的矛盾

> **补充（shutdown 流程 · 必须）**
>
> * 协议必须提供“停机（shutdown）”能力，用于项目终止运营或迁移。shutdown 目标为“有序退出”，不等同于 emergency。
> * 进入 shutdown 的规则（必须）：
>
>   1. 仅 Admin 可触发，且必须走 Timelock（建议 48h+）。
>   2. 触发后设置：`shutdownMode = true`、`shutdownAt = now`，不可逆。
> * `shutdownMode == true` 时，功能矩阵（必须）：
>
>   * 禁止：`stakeA/stakeB/compound/notifyRewardAmountA/B`（全部 revert）
>   * 允许：`withdrawA/withdrawB/claim`（继续标准路径退出）
> * `shutdownMode == true` 时，奖励处理（必须）：
>
>   * 允许继续按既有 `rewardRate/periodFinish` 释放并支付，直到周期自然结束或预算耗尽；
>   * 允许通过“停发语义”（6.2 停发条款）将 `rewardRateX` 归零；不得破坏 `totalPendingX` 可支付性。
> * shutdown 完成条件（必须）：
>
>   * `totalStakedA == 0`
>   * `totalStakedB == 0`
>   * `totalPendingA == 0`
>   * `totalPendingB == 0`
> * shutdown 完成后的资产回收（必须）：
>
>   * 仅允许回收“超额 TokenB”（严格遵循 excess 规则）；不得触碰用户本金与未清偿负债。

### 7.2 Pause/Unpause 时间平移

* `pause()`：

  1. `_updateGlobalA(); _updateGlobalB();`
  2. `paused = true; pausedAt = now;`
  3. `emit Paused(msg.sender, now)`

* `unpause()`：

  1. `require(paused)`
  2. `delta = now - pausedAt`
  3. `periodFinishA += delta; periodFinishB += delta`
  4. `lastUpdateTimeA = now; lastUpdateTimeB = now`
  5. `paused = false; pausedAt = 0`
  6. `emit Unpaused(msg.sender, now)`

> **补充（暂停期间 notify 的限制 · 必须）**
>
> * 建议：`paused == true` 时禁止 notify（revert），运维先 unpause 再注入，以避免 periodFinish 平移与 notify 重算叠加带来理解成本。

> **补充【2026-03-02 新增】7.2.1 暂停期间份额变化套利风险与防护（Pause Share Arbitrage Mitigation）**
>
> **风险描述（必须）**：
> PRD 采用 `periodFinish` 时间平移防止暂停期间奖励被“空耗”，但暂停期间如果允许用户撤出本金（withdraw），会导致 `totalStakedX` 下降；而攻击者可在暂停前提前大额 stake，使其在 unpause 后相对份额上升，进而在后续奖励释放中获取不成比例的收益。
>
> **攻击路径（示例）**：
>
> 1. 攻击者在 pause 前大额 stake（提高初始份额）
> 2. pause 期间其他用户恐慌 withdraw（`totalStakedX` 显著下降）
> 3. unpause 后攻击者份额变大
> 4. 攻击者在后续奖励周期中获得超额奖励
>
> **防护目标（必须）**：
> 在 pause 生效到 unpause 的时间窗内，避免出现“通过份额变化捕获后续奖励”的套利窗口。
>
> **机制要求（必须）**：
>
> **方案：Pause 期间冻结本金变更**
>
> * 在 `paused == true` 时禁止以下所有会改变本金份额的操作：
>   `withdrawA/withdrawB/stakeA/stakeB/compound` 全部 revert。
> * 仅允许 `claim`（只减少 pending，不改变本金份额）。
> * 如需“本金逃生”，必须由 Admin 进入 `emergencyMode` 后走 `emergencyWithdraw`（见 7.3），该路径放弃奖励。
>
> **合约行为一致性（必须）**：
>
> * 必须确保 `unpause()` 时 `lastUpdateTimeX = block.timestamp`，避免暂停期间时间差在恢复瞬间释放出奖励（强制）。
>

### 7.3 EmergencyWithdraw（本金优先，会计透明）

* **仅在 `emergencyMode == true` 时允许**

  * `require(emergencyMode == true, "NOT_EMERGENCY")`

* 跳过收益结算：

  1. `amount = userStakedX[user]`
  2. `userStakedX[user]=0; totalStakedX -= amount`
  3. 返还本金 `amount`（0费率）

* 清理收益与负债（会计透明，禁止 silent max）：

  1. `rA = rewardsA[user]`；`rB = rewardsB[user]`
  2. `rewardsA[user]=0; rewardsB[user]=0`
  3. **坏账处理策略（提款不中断 + 透明记录）**：

     * 若 `totalPendingA >= rA`：`totalPendingA -= rA`，否则：

       * `badDebtA += (rA - totalPendingA)`
       * `emit BadDebtRecorded(user, "A", rA - totalPendingA)`
       * `totalPendingA = 0`
     * B 池同理处理 `badDebtB`

> **补充（badDebt 恢复机制 · 必须）**
>
> * `badDebtA/badDebtB` 一旦出现，表示系统已发生“负债缺口”（通常由 Emergency 路径在极端条件下产生）。
> * badDebt 的恢复必须是显式流程，不得隐式吞并或静默归零。
>
> **1）恢复入口（必须）**
>
> * 实现必须提供仅 Admin 或 rewardProvider 可调用的恢复函数（命名可自定义，例如 `resolveBadDebt(uint256 amount)`），其行为必须满足：
>
>   * 调用前必须先将 TokenB 转入合约（transfer-then-resolve）。
>   * 函数内部仅负责“记账清偿 badDebt”，不得直接修改用户的 `rewardsX[user]`。
>
> **2）清偿顺序（必须）**
>
> * 清偿顺序必须固定，避免治理争议与前端混乱。PRD要求：
>
>   * 优先清偿 `badDebtA`，后清偿 `badDebtB`（也可相反，但必须固定并写死；本 PRD采用 A→B）。
>
> **3）清偿规则（必须）**
>
> * 令 `pay = min(amount, badDebtA + badDebtB)`，多余部分不得计入 pending 或 available（避免改变奖励预算语义）。
> * 清偿后：
>
>   * `badDebtX` 减少对应金额；
>   * 必须 emit 事件（建议 `BadDebtResolved(poolType, amount)`）。
>
> **4）系统行为约束（必须）**
>
> * 当 `badDebtA > 0 || badDebtB > 0` 时：
>
>   * `compound` 必须 revert（避免把奖励转成本金扩大风险面）。
>   * `claim` 允许继续按 5.4 的 pending 规则执行，但不得绕过 TokenB 余额与不变量检查；若 TokenB 余额不足则 revert。
>   * `withdraw` 仍按 5.3 执行，且对 `withdrawB` 的“pending 优先级保护”仍然生效（防止在修复前进一步挤兑）。
>
> **5）恢复完成条件（必须）**
>
> * 恢复完成以 `badDebtA == 0 && badDebtB == 0` 为准。
> * 恢复完成不自动改变 `emergencyMode` 或 `shutdownMode` 状态（由治理单独控制）。

---

## 8. 事件系统 (Events)

* `event Staked(address indexed user, uint256 amount, uint256 newUnlockTime, string poolType)`
* `event Withdrawn(address indexed user, uint256 amount, uint256 feeOrPenalty, bool isEarly, string poolType)`
* `event Claimed(address indexed user, uint256 paidA, uint256 paidB, uint256 timestamp)`
* `event Compounded(address indexed user, uint256 amountA, uint256 amountB, uint256 newUnlockTimeB)`
* `event RewardRateUpdated(uint8 poolType, uint256 newRate, uint256 periodFinish)`
* `event RewardInjected(uint8 poolType, uint256 amount, uint256 newRate, uint256 periodFinish)`
* `event Paused(address indexed by, uint256 at)`
* `event Unpaused(address indexed by, uint256 at)`
* `event EmergencyToggled(bool enabled, uint256 at)`
* `event PenaltyApplied(address indexed user, string poolType, uint256 principalLoss, uint256 forfeitedReward, address to)`
* `event BadDebtRecorded(address indexed user, string poolType, uint256 amount)`

> **事件一致性补充（必须）**：
>
> * `PenaltyApplied.forfeitedReward` 必须等于本次没收的 `rX`，`to` 必须为 `forfeitedRecipient`（或 burn 地址）。

> **补充（badDebt 恢复事件 · 必须）**
>
> * 必须新增：
>
>   * `event BadDebtResolved(string poolType, uint256 amount, uint256 at);`

> **补充（shutdown 事件 · 必须）**
>
> * 必须新增：
>
>   * `event ShutdownActivated(address indexed by, uint256 at);`

> **补充（Claim partial 可观察性事件约束 · 必须）**
>
> * `Claimed(paidA, paidB, ...)` 的 `paidA/paidB` 必须为实际支付额；不得上报 owed。
> * 前端可通过对比 `rewardsA/B[user]` 与 `paidA/paidB` 判定 partial。
> **补充（【2026-03-02 新增】关键参数变更事件 · 必须）**
>
> 为保证治理变更可追溯，以下 setter 必须 emit 对应事件（事件格式与本章节一致，逐行声明）：
>
> * `event FeeRecipientUpdated(address indexed oldOne, address indexed newOne, uint256 at);`
> * `event FeesUpdated(uint256 penaltyFeeBP, uint256 withdrawFeeBP, uint256 midTermFeeBP, uint256 at);`
> * `event LockDurationUpdated(uint256 oldDuration, uint256 newDuration, uint256 at);`
> * `event MinClaimAmountUpdated(uint256 oldMin, uint256 newMin, uint256 at);`
> * `event ForfeitedRecipientUpdated(address indexed oldOne, address indexed newOne, uint256 at);`
> * （可选）`event TVLCapUpdated(uint8 poolType, uint256 oldCap, uint256 newCap, uint256 at);`
> * （可选）`event MinStakeUpdated(uint8 poolType, uint256 oldMin, uint256 newMin, uint256 at);`
---

## 9. 业务边界场景 (Edge Case Analysis)

### 9.1 空池与首笔注入（奖励不浪费、不锁死）

* 若 `totalStakedX == 0`：

  * `_updateGlobalX()` 不释放 `availableRewardsX`
  * 更新时间锚点 `lastUpdateTimeX`
  * 并将 `periodFinishX` 顺延 `deltaTime`（见 6.2.2）

> **条款化说明（必须）**
>
> * 空池期间不释放预算、不迁移 pending、不更新指数；
> * 通过顺延 `periodFinishX`，保证预算不会被空耗或永久锁死。

### 9.2 巨鲸到期瞬间加仓套利

* rolling lock 会将 unlockTime 推近 `now + lockDuration`

> **条款化说明（必须）**
>
> * stake/compound 必须触发 rolling lock，使临近到期加仓显著延长 unlockTime。

### 9.3 复利后的本金隔离

* compound 只增加 B池本金、刷新 B池 unlockTime/stakeTimestamp
* A池 unlockTime 不受影响

> **条款化说明（必须）**
>
> * compound 不得改变 A 池 unlockTime 与 stakeTimestamp。

### 9.4 暂停 + 紧急叠加（不混用）

* Pause 允许 Claim/Withdraw（标准路径）
* Emergency 仅允许 emergencyWithdraw（放弃收益）

> **条款化说明（必须）**
>
> * Pause 与 Emergency 的入口必须严格隔离；paused 不得开放 emergencyWithdraw。

---
