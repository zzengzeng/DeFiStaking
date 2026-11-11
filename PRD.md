# ERC20 (Staking) 协议需求规格说明书 v1.1.4

> **v1.1.4 修订说明（2026-11-06）**
>
> - **§8**：明确 `Paused` / `Unpaused` 沿用 OZ `Pausable` 原生签名 `(address account)`；暂停时间点通过 `pausedAt` / `unpauseAt` 读取，不写入事件。
> - **§5.3**：`withdrawB` 在 Early Exit / Mature 两个分支中，全额退出后必须清零 `unlockTimeB[user]` 与 `stakeTimestampB[user]`。
> - **§5.4**：`claimA/claimB` 在 `shutdownMode` 下豁免 `minClaimAmount`；非 Shutdown 仍严格校验。
> - **§5.2**：明确 `compoundB` 豁免 `minStakeAmountB`（无外部转账、无 dust 攻击面），但不豁免 `MAX_REWARD_SHARES_B` 与奖励数值硬上限。
> - **§5.3.2**：没收助手的"分别发事件"改为通过 `RewardForfeited` 同时记录 `debtCancelled` / `lossAbsorbed` / `budgetReturned` 三个分量。
>
> **v1.1.3 修订说明（2026-11-06）**
>
> - **§5.4**：`claimA/claimB` 恢复 `_updateGlobalA/B + _settleUserX` 步骤；明确跨池 `badDebt` 检查需要两池都先计提（与 §10.2 "结算对应池" 的关系：结算是目标池，计提更新是两池）。
> - **§5.5**：补 `emergencyWithdrawB` 完整伪代码（守卫、结算、本金覆盖、奖励核销、清零 B 锁/WADP、事件）。
> - **§5.3**：明确 `withdrawB` 的 Early Exit / Mature 分支条件，以及 Shutdown 下沿用同一分支。
> - **§5.3.1**：明确 `withdrawA` 只校验 TokenA 本金覆盖，**禁止调用 `_assertInvariantB()`**。
> - **§5.4**：`forceClaimAll` 明确健康路径调用 `_assertInvariantB()`，降级路径不调用。
> - **§3.1**：新增 `CLAIM_COOLDOWN`、`FEE_TIER_1`、`FEE_TIER_2` 常量，明确 `claimCooldown` 不可调。
> - **§5.3.3**：补充 `withdrawB` 转出前后 B 本金覆盖检查、`stakeTimestampB == 0` 守卫。
> - **§5.3.2**：明确 Early Exit 部分退出时仍放弃全部未领 B 奖励。
> - **§5.1**：区分 `stakeA`（只查 TokenA 覆盖）与 `stakeB`（`_assertInvariantB`）的终检。
>
> **v1.1.2 修订说明（2026-11-06）**
>
> - **全新部署**：本项目为全新部署，无历史状态需迁移。移除 `dustA` / `dustB`、`DUST_TOLERANCE` 及 `DustAccumulated` 事件；指数取整余数只体现为 `orphan pending`（留在 `totalPendingX`），不再回灌预算。
> - 统一不变量、`recoverToken`、`forceClaimAll`、`forceShutdownFinalize` 中的 required 公式，去掉 `dust` 项。
> - **§6.2**：`scheduleRewards` 增加前置条件 `periodFinishX <= T`；活跃窗口必须走 `reanchorRewards`，禁止覆盖。
> - **§4.2**：`bookedUserRewardsX` 的递增下沉到 `_settleUserX` 内部，禁止调用方自行补写。
> - **§4.1.1**：新增状态不变量 `paused ⇒ pausedAt != 0`；明确 `crankCatchUpPool` 的 `complete` 语义。
> - **§3.2**：明确每个财务入口的终末检查须同时校验 `badDebtX <= totalPendingX`。
> - **§8**：明确事件时间字段一律使用真实 `block.timestamp`，不参与会计。
>
> **v1.1.1 修订说明（2026-11-04）**
>
> - **§2.1**：明确 Operator 必须由多签合约持有（生产环境 ≥2-of-3），禁止单签热钱包
> - **§7.3**：明确 `enableEmergencyMode` 入口下 `pausedAt` 的赋值语义 —— Normal → Emergency 同步写入 `block.timestamp`；Paused → Emergency 保持原 `pausedAt` 不变
> - **§6.2**：明确本项目**不保留**旧 `notifyRewardAmountX(amount, duration)` 兼容入口，所有 Operator 注资统一走 `fundRewardsA/B`
> - **§10.5**：新增生产部署安全检查清单（Operator/Admin/模块/参数/Token/监控/文档/验证）

## 1. 文档概览

### 1.1 架构概述

本协议实现一个**平行双池（Parallel Dual-Pool）复合奖励质押系统**：

* **Pool A（基础池）**：质押 TokenA → 产出 TokenB 奖励。
* **Pool B（收益池）**：质押 TokenB → 产出 TokenB 奖励（复利池）。
* **核心记账模型**：采用**负债累积模型（Liability Accumulation Model）**，通过全局指数 `accRewardPerToken` 与用户快照实现收益线性确权。
* **时间加权算法**：引入 **WADP (Weighted Average Deposit Period)**，通过时间加权平均值更新持仓起点，防止恶意稀释费率。
* **放大因子**：保留币值刻度 `PRECISION = 1e18`；奖励指数专用刻度为 `REWARD_PRECISION = 1e45`。奖励指数、用户快照、earned及预览统一使用后者，并受总份额硬上限及指数表示空间约束（§3.1、§4.1、§4.5），乘除使用完整精度 `Math.mulDiv`。

### 1.2 核心设计原则

| 原则 | 说明 |
| --- | --- |
| **CEI 优先** | 严格遵循“检查-效果-交互”顺序（支持 FOT 代币的特定函数除外，详见具体声明）；所有外部 Token 转账必须在合约状态变量写入之后执行。 |
| **非重入保护** | 所有涉及资产变动或状态修改的Core外部入口，包括crank、暂停及继承的角色/所有权入口，必须共享同一 `nonReentrant` 边界；模块沿用Core存储中的锁，不在已加锁调用链中重复加锁。 |
| **资产覆盖不变量** | **TokenB 账目覆盖不变量** 与 **TokenA 本金覆盖** 共同约束资金安全；BadDebt仅记录未获预算支持的已确权奖励，不是现金，所有实际支付仍须保护用户资金。 |
| **最小权限** | 遵循最小特权原则。治理性操作（调拨、费率、升级）的延迟由 **链上标准 `TimelockController`（或 Safe→Timelock）** 执行，目标最小延迟 **≥48h**（见 **§2.1.1**）。 |
| **安全降级与响应分离** | 阻断性操作（暂停、开启紧急模式）**0h 延迟**；解除普通暂停和治理提取资产**≥48h 延迟**。Emergency与Shutdown不可撤销，不存在取消终态模式的入口。 |
| **不变量弹性豁免** | 普通金融操作执行严格检查；暂停/开启紧急模式不得被已有缺口阻断；独立A退本、紧急退本及部分兑付按各自资金保护规则降级，不把原有B缺口作为阻断全部退出的理由，也不豁免真实本金覆盖。 |
| **WADP 防套利** | 任何追加质押行为必须通过时间加权算法重算持仓起点，严禁通过 1 wei 追加重置费率阶梯。 |
| **TVL 校验完整性** | 所有 Stake 操作的 Cap 检查必须包含 **“真实入账的拟新增量”**，防范闪电贷瞬时攻击与 FOT 额度虚占。 |
| **空池重锚与预算守恒** | 空池不释放奖励；开启/取消/重排及过期重锚仅走48h治理，使用统一有效计息时间 `effectiveTime`，满足 **`rate ≤ MAX_REWARD_RATE_X`、`rate × duration ≤ availableRewardsX`**。注资、质押、复投、罚金/没收回流及调拨均不隐式重排；余数留在预算（见 **§4.5**、**§6.2**）。 |
| **用户奖励账本对账** | Core 维护 `bookedUserRewardsA/B`（各池 `userInfo*.rewards` 之和），与 `totalPending` 对账，支撑停机 `forceShutdownFinalize` 与 orphan pending 清扫（见 **§3.2**、**§7.4**）。 |
| **FOT 税费由用户承担** | 入账与出账均不由池子补贴 FOT 税；`maxTransferFeeBP` 对称封顶；前端须展示「合约转出额 vs 预计到手」（见 **§4.6**）。 |

### 1.3 文档范围

本文档覆盖：角色与权限、资产隔离（TokenB 会计不变量）、状态变量、数学公式（WADP 与重锚）、详细功能需求（Stake/Withdraw/Compound/Emergency）、奖励通知与预算调拨、手续费阶梯、安全矩阵、事件系统、边界场景剖析。

**不覆盖**：前端实现、链下 Keeper 调度、多链部署差异。

**覆盖（治理部署）**：主路径为两个 **OpenZeppelin `TimelockController`**，分别负责48h常规治理与72h超级操作；治理门面通过不可变地址鉴权，再调用Core受控入口；细节见 **§2.1.1**。

### 1.4 链上实现架构与组件约定

| 组件 | 职责 |
| --- | --- |
| **`DualPoolStaking`（Core）** | 角色、路由、`delegatecall` 至模块、`_assertInvariantB`、Operator 0h 入口 |
| **`DualPoolUserModule`** | `stake*` / `withdraw*` / `claimA` / `claimB` / `compoundB` / `forceClaimAll` / `emergencyWithdrawA/B`；维护 `bookedUserRewards*` |
| **`DualPoolAdminModule`** | 纯奖励注资、治理排期与setter、`forceShutdownFinalize`、`resolveBadDebt` 等；旧 `notifyRewardAmount*` 兼容入口不得继续重排 |
| **`DualPoolStakingAdmin`** | Timelock 可调用的Admin门面；以不可变 `timelockGovernance` / `timelockSuper` 分别鉴权48h常规与72h超级wrapper，不采用Ownable门面 |
| **链接库（library）** | `PoolAccrualLib`、`PoolAStakeLib`、`PoolBStakeLib`、`PoolBWithdrawLib`、`PoolBCompoundLib`、`PoolSingleClaimLib`、`NotifyRewardLib`、`ForceClaimAllLib`、`StakingAdminLib`、**`PoolBWadpLib`**、**`RewardReanchorLib`** |

用户入口命名（与 Core 对外 ABI 一致）：**`claimA` / `claimB`**（分池领取）、**`compoundB`**（跨池复投进 B）、**`emergencyWithdrawA` / `emergencyWithdrawB`**（分池紧急退出）。

---

## 2. 项目范围与角色定义

### 2.1 角色与权限模型

| 角色 | 获取方式 | 核心权限 | 响应要求 (Timelock) |
| --- | --- | --- | --- |
| **Owner（`DEFAULT_ADMIN_ROLE`）** | 部署后交接至治理门面；Core的Ownable owner同样交接 | 模块指针（`setUserModule` / `setAdminModule`）、`setAdmin` / `setOperator` 等超级配置；DEFAULT_ADMIN_ROLE与Ownable owner不是同一种权限 | **≥72h**：由超级Timelock调用门面超级wrapper |
| **Admin（`ADMIN_ROLE`）** | 授予治理门面；以不可变 `timelockGovernance` 鉴权常规调用 | 奖励排期/取消/过期重锚、风险参数、`recoverToken`、`rebalanceBudgets`、`unpause` 等 | **≥48h**：须由常规Timelock `schedule` → 到期 `execute` 再调用门面→Core |
| **Operator（`OPERATOR_ROLE`）** | 经72h超级路径授予**多签合约（生产环境强制 ≥2-of-3）**；禁止单签热钱包 | **`pause()`、`enableEmergencyMode()`、纯注资 `fundRewardsA/B`**；纯注资不经治理门面 | **0h**（防御性/注资类）；不得指定新周期、重排旧预算或通过其他用户入口间接重排 |
| **User** | 任意地址 | `stakeA`/`stakeB`、`withdrawA`/`withdrawB`、`claimA`/`claimB`、`compoundB`、`forceClaimAll`、`emergencyWithdrawA`/`emergencyWithdrawB` | — |

#### 2.1.1 标准 Timelock 管 Admin（推荐主路径）

1. **时间锁合约**：采用两个OpenZeppelin **`TimelockController`**（可与 **Gnosis Safe** 串联：Safe投票通过 → Timelock `schedule` → 延迟届满 → `execute`）。常规治理部署 `minDelay ≥48小时`，超级治理部署 `minDelay ≥72小时`。生产须核对各锁proposer/executor/canceller配置、撤销临时管理权限，并监控后续延迟与角色变化。
2. **治理门面**：`DualPoolStakingAdmin` 以不可变 `timelockGovernance` / `timelockSuper` 鉴权；构造参数为 `(coreAddress, timelockGovernance, timelockSuper)`。Core将 `ADMIN_ROLE`、`DEFAULT_ADMIN_ROLE` 与Ownable owner交给该门面。常规setter路径为48h锁 → `onlyGovernanceTimelock` wrapper → Core `onlyRole(ADMIN_ROLE)`；模块/角色等超级入口必须经72h锁 → `onlySuperTimelock` wrapper → Core超级权限。
3. **运维与 0h 路径**：`pause`、`enableEmergencyMode`、纯注资 `fundRewardsA/B` 保留在 **Core** 上且为 **`OPERATOR_ROLE`**，由独立热钱包/运维多签持有。旧 `notifyRewardAmount*(amount,duration)` 如保留，只接受 `duration == 0` 并转至相同fund路径；非零duration回滚。开启、取消、重排和过期重锚另走48h治理，不可在注资后由stake/compound等入口自动完成。
4. **治理时间锁与信任边界**：继续使用标准OpenZeppelin **`TimelockController`**（`schedule` → 延迟 → `execute` / `cancel`）。标准锁允许经其自身治理调用 `updateDelay`，因此48h/72h是部署与运行治理约束，并非标准合约不可降低的永久硬下限；不引入定制锁。审计与运维同时核对 `CallScheduled` / `CallExecuted` / `Cancelled` / `MinDelayChange` 和角色变化。Super经延迟替换模块仍有接管协议的能力，属于升级架构的信任边界。
5. **继承入口不得形成旁路**：`ADMIN_ROLE` 和 `OPERATOR_ROLE` 均由 `DEFAULT_ADMIN_ROLE` 管理（`_setRoleAdmin(ADMIN_ROLE, DEFAULT_ADMIN_ROLE)`、`_setRoleAdmin(OPERATOR_ROLE, DEFAULT_ADMIN_ROLE)`）。Core 必须覆盖全部继承入口：
   * `grantRole` / `revokeRole`：直接 revert，强制角色变更走 `setAdmin` / `setOperator`，保证每次变更都有专用事件可索引。
   * `renounceRole`：直接 revert，防止超管或管理员单方面放弃角色。
   * `renounceOwnership`：直接 revert，owner 身份不得烧毁。
   * `transferOwnership`：仅 `DEFAULT_ADMIN_ROLE` 可调用，并调用内部 `_transferOwnership`，避免父合约 `onlyOwner` 被重复检查。
   * `transferSuperAdmin(address)`：新增函数，原子完成 `DEFAULT_ADMIN_ROLE` 与 `Ownable` owner 的交接；拒绝零地址与自转让；不迁移 `ADMIN_ROLE` / `OPERATOR_ROLE` 持有者。
   以上覆盖入口必须共享重入锁，不能经 48h 常规 wrapper 绕过 72h 超级路径；不得直接放弃最后治理控制权。治理门面不提供通用任意调用 wrapper。部署者完成模块、参数和角色交接后撤销临时权限。

> **关键操作 Timelock 要求（与上表一致，延迟在 Timelock 层落实）**
> * **0h (立即生效)**：`pause()`、`enableEmergencyMode()`、`fundRewardsA/B`及兼容的 `notifyRewardAmount*(amount, 0)`；注资不代表奖励周期开始。
> * **≥48h**：经Timelock调度的奖励排期/取消/过期重锚、`setFees`、`setLockDuration`、`activateShutdown`、`recoverToken`、`rebalanceBudgets`、`unpause`、预算/参数类等 **Admin** 路径。
> * **≥72h**：逻辑/实现升级、`DEFAULT_ADMIN_ROLE` 转移等超级变更（按部署配置落实）。
> 
> 

### 2.2 资产隔离与 TokenB 不变量

**物理隔离与 ERC777 防御基线（强制）**

> **安全预警**：由于 `!isContract` 校验会误杀多签钱包和账户抽象（AA），系统采用**部署期资产准入**策略。TokenA / TokenB须为经过代码及权限审查的资产，不支持ERC777/自定义回调、rebase、reflection、发送方额外扣税或可任意阻断转账等破坏记账与退出的行为；代币代理升级与税率管理权限须纳入审查。部署期探测不替代共享重入锁，也不保证代币未来行为不会改变。

**链上辅助探测（生产对齐）**：在存在ERC1820注册表的网络上，Core构造函数执行以下检查（无注册表则跳过，但不能据此认定资产无回调）：

* **本合约地址**：不得注册 `ERC777TokensRecipient` / `ERC777TokensSender` 接口实现者（防止 Core 作为 777 钩子载体）。
* **TokenA / TokenB 地址**：不得注册上述接口实现者（部署期对质押与奖励资产地址的强制校验，`_assertTokenHasNoERC777Hooks`）。

ERC777的sender/recipient hook可登记在用户或收款账户上；Token地址未注册上述接口不证明Token没有hook。实际 `transfer` / `transferFrom` 行为、资产管理权限与共享重入边界须独立检查。TokenA/TokenB地址还须非零且有代码。

```solidity
require(address(stakingTokenA) != address(rewardTokenB), "A_EQ_B");
require(rewardTokenB.decimals() == 18, "TOKEN_B_MUST_BE_18_DECIMALS");

```

**TokenB 会计不变量**

为了确保系统在任何极端模式下（包括产生坏账时）逻辑可控，公式引入已记录 `BadDebt`；该值只对应已纳入pending但未获预算支持的奖励债务，不得用于掩盖外部资产损失：

$$BalanceB + BadDebt_{A} + BadDebt_{B} \ge TotalStakedB + TotalPending_{A+B} + AvailableRewards_{A+B} + UnclaimedFeesB$$

> **v1.1.2（全新部署）移除 `Dust`**：本项目为全新部署，无历史残值桶需要迁移，`dustA` / `dustB` 与 `DUST_TOLERANCE` 从状态、不变量和事件中全部移除。按§4.1的新奖励刻度及份额硬上限，正常计提的 `pendingDelta` 等于完整排放D，指数取整余数不再回灌预算，而是作为 `orphan pending` 留在 `totalPendingX`（见§3.2、§7.4）。

**TokenA本金覆盖**另须满足 `stakingTokenA.balanceOf(address(this)) >= totalStakedA`。各池还须保持 `bookedUserRewardsX <= totalPendingX`、`badDebtX <= totalPendingX`。健康态badDebt为0，TokenB余额完整覆盖required；实际支付不能把badDebt视作现金。

> **`_assertInvariantB()` 行为规范（必须）**
> 普通金融操作校验失败时回滚；明确降级路径使用下文规定的资金保护，不得无条件跳过本金和用户账本检查。
> ```solidity
> function _assertInvariantB() internal view {
>     // balanceOf是外部Token查询，缓存返回值供本次检查使用。
>     uint256 balanceB = rewardTokenB.balanceOf(address(this));
>     
>     // actual用于账目覆盖，不代表可支付现金。
>     uint256 actual = balanceB + badDebtA + badDebtB;
>     uint256 required = totalStakedB + totalPendingA + totalPendingB
>                       + availableRewardsA + availableRewardsB + unclaimedFeesB;
>     if (actual < required) {
>         revert InvariantViolation(actual, required);
>     }
> }
> 
> ```
> 
> 
> **生产环境安全约定**：普通金融操作末尾必须执行相应覆盖检查，不能为Gas优化移除。`balanceOf`涉及外部调用，Gas与可用性取决于Token实现及运行状态，不承诺固定开销。`view`函数不能emit；交易最终revert时先前日志也不会留存，监控必须主动读取余额/账本并检查失败交易。
>
> **明确例外**：`pause` / `enableEmergencyMode`仅写防御状态，不依赖Token查询、完整catch-up或不变量成功；公开crank只推进合法计提，不能因需修复的实物缺口而失去推进能力。正常/停机的A本金退出只依赖A本金覆盖与合法A账本，不能被B缺口阻断。紧急退本仍须保证对应Token余额足额覆盖全池本金；部分兑付按§5.4只核销实付并保留未付债权，不能增加原有缺口。上述路径可报告既有缺口，但不能跳过sender扣款、真实本金与用户记录保护。治理模块/权限修复不应被资产缺口阻断；治理提费、recover和停机清扫仍须满足各自资金保留条件。

**罚金路由与奖励没收（闭环逻辑）**

* **WithdrawA（正常路径）**：**无锁、无本金手续费**；仅扣减 `userStakedA` / `totalStakedA` 并全额转出 TokenA 本金。已确权奖励仍留在 `rewardsA`，由 `claimA()` 单独兑付，**不在 `withdrawA` 中没收或外转罚金**。
* **EmergencyWithdrawA**：紧急模式下用户退出Pool A本金并明确放弃本池未领奖励时，同额核销用户rewards、booked与pending；先消减对应未出资badDebt，仅将有资金支持且未用于吸收既有实物缺口的部分记入 **`availableRewardsB`**（跨池预算回流，与正常 `withdrawA` 无关；详见§5.5、§7.3）。
* > **经济模型声明 (Cross-pool Routing)**：`emergencyWithdrawA`等路径下可安全回流的已出资奖励重定向至Pool B预算；终态已停止新增排放，回流不自动重排，也不代表紧急/停机下继续发奖。**与「Pool A 正常提款零费零锁」不矛盾**。




* **WithdrawB (TokenB 罚金 & 没收奖励)**:
* 罚金留在合约内，增加 `availableRewardsB`。
* 没收奖励先按上述规则核销用户rewards、booked、pending及对应badDebt，再把可安全回流部分转入 `availableRewardsB`；不把未出资债权变成预算。
* **结果**：罚金/奖励在内部转桶的动作不转出TokenB，本金退还另按实际gross转账；回流不自动改变奖励排期，仍须验证会计与资金保护。



**不变量各项含义**

| 变量 | 含义 | 备注 |
| --- | --- | --- |
| `totalStakedB` | Pool B 全部质押本金之和 | TokenB |
| `totalPendingA/B` | 已排放未兑付奖励的保守负债预留，覆盖booked及合法未settle债权 | TokenB |
| `availableRewardsA/B` | 各池未确权奖励预算，含已排期未来承诺及未排余额 | B另含罚金与安全奖励回流；不能据此随意搬走活跃排期预算 |
| `badDebtA/B` | 完整排放确权后尚未获资金支持的奖励缺口 | 用户对应债权必须已纳入 `totalPending`；不能只记录坏账却遗漏债权 |
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
| `PRECISION` | uint256 | 1e18 | 保留的币值刻度；不再作奖励指数除数 |
| `REWARD_PRECISION` | uint256 | 1e45 | 奖励指数、用户指数快照、earned及预览的统一刻度；Core、模块和库必须一致 |
| `MAX_REWARD_SHARES_A / B` | uint256 | 各等于REWARD_PRECISION | 各池原始单位总本金的不可关闭数值硬上限；无普通治理setter，独立于业务TVL cap |
| `BASIS_POINTS` | uint256 | **10000** | 费率基数（1 BP = 0.01%），必须显式声明 |
| `MAX_EARLY_EXIT_PENALTY_BP` | uint256 | 2000 | 提前退出罚金上限（20%） |
| `MAX_WITHDRAW_BP` | uint256 | 500 | 到期提现费上限（5%） |
| `MAX_MIDTERM_BP` | uint256 | 500 | 中期提现费上限（5%） |
| `MAX_LOCK_DURATION` | uint256 | 90 days | 锁定期上限 |
| `MAX_DELTA_TIME` | uint256 | 30 days | 单次时间差上限，防溢出 |
| `MAX_CATCHUP_ITERATIONS` | uint256 | 50 | 单次调用的最大计提分片数；业务入口未完整推进时回滚，公开 crank 可分批保留进度 |
| `MAX_REWARD_DURATION` | uint256 | **365 days** | 治理指定奖励周期上限；旧notify已改为只注资 |
| `MIN_REWARD_DURATION` | uint256 | **1 days** | 治理指定奖励周期下限；治理重锚的微排放例外见§4.5 |
| `MAX_REWARD_RATE_A / B` | uint256 | 派生上界 | 由构造函数参数 **`maxTotalSupplyBForRewardRateCap`（>0，部署时一次性写入）** 与 `MAX_APR_BP`、`SECONDS_PER_YEAR` 推导；当前部署无正常setter，**禁止**使用运行时 `rewardTokenB.totalSupply()` 改变上界。 |
| `MAX_MIN_CLAIM_AMOUNT` | uint256 | 1e17 wei | `minClaimAmount` setter 上限 |
| `CLAIM_COOLDOWN` | uint256 | **24 hours** | Claim / Compound / forceClaim 共享冷却；**不可调**（constant/immutable），变更需升级模块或重新部署 |
| `FEE_TIER_1` | uint256 | **90 days** | Pool B Mature 提现费率第一档边界：`holdingDuration < FEE_TIER_1` 用 `withdrawFeeBP` |
| `FEE_TIER_2` | uint256 | **180 days** | Pool B Mature 提现费率第二档边界：`< FEE_TIER_2` 用 `midTermFeeBP`，`>= FEE_TIER_2` 为 0 |
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

派生 `MAX_REWARD_RATE_X` 必须至少为1 wei/秒；使用完整精度乘除，并在每次治理排期/重锚时按§4.5验证整个候选窗口的指数表示空间。该cap按原设计部署固定；现有代码如仍暴露cap setter，应移除或明确拒绝，不能据此反向放宽本条。

对于TokenA，decimals不作统一18位限制，本金仍按原始最小单位记录；支持范围必须同时满足 `totalStakedA <= MAX_REWARD_SHARES_A`。B池同样受其数值硬上限约束。资产准入和前端须将该原始单位上限换算披露，不承诺任意精度下的任意质押量都能表示；36 decimals的100 A（原始量1e38）在本版上限1e45以内。

该硬上限覆盖所有增加本金的路径，包括FOT实收及compound；`maxTVLCap=0`和复投的业务cap豁免均不能绕过。提高奖励精度而不限制原始总份额，仍可能重现零指数排放；仅限制TokenA decimals也不能替代本条。

**Pool 枚举类型**

```solidity
enum Pool { A, B } // 使用 enum 替代 string 节省 Gas

```

**核心布尔状态及全局控制变量声明**

下列名称表达逻辑状态；Core 继承 `Pausable` 时必须沿用 `paused()`，不得重复声明同名字段。`shutdownMode` 表示停机状态，实际激活入口为 `activateShutdown()`。

```solidity
// paused / paused() 复用 OpenZeppelin Pausable 的存储与 getter，不得重复声明
bool public emergencyMode;         // 紧急模式标志，单向不可逆
bool public shutdownMode;          // 停机模式标志，单向不可逆
uint256 public pausedAt;           // 最近一次 pause 时间戳
uint256 public unpauseAt;          // 最早允许 unpause 的时间戳
uint256 public shutdownAt;         // 停机时间戳
uint256 public terminalRewardTime; // Emergency激活时记录奖励冻结点；Shutdown沿用，不恢复
uint256 public badDebtA;           // Pool A 坏账缺口
uint256 public badDebtB;           // Pool B 坏账缺口
uint256 public minClaimAmount;        // 合约初始值为 0（无门槛）；Admin 须在部署后尽早通过 setMinClaimAmount 设置（建议 ≥1e15 wei），上限 MAX_MIN_CLAIM_AMOUNT（1e17 wei）

```

> **实现形态**：`badDebtA/B` 可并入 `PoolInfo.badDebt`（每池一个），避免与结构体字段重复；`paused` 复用 `Pausable`；`minClaimAmount` / `feeRecipient` 等为全局参数。

统一奖励时钟：Emergency或Shutdown使用 `terminalRewardTime`；否则Paused使用 `pausedAt`，Normal使用真实 `block.timestamp`。Emergency从Paused进入时冻结于 `pausedAt`，否则冻结于激活时；锁仓、WADP、冷却、Timelock和清算宽限仍使用真实时间。

### 3.2 收益分发控制（Global Reward States）

| 变量名 | 类型 | 含义 | 单位 |
| --- | --- | --- | --- |
| `rewardRateA / B` | uint256 | 每秒释放奖励速率 | weiB/sec |
| `periodFinishA / B` | uint256 | 奖励周期结束时间 | timestamp |
| `lastUpdateTimeA / B` | uint256 | 上次全局结算锚点 | timestamp |
| `accRewardPerTokenA / B` | uint256 | 全局每原始单位累计收益指数（× REWARD_PRECISION） | — |
| `totalStakedA / B` | uint256 | 全池质押总量 | weiA / weiB |
| `availableRewardsA / B` | uint256 | 未释放奖励预算（B 池含没收奖励及罚金） | weiB |
| `totalPendingA / B` | uint256 | 已排放未兑付奖励的保守负债预留，含未逐用户 settle 的债权与可能的 orphan | weiB |
| `unclaimedFeesB` | uint256 | **已收取但未被管理员提取的提现手续费** | weiB |
| `rewardDurationA / B`（`PoolInfo.rewardDuration`） | uint256 | 各池默认排放时长（秒）；仅供48h治理 `scheduleRewards*(0)` 使用；`0` 表示未设默认，治理须传显式duration或先设置默认；Operator注资不使用此值 | seconds |
| `bookedUserRewardsA / B` | uint256 | 链上汇总：该池所有 `userInfo*.rewards` 之和；在 settle / claim / compound / forfeit / emergency 路径增减；用于停机清算 | weiB |

> **实现形态（允许但需固定）**：上述 per-pool 字段可用单个 `PoolInfo` struct 或独立全局变量实现。若采用 struct，必须把 `bookedUserRewards` 一并纳入（现有 `StakeTypes.PoolInfo` 尚未包含该字段），且字段顺序在首次部署后不可变更（delegatecall 模块与 Core 共享槽位）。对外 getter 形状须固定：`PoolInfo public poolA` 自动生成的 getter 返回整条字段元组，**不能按字段单独调用 `poolA.tvlCap()`**；若希望 ABI 与 PRD 名称一致（如 `maxTVLCapA()` / `totalStakedA()`），必须额外编写显式 view getter。两种方式的 ABI 须在部署清单中固定并同步前端/索引器。

> **`bookedUserRewards` 与 `totalPending`**
> * `totalPendingX`：池级已排放未兑付奖励的**保守预留**（主要由 `_updateGlobalX` 增加），不要求精确等于当前所有 `rewards` 字段之和。必须覆盖已记账奖励和未 settle 但用户已可结算的奖励；仍有本金时不得按 `booked` 裁剪预留。
> * `bookedUserRewardsX`：已记入用户 `rewards` 字段、尚未 claim 的合计。
> * 所有合法流程均须满足 **`bookedUserRewardsX ≤ totalPendingX`**，以及 **`badDebtX ≤ totalPendingX`**；差额 `orphanX = totalPendingX - bookedUserRewardsX` 包含尚未settle的用户债权，不能直接认定无人有权领取（停机finalize时仅在无剩余质押本金时并入residual；deadlock bypass后仍有质押者时保留在 `totalPending` 供后续settle/claim，见 **§7.4**）。
> * 若 `bookedUserRewardsX > totalPendingX`，实现 **revert** `BookedRewardsExceedPending()`。
> * `badDebtX <= totalPendingX` 必须在**每个财务入口的终末覆盖检查**中显式校验（不限于 `forceClaimAll`）；违反时 revert（可复用 `InvariantViolation` 或新增 `DebtExceedsPending()`）。

> **⚠️ 实现警告（Critical）**：
> 开发者在实现对应的 `_updateGlobalX()` 函数时，**切勿将逻辑碎片化**。必须以 **§4.1** 中提供的统一代码块为准（包含提前 return 防除零、坏账映射等），以保证时序的安全性和会计一致性。

### 3.3 用户账本映射

| 映射名 | 类型 | 含义 |
| --- | --- | --- |
| `userStakedA / userStakedB[user]` | mapping(address => uint256) | 用户本金余额 |
| `rewardsA / rewardsB[user]` | mapping(address => uint256) | 已确权未领收益 |
| `userRewardPaidA / userRewardPaidB[user]` | mapping(address => uint256) | 收益指数快照，与acc统一使用REWARD_PRECISION尺度 |
| `unlockTimeB[user]` | mapping(address => uint256) | **仅 Pool B**：滚动解锁截止时间（Pool A 无此字段） |
| `stakeTimestampB[user]` | mapping(address => uint256) | **仅 Pool B**：WADP 时间加权持仓起点（Pool A 无此字段） |
| `lastClaimTime[user]` | mapping(address => uint256) | 上次成功Claim/Compound/ForceClaim时间；零支付回滚不得消耗冷却 |

> **WADP (时间加权平均) 机制（核心防套利设计）**
> 严禁在每次追加质押（Stake/Compound）时将 `stakeTimestamp` 粗暴重置为 `block.timestamp`，否则将严重惩罚长期持有者的复投行为。必须按资金量进行时间加权：
> **WADP 公式**：
> 
> $$T_{new} = \left\lceil\frac{(Staked_{old} \times T_{old}) + (Amount_{new} \times Now)}{Staked_{old} + Amount_{new}}\right\rceil$$
> 
> 实现见 **`PoolBWadpLib`**（OpenZeppelin `Math.Rounding.Ceil`），详见 **§4.4**。

> **实现形态（允许但需固定）**：`userStakedA/B`、`rewardsA/B`、`userRewardPaidA/B` 可用 `UserInfo` struct（`staked` / `rewards` / `rewardPaid`）聚合到 `userInfoA` / `userInfoB` 映射中；字段顺序同样在首次部署后冻结。

### 3.4 费率与边界配置

| 变量名 | 类型 | 含义 | 默认值 / 约束 |
| --- | --- | --- | --- |
| `lockDuration` | uint256 | 基础锁定期 | 7 days（>0，Max 90 days） |
| `penaltyFeeBP` | uint256 | **Pool B** Early Exit 罚金（BP） | 1000（Max 2000） |
| `withdrawFeeBP` | uint256 | 短期到期手续费（BP） | 100（Max 500） |
| `midTermFeeBP` | uint256 | 中期到期手续费（BP） | 50（Max 500） |
| `minStakeAmountA / B` | uint256 | 最小质押量 | 防粉尘攻击 |
| `maxTVLCapA / B` | uint256 | TVL 上限 | 0=无限 |
| `claimCooldown` | uint256 | Claim/Compound 冷却 | 24h（即 `CLAIM_COOLDOWN`，不可调） |
| `maxTransferFeeBP` | uint256 | 出入账FOT损耗容忍阈值 | 默认1000；范围0～BASIS_POINTS，0要求无损，不是跳过检查；不支持sender额外扣税 |
| `feeRecipient` | address | Pool B 提现手续费接收地址（`unclaimedFeesB` → `claimFees`） | 显式配置国库，非零且非Core；后续Admin变更≥48h Timelock，不得默认遗留部署钱包 |
| `minEarlyExitAmountB` | uint256 | **仅 Pool B**：最小提前退出量 | 须满足计算罚金 $\ge 1 \text{ wei}$ |

> **Pool B 罚金与没收奖励路由（目标规则）**
> * 提前退出没收的 `userB.rewards` 中可安全回流的已出资部分，与early-exit本金罚金 → `poolB.availableRewards`；按§2.2区分badDebt与实物缺口，不自动重排。
> * 锁定期后的 tiered 提现手续费 → `unclaimedFeesB`，由治理 `claimFees` 扫至 `feeRecipient`。
> * Emergency放弃的A/B池奖励中可安全回流的部分 → `poolB.availableRewards`（见§7.3）；终态不恢复新增排放。

> **minEarlyExitAmountB 最小值除零约束（安全基线，仅 Pool B）**
> 为防止提现 1 wei 时导致罚金因整除被截断为 0，系统设置函数必须强制校验：
> ```solidity
> // 如果罚金率大于 0，最小退出额产生的罚金必须大于等于 1 wei
> if (penaltyFeeBP > 0) {
>     require(newMinEarlyExitAmountB * penaltyFeeBP / BASIS_POINTS >= 1, "PENALTY_TOO_SMALL");
> }
> 
> ```
> 
> 

---

## 4. 核心数学公式

### 4.1 全局收益累积指数：统一实现规范 (The Engine)

#### 4.1.1 唯一有效计息时钟与完整 catch-up

本版保留“暂停停奖、恢复补时”的设计。所有全局计提、剩余窗口、过期判断和重锚必须使用同一时钟：

```solidity
function _effectiveTime() internal view returns (uint256) {
    if (emergencyMode || shutdownMode) return terminalRewardTime;
    return paused ? pausedAt : block.timestamp;
}
// targetX = min(_effectiveTime(), periodFinishX)
```

> **状态不变量（强制）**：`paused == true ⇒ pausedAt != 0`。任何把 `paused` 置为 true 的内部路径（当前为 `pause()` 与 `enableEmergencyMode()`）必须同步写入 `pausedAt`；禁止在其他位置单独调用 `_pause()`。实现应在 `_effectiveTime()` 或 `unpause()` 的 `_restorePoolClock` 前加入防御性断言，避免 `pausedAt == 0` 导致时钟归零、`periodFinish` 被平移数十年。

`terminalRewardTime` 在首次进入 Emergency 时设为 `paused ? pausedAt : block.timestamp`，Shutdown沿用该冻结点；两种终态均不可恢复排放或平移该截止点。

`MAX_DELTA_TIME = 30 days` 仅限制**单个计算分片**，不表示一次业务调用只能结算30天。`_updateGlobalX()` 必须在改变份额、预算、排期或清算资金前完整推进至 `targetX`，活跃但闲置超过30天的周期同样适用。防御开关及Shutdown激活按§7先记录冻结状态，不依赖计提成功；之后的金融路径仍须完整结算。

```solidity
uint256 constant MAX_CATCHUP_ITERATIONS = 50;

function _advanceGlobalX(bool requireComplete) internal {
    uint256 target = Math.min(_effectiveTime(), periodFinishX);
    uint256 iterations;
    while (lastUpdateTimeX < target && iterations < MAX_CATCHUP_ITERATIONS) {
        _accrueSliceX(target);
        ++iterations;
    }
    if (requireComplete) {
        require(lastUpdateTimeX >= target, "CATCH_UP_INCOMPLETE");
    }
}

function _updateGlobalX() internal {
    _advanceGlobalX(true);
}
```

循环不能完整推进时，业务调用必须回滚，禁止继续修改份额。另提供不要求单次完成的公开 `crankCatchUpPool(Pool)` 分批推进，保留已完成进度并发出事件；`PoolCatchUpCranked.complete` 定义为本次调用结束后 `lastUpdateTimeX >= target`，为 false 时调用方应再次调用。该公开入口在 Normal、Paused、Emergency、Shutdown 均可达，仅推进至各状态允许的冻结点，不转账、不改变份额，且**不得调用 `_assertInvariantB`**；不得依赖已失衡的物理覆盖断言而阻断合法计提。Operator / Admin 权限、锁仓判断、冷却、Timelock 等仍使用真实 `block.timestamp`，不得把奖励时钟用于这些等待期限。

#### 4.1.2 单个分片的负债、坏账与取整

**保留 v1.1 的完整排放确权语义**：非空池按 `deltaReward = rate × deltaTime` 增长奖励指数。预算不足须登记未出资缺口，同时完整预留相应债权；不能把指数改成只按实收预算增长，却仍称用户已获得完整排放债权。

```solidity
function _accrueSliceX(uint256 target) internal {
    if (target <= lastUpdateTimeX) return; // 先防止负时间差
    if (totalStakedX == 0) {
        lastUpdateTimeX = target;
        return; // 空池不消耗预算、不确权奖励
    }
    require(totalStakedX <= MAX_REWARD_SHARES_X, "REWARD_SHARE_LIMIT");

    uint256 deltaTime = Math.min(target - lastUpdateTimeX, MAX_DELTA_TIME);
    uint256 deltaReward = rewardRateX * deltaTime;
    uint256 deltaAcc = Math.mulDiv(deltaReward, REWARD_PRECISION, totalStakedX);
    uint256 oldAvailable = availableRewardsX;

    if (oldAvailable >= deltaReward) {
        // Q=REWARD_PRECISION，S<=Q，因此向上预留恰等于完整deltaReward。
        uint256 pendingDelta = Math.mulDiv(
            totalStakedX, deltaAcc, REWARD_PRECISION, Math.Rounding.Ceil
        );
        // 可等价直接pending += deltaReward；合法输入下取整余数留在 pending（orphan）。
        availableRewardsX = oldAvailable - deltaReward;
        totalPendingX += pendingDelta;
    } else {
        // 未获资金支持的奖励不得转成可用预算。
        uint256 shortfall = deltaReward - oldAvailable;
        availableRewardsX = 0;
        totalPendingX += deltaReward;
        badDebtX += shortfall;
        emit InsufficientBudget(Pool.X, shortfall, block.timestamp);
    }

    accRewardPerTokenX += deltaAcc;
    lastUpdateTimeX += deltaTime;
}
```

以上为规范伪代码，实际实现可以使用结构体/链接库，但必须保持相同的债权及资金含义。数值运算沿用checked arithmetic与完整精度 `Math.mulDiv`；每份新排期须满足§4.5的整窗表示空间检查，覆盖最小残余本金仅1原始单位的情形，不能只按开期时的TVL估算溢出风险。

**取整与守恒要求：**

- 足额分支：令 `Q = REWARD_PRECISION`、`D = deltaReward`、`0 < S = totalStaked <= Q`、`q = floor(D × Q / S)`。有 `0 <= D×Q−S×q < S <= Q`，因此指数阶段少分配金额 `D−S×q/Q < 1 weiB`，而 `pendingDelta = ceil(S×q/Q) = D`。预算减少额等于完整pending增加额，不逐片释放这部分资金；差额作为 `orphan pending` 留在 `totalPendingX`。
- 禁止使用 `floor(S×q/Q)` 作为每步pending预留，也禁止为减少预留而把误差回灌预算。用户可能跨多个分片后一次结算，累计合法债权必须由pending覆盖。
- 不足分支：`pending += D`、`badDebt += D - oldAvailable`。调整后不变量两侧等额增长；补款仅增加实收余额、减少 badDebt，不能重复增加 pending。
- 采用绝对误差验收：每个实际推进正整数秒的计提分片，指数截断少分配金额严格小于1 weiB。N个分片累计严格小于N weiB，即使其他账户反复改变份额也成立；用户自己的每次settle另有不足1 weiB的向下取整。零时间调用不产生新分片，单个最多365天的奖励窗口最多31,536,000个正时间分片，指数阶段累计误差严格小于31,536,000 weiB（3.1536e-11 B）。微额奖励的相对误差可能较大，不承诺所有金额都零误差或所有调用频率严格等价。
- 本版不跨份额变化累计分子余数，不把旧区间尾数分给新入场者；新用户继续以入场前已固化的acc作快照。精度提高、份额硬上限和完整pending预留必须共同实现，不能仅改常量或仅限制公开crank频率。
- 本版（全新部署）不存在 `dust` 字段；指数取整差额只体现为 `totalPendingX - bookedUserRewardsX` 的 orphan pending，按§7.4保护和处理。
- 本规则适用于全新部署；不涉及旧 `PRECISION=1e18` 尺度迁移。若未来存在历史状态（非本项目范围），必须另行证明并执行尺度转换，不能清零快照、裁减用户奖励或假设替换模块已完成迁移；少记pending或 `booked>pending` 同样须先对账。

完整 catch-up 后才可执行 §4.5 重锚。时间推进只增加实际计入的分片，禁止在仍有未结算历史时把锚点直接设置为当前时间。

### 4.2 用户奖励结算 _settleUserX(user)

**状态更新顺序强制约束（High · 必须）**

所有修改 `userStakedX / totalStakedX` 的入口函数，在权限与状态前置守卫通过后，必须按以下资金时序执行，禁止先改本金再结算历史奖励：

```text
①  _updateGlobalX()          // 完整 catch-up 至 min(effectiveTime, periodFinishX)
②  _settleUserX(user)        // 用旧本金快照计算历史收益，写入 rewardsX[user]
③  [所有 require 校验]       // 参数、余额、状态机检查
④  更新快照                  // userRewardPaidX[user] = accRewardPerTokenX (Fail-safe)
⑤  修改本金账本              // userStakedX += / -= ; totalStakedX += / -=
⑥  执行外部转账              // ERC20 safeTransfer / safeTransferFrom
⑦  校验本金及奖励账本覆盖      // 终末检查；明确降级路径仅记录原有B缺口，不新增缺口

```

> **入账顺序例外**：FOT入账在完成①②和必要校验后，须先按§4.6转入并测量实收，再更新⑤的本金账本；全程受共享`nonReentrant`保护。外部调用不能绕过Core与模块的身份、状态和资产行为校验。

> **禁止行为**：绝不允许先修改本金（步骤⑤），再调用 `_settleUserX(user)`。否则新本金将无端参与历史奖励的瓜分，导致“无中生有”的双重奖励攻击。

**_settleUserX 内部实现**

```solidity
function _settleUserX(address user) internal {
    // 已完整推进至本次交易统一有效计息时间，按旧本金结算
    uint256 earned = Math.mulDiv(
        userStakedX[user],
        accRewardPerTokenX - userRewardPaidX[user],
        REWARD_PRECISION
    );
    if (earned > 0) {
        // 仅修改个人账本，严禁再累加全局 totalPendingX 造成复算
        rewardsX[user] += earned;
        // booked 与 rewards 必须同步；该递增只能发生在这里
        bookedUserRewardsX += earned;
    }
    // 所有入口都在 settle 内固化快照，earned == 0 时也必须更新。
    userRewardPaidX[user] = accRewardPerTokenX;
}

```

> **`bookedUserRewardsX` 同步约束（强制）**：`bookedUserRewardsX` 的**递增只能发生在 `_settleUserX` 内部**。任何调用方（claim / withdraw / compound / emergency / forceClaimAll）不得在外部自行执行 `booked += earned`，否则会重复记账或漏记。`bookedUserRewardsX` 的递减只发生在实际支付（claim / withdraw / emergency forfeit）路径，与 `rewardsX[user]` 同步扣减。

> **实现与验收边界**：外层 Fail-safe 可以重复写入相同快照，但不能依赖各入口自行补写。组件/ABI需与代码核对，安全行为须满足本PRD及回归测试；现有实现不能反向覆盖本规范。

`earned`、`pendingReward`等预览须使用同一REWARD_PRECISION、取整和catch-up规则；ABI/索引器明确新指数尺度。WADP加权时间、TokenA原始本金、TokenB的18位币值和现有费率计算不因奖励指数尺度变化而改变。

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

    require(oldTimestamp <= block.timestamp, "INVALID_STAKE_TIMESTAMP");
    // 与原向上取整加权平均等价，避免预先计算金额×绝对时间戳。
    return oldTimestamp + Math.mulDiv(
        addedAmount, block.timestamp - oldTimestamp,
        oldStaked + addedAmount, Math.Rounding.Ceil
    );
}

```

> **数值边界**：`oldStaked + addedAmount` 及最终结果仍使用checked arithmetic并验证参数范围；`mulDiv`避免中间乘积溢出，不代表任意输入均可表示。

> **舍入方向（实现约束）**：WADP 必须使用 **Ceil**（`PoolBWadpLib`）。Floor 会使 `stakeTimestampB` 偏旧、`holdingDuration = now - stakeTimestampB` 偏大，有利于用户、不利于协议费率阶梯。

### 4.5 空池 / 过期窗口重锚（`RewardReanchorLib`）

所有重锚先按 §4.1 完整结算旧排期，再使用 `T = _effectiveTime()`。`remainingTime = max(periodFinishX - T, 0)`；新排期统一设置 `lastUpdateTimeX = T`、`periodFinishX = T + duration`。不得在暂停中用真实时间替换 `T`。

仅允许经 **≥48h Timelock** 的治理 `scheduleRewardsA/B`、`reanchorRewardsA/B` 或取消排期入口修改周期。首笔 `stakeA/stakeB`、复投进入空B池、普通注资、罚金/没收回流、`rebalanceBudgets` 调入及 `resolveBadDebt` 剩余款均不隐式重排；Operator不能通过上述路径改变已注入预算的发放速度。空池不消耗预算，新用户只按原速率参加剩余窗口；窗口过期后等待治理重锚。

| 条件 | 行为 |
| --- | --- |
| 治理显式重排活跃窗口，且 `remainingTime > 0` | `rawRate = availableRewards / remainingTime`，`rate = min(rawRate, MAX_REWARD_RATE_X)`；正速率保留原结束时间 |
| 治理重排时活跃窗预算小到 `rawRate == 0` | 允许微排放：`rate = 1 wei/秒`、`duration = availableRewards / rate`，按T重设结束时间与锚点，保证不超预算 |
| 治理重锚时 `remainingTime == 0` 且 `availableRewards > 0` | 按下述过期窗算法建立新排期 |
| 无预算 | 不重锚，不开启零预算排期 |

**共同排期不变量（强制）：**

```text
0 < rewardRateX <= MAX_REWARD_RATE_X
rewardRateX * (periodFinishX - lastUpdateTimeX) <= availableRewardsX
lastUpdateTimeX == T                  // 新排期建立时
```

以上约束适用于新建立的排期及其正常足额计提。若既有或异常排期已经欠预算，仍须按 §4.1 登记完整pending与badDebt，不能用排期预算断言回滚这部分债权结算；建立下一份排期前再恢复上述约束。因cap不能排完的预算、整秒/整除余数留在 `availableRewards`，等待后续治理排期或重锚；不属于已经发出的用户奖励。

**指数表示空间（所有开启/重排入口强制）：** 完整catch-up之后，对最终候选 `rate`、`duration>0` 验证：

```solidity
uint256 headroom = (type(uint256).max - accRewardPerTokenX) / REWARD_PRECISION;
require(rate <= headroom / duration, "REWARD_INDEX_CAPACITY");
```

该检查按未来本金可能降至1原始单位的最坏情况计算，保证整窗累计指数增长不超过 `rate×duration×REWARD_PRECISION`，涵盖中途stake、withdraw、compound及catch-up分片。不能只检查单次乘法或当前TVL；`scheduleRewards`、活跃窗重排、过期/微排放重锚均须在最终候选确定后检查，再写周期。表示空间不足只拒绝新排期，不清零acc/paid，不允许通过重锚重置累计指数；已验证旧窗口仍须可结算、取消及退出。普通fund不改变排期，unpause平移不增加剩余计息秒数，均不消耗新的窗口额度。指数是有限表示范围，额度耗尽后的新排放须另行评审迁移。

**过期窗算法：**

```text
B = availableRewardsX; C = MAX_REWARD_RATE_X
require(B > 0 && C >= 1)
if B < MIN_REWARD_DURATION:       // 数值单位：wei / (1 wei/秒)
    duration = B; rate = 1            // 微排放是治理过期重锚的明确例外
else:
    duration = min(MAX_REWARD_DURATION,
                   max(MIN_REWARD_DURATION, ceilDiv(B, C)))
    rate = min(C, floor(B / duration))
require(rate > 0 && rate * duration <= B)
lastUpdateTimeX = T
periodFinishX = T + duration
rewardRateX = rate
```

**不得**计算 `duration = ceilDiv(B, C)` 后仍无条件保留 `rate = C`；只要不能整除，就会承诺超过预算并制造虚假坏账。必须在最终时长确定后重新向下取整速率。`MIN_REWARD_DURATION` 是主动指定周期的下限；治理重锚中的少量预算微排放可短于此下限，适用于上表活跃窗和过期窗的对应分支，不影响锁仓、冷却或治理期限。

**绝对速率上限：**

$$
MAX\_REWARD\_RATE\_X = \frac{\text{maxTotalSupplyBForRewardRateCap} \times MAX\_APR\_BP}{BASIS\_POINTS \times SECONDS\_PER\_YEAR}
$$

该公式限制每秒TokenB排放量，不能据此声称实际用户APR不超过200%；B池实际本金、A/B计价关系另行影响收益展示。

治理重锚超过速率上限时clamp并保留余额；显式指定时长的治理排期仍可因超cap回滚。新速率仅以完整结算后的`availableRewards`为资金基数，旧周期leftover已包含其中，不得再相加；注资与排期接口按§6.2分离。

### 4.6 FOT（Fee-On-Transfer）税费承担原则

本协议对 FOT 类 ERC20 采用**对称、由用户承担**的税费模型：池子金库不为用户补贴链上转账税，避免不可持续的隐性补贴与账本/物理余额长期偏离。

| 方向 | 行为 | 账本语义 |
| --- | --- | --- |
| **入账**（`stakeA` / `stakeB` / `fundRewards*` / 兼容`notifyRewardAmount*(amount,0)` / `resolveBadDebt`） | 分别测量付款人与合约余额；付款人实际扣款必须等于请求`amount`，合约实收`received`不得超过`amount`；若隐含税率超过 `maxTransferFeeBP` 则回滚 | `user.staked`、`availableRewards`、坏账清偿等按 **实收 net** 记账 |
| **出账**（`claimA` / `claimB` / `withdrawA` / `withdrawB` / `forceClaimAll` / `emergencyWithdraw*` / `claimFees` / `recoverToken` / `forceShutdownFinalize`） | 按账面 **gross** 调用 `FOTTransferLib.transferGross`；**不 gross-up**；转出后要求金库实际扣款恰为gross，并校验收款方 implied fee ≤ `maxTransferFeeBP` | `user.rewards`、提现 `netAmount`、治理 sweep 等为合约转出额；钱包实收可能更低 |

**转账校验（必须）**：入账要求`payerBefore - payerAfter == amount`、`0 < received <= amount`；非零gross出账要求`vaultBefore - vaultAfter == gross`、`0 < netReceived <= gross`。sender额外扣税、rebase/reflection等不符合该模型的资产拒绝。损耗上限比较使用完整精度`Math.mulDiv(..., Math.Rounding.Ceil)`，例如`received >= ceil(amount × (BASIS_POINTS-maxTransferFeeBP)/BASIS_POINTS)`，不得先用可能溢出的普通乘法比较。保留原`0 <= maxTransferFeeBP <= 10000`配置范围；0必须严格无损，10000仍受本金/实收非零及上述sender扣款规则约束，不等于取消安全校验。零gross不调用Token，收款方不得为Core。

**链上辅助**：`FOTTransferLib.walletReceiveAfterFee(gross, maxTransferFeeBP, BASIS_POINTS)` 与 `transferGross` 供库内及链下预览共用同一公式。

**前端要求（产品）**

* 当 `maxTransferFeeBP > 0` 时，Claim / Withdraw 预览须区分：
  * **合约转出额**（链上 `rewards` 或扣费后本金净额）；
  * **预计钱包到手**（按 `maxTransferFeeBP` 上限估算，非保证值；实际以 Token 合约税率为准）。
* 标准 ERC20 生产部署可将 `maxTransferFeeBP` 设为 **0**（出入账均要求无损转账，`received == gross`；若 Token 事后加税则相关路径 `ExcessiveTransferFee` 回滚）。
* 若 TokenB 可能为 FOT，应部署非零 cap（如默认 `1000` = 10%）并配合前端 FOT 提示。

**合理性说明（设计取舍）**

* FOT 税是 Token 合约属性，任意钱包间转账均可能扣税；由协议池子补贴会使金库持续失血且难以审计。
* 入账已按实收 net 记账，出账由用户承担转出税在语义上**对称、可预期**。
* 行业常见做法为披露税率 + 前端估算到手；本协议以 `maxTransferFeeBP` 提供链上封顶保护，拒绝超出容忍度的恶意高税 Token。

> **非 FOT 费用**：Pool B 的 `withdrawFeeBP` / `midTermFeeBP` / `penaltyFeeBP` 等**协议费**仍按 PRD 既有流向表处理（留池或记入 `unclaimedFeesB`），与 FOT 链上转账税无关。

---

## 5. 详细功能需求

### 5.1 StakeA（质押 TokenA）/ StakeB（质押 TokenB）

**前置条件**

```solidity
require(!paused && !emergencyMode && !shutdownMode, "WRONG_STATE");
require(amount > 0, "ZERO_AMOUNT"); // minStake在实收后检验
// 移除旧版的粗暴 Cap 检查，移至后方处理真实入账

```

**执行步骤（严格顺序）**

1. `_updateGlobalX()` 完整 catch-up 后 `_settleUserX(user)` — 使用旧本金固化历史收益。
2. 保持旧份额与快照，空池/非空池均不由用户入场触发排期变更。
3. FOT 净入账防御与 Cap 检查：
```solidity
uint256 balBefore = stakingTokenX.balanceOf(address(this));
uint256 payerBefore = stakingTokenX.balanceOf(user);
stakingTokenX.safeTransferFrom(user, address(this), amount); // Core传入的真实用户
uint256 received = stakingTokenX.balanceOf(address(this)) - balBefore;
require(payerBefore - stakingTokenX.balanceOf(user) == amount, "SENDER_DEBIT_MISMATCH");
require(received > 0, "ZERO_RECEIVED");

// 【安全基线】按配置税费上限和实收金额校验，不硬编码10%上限
require(received <= amount, "UNEXPECTED_RECEIVED");
require(received >= Math.mulDiv(amount, BASIS_POINTS - maxTransferFeeBP,
    BASIS_POINTS, Math.Rounding.Ceil), "EXCESSIVE_FEE");
require(received >= minStakeAmountX, "BELOW_MIN_STAKE");
require(totalStakedX <= MAX_REWARD_SHARES_X, "REWARD_SHARE_LIMIT");
require(received <= MAX_REWARD_SHARES_X - totalStakedX, "REWARD_SHARE_LIMIT");

// 【核心修复】必须使用真实入账金额 received 进行 Cap 检查，防止 FOT 扣税导致提前爆表
require(maxTVLCapX == 0 || totalStakedX + received <= maxTVLCapX, "CAP_EXCEEDED");

```


4. **WADP 更新（仅B）**：`stakeTimestampB[user] = _updateWADP(userStakedB[user], stakeTimestampB[user], received)`；A不写此字段。
5. **更新快照 (Fail-safe)**：`userRewardPaidX[user] = accRewardPerTokenX`
6. **修改本金**：`userStakedX[user] += received; totalStakedX += received`
7. **Rolling Lock（仅B）**：`unlockTimeB[user] = _updateRollingLock(unlockTimeB[user], lockDuration)`；A无锁。
8. **不触发重锚**：首笔入场、空池入场及过期窗口均不修改rate/finish；按原窗口计提，过期预算等待§4.5治理排期。

9. **终检与事件**：
   - `stakeA`：只校验 TokenA 本金覆盖 `stakingTokenA.balanceOf(address(this)) >= totalStakedA`，**禁止调用 `_assertInvariantB()`**（B 池缺口或 TokenB 查询失败不得阻断 A 入金）。
   - `stakeB`：调用 `_assertInvariantB()`。
   - emit `Staked(...)`。

### 5.2 CompoundB（复投：Pool A/B 奖励 → Pool B 本金）

**完整步骤顺序（Critical · 必须）**

```text
步骤 1：状态与冷却校验
  require(!paused && !emergencyMode && !shutdownMode)
  require(lastClaimTime[user] == 0 || block.timestamp >= lastClaimTime[user] + CLAIM_COOLDOWN)

步骤 2：完整结算与坏账检查（必须在本金变更前）
  _updateGlobalA() // 完整 catch-up
  _updateGlobalB()
  require(badDebtA == 0 && badDebtB == 0, "BAD_DEBT_EXISTS") // 包含本次计提新增坏账

步骤 3：用户收益结算（settle 在本金变更前）
  _settleUserA(user)
  _settleUserB(user)

步骤 4：读取收益并执行前置校验（Check 先于 Effect，遵循 CEI）
  rA = rewardsA[user]; rB = rewardsB[user]
  require(rA + rB > 0)
  require(totalStakedB <= MAX_REWARD_SHARES_B, "REWARD_SHARE_LIMIT")
  require(rA + rB <= MAX_REWARD_SHARES_B - totalStakedB, "REWARD_SHARE_LIMIT")
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
  // 只豁免业务TVL cap 与 minStakeAmountB（无外部转账、无 dust 攻击面）；
  // 步骤4的奖励数值硬上限与 MAX_REWARD_SHARES_B 不可豁免，超限整笔回滚并保留原奖励。
  // 旨在防止池子接近饱满时直接卡死用户的自动复投。
  userStakedB_before = userStakedB[user]
  userStakedB[user] += (rA + rB)
  totalStakedB += (rA + rB)

步骤 9：Rolling Lock B 与 WADP 更新（A池时间严禁修改）
  unlockTimeB[user] = _updateRollingLock(unlockTimeB[user], lockDuration)
  stakeTimestampB[user] = _updateWADP(userStakedB_before, stakeTimestampB[user], rA + rB)

步骤 10：保持B池排期不变
  // 复投只将已确权奖励转为本金，不因空池/过期/预算存在而隐式重排。
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
require(shutdownMode || !paused, "PAUSED");
require(!emergencyMode || shutdownMode, "EMERGENCY_MODE: use emergencyWithdraw");
require(amount > 0 && amount <= userStakedA[user], "INVALID_AMOUNT");

_updateGlobalA();
_settleUserA(user);
// 转出前确认全池A本金覆盖（用扣减前的 totalStakedA），B缺口不阻断足额A本金退出
require(stakingTokenA.balanceOf(address(this)) >= totalStakedA, "PRINCIPAL_DEFICIT_A");

// 扣减本金、更新指数快照后，全额转出 TokenA 本金；fee/penalty 为 0
userStakedA[user] -= amount;
totalStakedA -= amount;
FOTTransferLib.transferGross(stakingTokenA, user, amount, maxTransferFeeBP, BASIS_POINTS);

// 禁止在本函数末尾调用 _assertInvariantB()：B 池缺口或 TokenB 查询失败不得阻断 A 退本。
// 只依赖上面的 TokenA 本金覆盖检查。

```

#### 5.3.2 Early Exit Pool B (会计闭环)

**分支选择（强制，顺序不可交换）**：

```solidity
if (block.timestamp < unlockTimeB[user]) {
    // Early Exit：走 §5.3.2
} else {
    // Mature：走 §5.3.3 费率阶梯
}
```

- **Shutdown 不改变分支**：仍按 `unlockTimeB` 判断 Early / Mature，只忽略 `paused`。
- **Emergency（非 Shutdown）禁止 `withdrawB`**，必须走 `emergencyWithdrawB`。
- **全额退出清理**：任一分支在 `userStakedB[user] == 0` 时必须清零 `unlockTimeB[user]` 与 `stakeTimestampB[user]`，避免旧锁/旧 WADP 影响下一次 stake。

**Early Exit 的奖励没收语义（强制）**：只要走 Early Exit 分支，无论 `amount` 是全部还是部分本金，都会**放弃本池全部未领 B 奖励**（`rewardsB[user]` 全量进入 `_forfeitRewards`）。`amount` 本身仍须满足 `amount >= minEarlyExitAmountB`。

**Shutdown状态守卫**：`withdrawB`在Shutdown下忽略paused，仍按既有unlockTime、Early Exit和Mature费率分支处理；不另增免锁、免罚金或免手续费政策。完整计提使用终态冻结点，退本前须验证全池B本金物理覆盖并保护转出后的剩余本金。

**统一奖励没收助手**（也供§5.5调用）：先完成相关池计提与本人settle，`F = rewardsX[user]`；要求pending与booked均能覆盖F。令`E=max(requiredB-balanceB-badDebtA-badDebtB,0)`（实现须按安全加减顺序计算）、`m=min(F,badDebtX)`、`released=F-m`、`lossAbsorbed=min(released,E)`、`budgetReturned=released-lossAbsorbed`。`rewardsX`清零，`pendingX/bookedX`各减F，`badDebtX`减m，仅`budgetReturned`加入`availableRewardsB`。必须通过 `RewardForfeited(user, pool, forfeited=F, debtCancelled=m, lossAbsorbed, budgetReturned)` 事件同时记录三个分量；禁止把未出资奖励变预算或增加badDebt掩盖外部损失。

```solidity
// 前置状态检查同上...
require(amount >= minEarlyExitAmountB, "BELOW_MIN_EARLY_EXIT_B");

// 步骤 1：结算 B 池收益
_updateGlobalB(); _settleUserB(user);

// 步骤 2：按统一助手核销全部本人B奖励（先Check再Effect）
uint256 rB = rewardsB[user];
_forfeitRewards(Pool.B, user); // 同步pending/booked/badDebt及有支持的budgetReturned

// 步骤 3：奖励核销只作内部转桶，不对外转账；不能将全部rB无条件转预算。

// 步骤 4：罚金计算与路由（留在合约，不对外转账）
uint256 penalty = amount * penaltyFeeBP / BASIS_POINTS;
availableRewardsB += penalty;

// 步骤 4b：罚金/没收回流均不重排；新排期只能由§4.5治理入口建立。

// 步骤 5：强固化债务快照 (Fail-safe)
userRewardPaidB[user] = accRewardPerTokenB;

// 步骤 6：扣减本金与净额转账
uint256 net = amount - penalty;
require(rewardTokenB.balanceOf(address(this)) >= totalStakedB, "PRINCIPAL_DEFICIT_B");
userStakedB[user] -= amount;
totalStakedB -= amount;

// 全额退出时必须清理锁与 WADP 起点，避免旧状态影响下一次 stake
if (userStakedB[user] == 0) {
    unlockTimeB[user] = 0;
    stakeTimestampB[user] = 0;
}

// 步骤 7：执行转账与不变量终检
FOTTransferLib.transferGross(rewardTokenB, user, net, maxTransferFeeBP, BASIS_POINTS);
require(rewardTokenB.balanceOf(address(this)) >= totalStakedB, "PRINCIPAL_DEFICIT_B_AFTER");
_assertInvariantB();
emit Withdrawn(user, amount, penalty, true, Pool.B);  

```

> **注意**：正常 **`withdrawA` 不产生** Early Exit 本金罚金、也不外转 TokenA 手续费；已确权奖励通过 **`claimA`** 领取。仅在 **`emergencyWithdrawA`** 等紧急路径下，未领奖励按上述统一助手核销，仅有资金支持且未吸收既有缺口的部分记入 **`availableRewardsB`**（见 §5.5）。

#### 5.3.3 Pool B：Mature Withdraw 费率阶梯（费用留存账本）

**本小节仅描述 Pool B**：`withdrawB` 在**已过锁定期**（非 Early Exit）时，按持仓时长匹配 `withdrawFeeBP` / `midTermFeeBP` / `0`，手续费计入 **`unclaimedFeesB`**（TokenB 留在合约）。**Pool A 无对称逻辑**——`withdrawA` 无费率阶梯、无 `unclaimedFees` 分支。

```solidity
// 步骤 1：必须先结算全局与个人收益，防止奖励丢失 (Critical)
_updateGlobalB();
_settleUserB(user);

// 步骤 2：持仓时长与费率匹配（仅 B：stakeTimestampB / unlockTimeB）
require(stakeTimestampB[user] > 0, "INVALID_STAKE_TIMESTAMP");
require(amount > 0 && amount <= userStakedB[user], "INVALID_AMOUNT");

uint256 holdingDuration = block.timestamp - stakeTimestampB[user];
uint256 currentFeeBP = holdingDuration < FEE_TIER_1
    ? withdrawFeeBP
    : (holdingDuration < FEE_TIER_2 ? midTermFeeBP : 0);

uint256 fee = amount * currentFeeBP / BASIS_POINTS;
uint256 net = amount - fee;

// 步骤 3：手续费路由 — TokenB 进入系统账本
if (fee > 0) {
    unclaimedFeesB += fee;
}

// 步骤 4：转出前确认全池 B 本金覆盖（使用扣减前的 totalStakedB）
require(rewardTokenB.balanceOf(address(this)) >= totalStakedB, "PRINCIPAL_DEFICIT_B");

// 步骤 5：强固化快照并在后扣减本金 (Fail-safe)
userRewardPaidB[user] = accRewardPerTokenB;
userStakedB[user] -= amount;
totalStakedB -= amount;

// 全额退出时必须清理锁与 WADP 起点，避免旧状态影响下一次 stake
if (userStakedB[user] == 0) {
    unlockTimeB[user] = 0;
    stakeTimestampB[user] = 0;
}

// 步骤 6：执行转账与终检
FOTTransferLib.transferGross(rewardTokenB, user, net, maxTransferFeeBP, BASIS_POINTS);
require(rewardTokenB.balanceOf(address(this)) >= totalStakedB, "PRINCIPAL_DEFICIT_B_AFTER");
_assertInvariantB();
emit Withdrawn(user, amount, fee, false, Pool.B);

```

### 5.4 claimA / claimB 与 forceClaimAll

**分池领取 `claimA()` / `claimB()`（刚性兑付）**

两函数共享 `lastClaimTime` 与 `claimCooldown`（首次成功 claim/compound/forceClaim 后生效）。各自只结算并支付对应池的 `rewards`（均为 TokenB）。

```solidity
require(shutdownMode || !paused, "PAUSED");
require(!emergencyMode || shutdownMode, "EMERGENCY_MODE");
require(lastClaimTime[msg.sender] == 0 ||
    block.timestamp >= lastClaimTime[msg.sender] + CLAIM_COOLDOWN, "COOLDOWN");

// 【强制】跨池 badDebt 检查要求两池都已完整计提；settle 只针对目标池。
// 这与 §10.2 "claim 结算对应池" 不冲突：对应池指 settle 目标，计提更新需要两池。
_updateGlobalA();
_updateGlobalB();
_settleUserX(msg.sender);

require(badDebtA == 0 && badDebtB == 0, "BAD_DEBT_EXISTS"); // 任一池坏账则两池标准 claim 均阻断

uint256 reward = rewardsX[msg.sender];
require(reward > 0, "NOTHING_TO_CLAIM");
// Shutdown 下豁免最小领取额；非 Shutdown 仍严格校验。
// 存在 badDebt 时本入口已被上面的 badDebt 守卫阻断，不属于此分支。
if (!shutdownMode) {
    require(reward >= minClaimAmount, "BELOW_MIN_CLAIM");
}

// 足额物理覆盖检查通过后，先改账本再转账（CEI）
rewardsX[msg.sender] = 0;
totalPendingX -= reward;
bookedUserRewardsX -= reward;
lastClaimTime[msg.sender] = block.timestamp;

FOTTransferLib.transferGross(rewardTokenB, msg.sender, reward, maxTransferFeeBP, BASIS_POINTS);
_assertInvariantB();   // 此时两池 badDebt 已确认为 0

uint256 paidA = X == Pool.A ? reward : 0;
uint256 paidB = X == Pool.B ? reward : 0;
emit Claimed(msg.sender, paidA, paidB, block.timestamp);

```

> **为什么 `claimA/claimB` 要更新两池**：`badDebtA == 0 && badDebtB == 0` 是跨池守卫。若只更新目标池，另一池的 `badDebt` 可能是旧值，导致"看起来没坏账、实际有"时错误放行领取。
>
> **代价**：单池 claim 的 gas 会包含另一池的 catch-up。这是正确性优先于 gas 的取舍。若未来要优化，只能改为"只检查目标池 badDebt"，不能保留跨池检查却只更新单池。

**`forceClaimAll()`：跨池领取 / 坏账逃生舱**

> **UX 指引**：Normal健康态保留跨池足额领取，各非零池奖励须独立达到`minClaimAmount`；仅在`shutdownMode`或任一池`badDebt>0`时豁免最小额并允许部分兑付。本入口**只核销实际支付的gross，未支付债权保留**，不会默认替用户放弃余款。仍遵守首次成功领取后的共享冷却。

```solidity
function forceClaimAll() external nonReentrant {
    require(shutdownMode || !paused, "PAUSED");
    require(!emergencyMode || shutdownMode, "EMERGENCY_MODE");
    require(lastClaimTime[msg.sender] == 0 ||
        block.timestamp >= lastClaimTime[msg.sender] + CLAIM_COOLDOWN, "COOLDOWN");

    _updateGlobalA(); _updateGlobalB(); // 状态判断包含本次完整计提新产生的坏账
    _settleUserA(msg.sender); _settleUserB(msg.sender);
    require(totalPendingA >= badDebtA && totalPendingB >= badDebtB, "DEBT_EXCEEDS_PENDING");

    uint256 rA = rewardsA[msg.sender];
    uint256 rB = rewardsB[msg.sender];
    require(rA + rB > 0, "NOTHING_TO_CLAIM");
    uint256 reserved = totalStakedB + unclaimedFeesB
        + availableRewardsA + availableRewardsB;
    uint256 balanceB = rewardTokenB.balanceOf(address(this));
    uint256 liquid = balanceB > reserved ? balanceB - reserved : 0;
    uint256 payA;
    uint256 payB;

    if (!shutdownMode && badDebtA == 0 && badDebtB == 0) {
        // 健康态须足额领取；不允许无坏账时默默转为部分支付。
        if (rA > 0) require(rA >= minClaimAmount, "BELOW_MIN_CLAIM_A");
        if (rB > 0) require(rB >= minClaimAmount, "BELOW_MIN_CLAIM_B");
        require(totalPendingA >= rA && totalPendingB >= rB, "INSUFFICIENT_PENDING");
        require(liquid >= rA + rB, "INSUFFICIENT_LIQUIDITY");
        payA = rA; payB = rB;
    } else {
        // 保留原Pool A→Pool B支付优先顺序；每池只使用已出资pending上限。
        uint256 eligibleA = Math.min(rA, totalPendingA - badDebtA);
        uint256 eligibleB = Math.min(rB, totalPendingB - badDebtB);
        payA = Math.min(eligibleA, liquid);
        payB = Math.min(eligibleB, liquid - payA);
    }
    uint256 paid = payA + payB;
    require(paid > 0, "NO_PAYABLE_LIQUIDITY");
    rewardsA[msg.sender] -= payA; totalPendingA -= payA; bookedUserRewardsA -= payA;
    rewardsB[msg.sender] -= payB; totalPendingB -= payB; bookedUserRewardsB -= payB;
    lastClaimTime[msg.sender] = block.timestamp;

    FOTTransferLib.transferGross(rewardTokenB, msg.sender, paid, maxTransferFeeBP, BASIS_POINTS);

    // 健康路径：完整 B 覆盖断言（余额 + 账本）。
    // 降级路径：只做账本内部一致性检查，不查真实余额，避免既有缺口阻断合法部分兑付。
    if (!shutdownMode && badDebtA == 0 && badDebtB == 0) {
        _assertInvariantB();
    } else {
        require(bookedUserRewardsA <= totalPendingA && bookedUserRewardsB <= totalPendingB,
                "BOOKED_EXCEEDS_PENDING");
        require(badDebtA <= totalPendingA && badDebtB <= totalPendingB,
                "DEBT_EXCEEDS_PENDING");
    }

    emit ForceClaimed(msg.sender, payA, payB,
        rewardsA[msg.sender], rewardsB[msg.sender], block.timestamp);
}
```

零支付、转账税或sender扣款异常均整笔回滚，不核销债权、不刷新冷却。付款不减少badDebt，不把未付部分转预算；资金不足的余款继续留在rewards/booked/pending，补款后可再领取。事件中的remaining/unpaid字段改为“仍保留债权”，ABI/索引器不得沿用旧“已放弃”的含义。

### 5.5 EmergencyWithdrawA / EmergencyWithdrawB

```solidity
require(emergencyMode == true && !shutdownMode, "NOT_EMERGENCY"); // 忽略paused
_updateGlobalA(); _settleUserA(user); // 完整到terminalRewardTime允许的冻结点
_updateGlobalB(); // A奖励回流B预算前，先固定B历史；B退出使用对应B结算

uint256 principal = userStakedA[user];
require(principal > 0, "NO_STAKE");
require(stakingTokenA.balanceOf(address(this)) >= totalStakedA, "PRINCIPAL_DEFICIT_A");
uint256 forfeited = rewardsA[user];
_forfeitRewards(Pool.A, user); // 按§5.3.2核销debt/吸收缺口，仅有支持部分回流B
userStakedA[user] = 0;
totalStakedA -= principal;
FOTTransferLib.transferGross(stakingTokenA, user, principal, maxTransferFeeBP, BASIS_POINTS);
emit EmergencyWithdrawn(user, principal, forfeited, Pool.A, block.timestamp);
// B奖励账目缺口只报告，不回滚足额A退本；A本金和转账扣款检查仍强制执行。
```

`emergencyWithdrawB` 与 A 对称：退出本人全部 B 本金、免锁免协议费，明确放弃本池全部未领奖励并调用同一核销助手；退本前要求 `balanceB >= totalStakedB`，保护全池本金，不在本金不足时让先到者全额领走；全退后清零 B 锁/WADP。另一池本金与奖励保持不变。终态回流不触发重排，既存奖励缺口只报告，不能豁免本金覆盖、sender扣款、完整计提或账本核销正确性。

```solidity
require(emergencyMode == true && !shutdownMode, "NOT_EMERGENCY"); // 忽略 paused
_updateGlobalB();
_settleUserB(user);

uint256 principalB = userStakedB[user];
require(principalB > 0, "NO_STAKE");
require(rewardTokenB.balanceOf(address(this)) >= totalStakedB, "PRINCIPAL_DEFICIT_B");

uint256 forfeitedB = rewardsB[user];
_forfeitRewards(Pool.B, user); // 核销 debt / 吸收既有缺口，仅有支持部分回流 availableRewardsB

userStakedB[user] = 0;
totalStakedB -= principalB;
unlockTimeB[user] = 0;        // 全退后清零 B 锁
stakeTimestampB[user] = 0;    // 全退后清零 WADP 起点

FOTTransferLib.transferGross(rewardTokenB, user, principalB, maxTransferFeeBP, BASIS_POINTS);
require(rewardTokenB.balanceOf(address(this)) >= totalStakedB, "PRINCIPAL_DEFICIT_B_AFTER");
emit EmergencyWithdrawn(user, principalB, forfeitedB, Pool.B, block.timestamp);
```

---

## 6. 奖励通知与治理预算调拨

### 6.1 手续费与罚金流向表

| 场景 | Token 类型 | 费率 | 罚金/费用去向 |
| --- | --- | --- | --- |
| WithdrawA（正常） | TokenA | **0**（无锁、无本金费） | 本金全额转回用户；**无** `penaltyFeeBP` / `withdrawFeeBP` 分支 |
| EmergencyWithdrawA/B | TokenB（已确权未领奖励部分） | 按§5.3.2统一核销 | 先抵对应badDebt、再吸收既存物理缺口，仅有支持余款记入 **`availableRewardsB`** |
| WithdrawB (本金罚金) | TokenB | `penaltyFeeBP` | **`availableRewardsB`** (留在合约) |
| WithdrawB (没收奖励) | TokenB | 全部没收 | 按统一助手先核销债务/吸收缺口，仅有支持余款进入 **`availableRewardsB`** |
| Mature Withdraw（仅 B） | TokenB | `withdrawFeeBP` / `midTermFeeBP` / 0（按持仓阶梯） | **`unclaimedFeesB`** (留存在合约，待提取) |

> **业务说明：与「Pool A 无锁无费」一致的路由**
> 正常 **`withdrawA` 不没收、不外转** 与 Pool A 相关的 TokenB 奖励；用户通过 **`claimA`** 领取 Pool A 奖励。仅在 **`emergencyWithdrawA`** 等紧急路径下，为保全本金退出，将已确权未领的TokenB奖励按§5.3.2核销，仅有支持余款回流至 **`availableRewardsB`**，与 Pool B 预算联动。

### 6.2 奖励注入 notifyRewardAmountX

**注资与排期分离（Operator / Timelock）**

`fundRewardsA/B(amount)`由Operator执行，仅增加对应池预算，不开启、取消或重排周期。**本项目不保留旧 `notifyRewardAmountX(amount, duration)` 兼容入口**，所有 Operator 注资统一走 `fundRewardsA/B`，不再区分 `duration`。`setRewardDurationX`仅供治理`scheduleRewardsX(0)`读取，不再赋予任何旧 `notify` 入口以排期权限。

纯注资的payer为Core识别的实际Operator调用者，不允许任填已授权的其他账户。

**前置条件**

```solidity
require(!paused && !emergencyMode && !shutdownMode, "WRONG_STATE"); // 保留原普通注资状态限制
require(amount > 0, "ZERO_AMOUNT");
```

**执行步骤（防御 FOT 变种 CEI）**

> **架构声明**：为支持允许的FOT TokenB，完成旧奖励结算后采用`Check → Interaction → Effects`，全程共享`nonReentrant`并遵守§4.6。ERC1820注册探测/部署白名单不能单独证明无ERC777用户hook；仍须审核实际Token行为和所有可达重入入口。

```solidity
// 1. 先完整结算旧周期，固化已产生的债务
_updateGlobalX();

// 2. Interaction：验证真实付款人、实收及sender实际扣款
uint256 balBefore = rewardTokenB.balanceOf(address(this));
uint256 payerBefore = rewardTokenB.balanceOf(payer);
rewardTokenB.safeTransferFrom(payer, address(this), amount);
uint256 actualAmount = rewardTokenB.balanceOf(address(this)) - balBefore;
require(payerBefore - rewardTokenB.balanceOf(payer) == amount, "SENDER_DEBIT_MISMATCH");
require(actualAmount > 0 && actualAmount <= amount, "INVALID_RECEIVED");
require(actualAmount >= Math.mulDiv(amount, BASIS_POINTS - maxTransferFeeBP,
    BASIS_POINTS, Math.Rounding.Ceil), "EXCESSIVE_FEE");

// 3. Effects：仅追加预算；payer为Core识别的真实授权付款人
availableRewardsX += actualAmount;
// rewardRate / periodFinish不变；lastUpdateTime仅按步骤1推进。
_assertInvariantB();
emit RewardsFunded(Pool.X, payer, amount, actualAmount,currentTime);
```

**治理开启、重排与取消周期（≥48h Timelock）**

`scheduleRewardsA/B(duration)`仅由治理执行，Normal/Paused可用，Emergency/Shutdown禁止。先完整结算两池旧周期；要求两池badDebt清零、B物理覆盖正常。若`duration==0`使用已配置默认`rewardDurationX`，默认0则回滚；有效时长须在`[MIN_REWARD_DURATION,MAX_REWARD_DURATION]`。

> **调用前置条件（强制）**：`periodFinishX <= T`，即旧窗口必须已经结束。若 `periodFinishX > T`（仍有活跃窗口），必须改用 `reanchorRewardsA/B()`，**不得用 `scheduleRewards` 覆盖活跃周期**。否则治理可绕过 §4.5 对活跃窗 `remainingTime` 重算与速率 clamp 的约束，等价于开后门重排。

```solidity
uint256 T = _effectiveTime();
require(periodFinishX <= T, "WINDOW_ACTIVE"); // 活跃窗口必须走 reanchorRewardsX
uint256 newRate = availableRewardsX / effectiveDuration;
require(newRate > 0 && newRate <= MAX_REWARD_RATE_X, "INVALID_RATE");
require(newRate * effectiveDuration <= availableRewardsX, "UNDERFUNDED_SCHEDULE");
uint256 headroom = (type(uint256).max - accRewardPerTokenX) / REWARD_PRECISION;
require(newRate <= headroom / effectiveDuration, "REWARD_INDEX_CAPACITY");
rewardRateX = newRate;
periodFinishX = T + effectiveDuration;
lastUpdateTimeX = T;
emit RewardScheduled(Pool.X, effectiveDuration, newRate, T, periodFinishX);
```

> **`MAX_REWARD_RATE_X` 上界**：须使用部署时一次性写入的 **`maxTotalSupplyBForRewardRateCap`**（见§3.1）按附录公式推导，禁止使用运行时`rewardTokenB.totalSupply()`。旧周期leftover及carryStranded已包含在available，不再重复相加，也不重复增加available；已确权pending不能重新排期。

`reanchorRewardsA/B()`同属≥48h治理，仅Normal/Paused可用，先完整结算两池并确认两池badDebt清零及B物理覆盖正常，再按§4.5保留的活跃窗口或过期窗口算法处理现有预算；活跃窗按原remainingTime重算，rawRate为0时使用原1 wei/秒微排放，过期窗按ceil选时长后重新floor速率。该入口中的微排放可短于1天，是显式schedule周期下限的既有例外，不改变治理等待期限。`cancelRewardScheduleA/B()`仅Normal/Paused可用，先完整结算，再将rate设0、finish与lastUpdate设T，未确权预算保留available。三种排期入口均不得由用户路径、Operator、注资或回流预算间接调用。

重锚各分支均执行§4.5的最终候选headroom检查；取消窗口不建立新排放，不因无新窗口表示空间而失败。

### 6.3 治理 Setter 接口 (Admin Only)

必须实现以下函数以消耗事件定义。合约层为 **`onlyRole(ADMIN_ROLE)`**（及 `nonReentrant` 等）；**生产环境**下须由 **`TimelockController` 在达到 `minDelay`（例如 ≥48h）后** 调用治理门面再触发 Core（见 **§2.1.1**）。伪代码中的 `timelocked(48 hours)` **仅表示产品级延迟要求**，**不**表示在 Core 上实现同名修饰符。

已有`setFees`、`setLockDuration`、`setFeeRecipient`、`setMinEarlyExitAmountB`、`setMaxTransferFeeBP`沿用§3的参数边界和48h门面路径；模块及角色变更另走72h超级路径。固定排放供应cap不提供正常setter。

* `rebalanceBudgets(Pool from, Pool to, uint256 amt)`: 两池先完整结算到同一个 `effectiveTime`，再检查 `badDebtA == 0 && badDebtB == 0`。不得搬走源池维持既有排期所需的预算；调拨后的两池均须满足 §4.5 排期预算约束。只减源available、加目标available，不调用任何隐式重锚；目标后续排期另走≥48h治理入口。暂停内治理调拨使用`pausedAt`；允许先在同一治理batch取消源排期再搬走其未来预算，触发`BudgetRebalanced`。
* `claimFees()`: Admin提取`unclaimedFeesB`；先完整结算两池并要求无badDebt、物理覆盖正常，清零费用后经§4.6统一出账，保留全部本金、pending和available。
* `setMaxTVLCapX(uint256 cap)`: 触发 `MaxTVLCapUpdated`。
* `setMinStakeAmountX(uint256 amt)`: 触发 `MinStakeAmountUpdated`。
* `setRewardDurationA(uint256 duration)` / `setRewardDurationB(uint256 duration)`：`duration == 0` 清除默认；否则须在 `[MIN_REWARD_DURATION, MAX_REWARD_DURATION]`；仅供治理`scheduleRewards*(0)`使用；触发 `RewardDurationUpdated`。
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

| 操作 | Normal | Paused | Emergency | Emergency+Paused | Shutdown（含Paused） |
| --- | --- | --- | --- | --- | --- |
| stake / compound | ✅ | ❌ | ❌ | ❌ | ❌ |
| fund / 兼容仅注资notify | ✅ | ❌ | ❌ | ❌ | ❌ |
| 治理开启 / 取消 / 重排周期、预算调拨 | ⚠≥48h | ⚠≥48h，冻结时钟 | ❌ | ❌ | ❌ |
| withdraw / claim | ✅ | ❌ | ❌ | ❌ | ✅，忽略paused |
| forceClaimAll | ✅，健康足额 / 坏账部分 | ❌ | ❌ | ❌ | ✅，可部分 |
| emergencyWithdraw | ❌ | ❌ | ✅ | ✅ | ❌ |
| crankCatchUpPool | ✅ | ✅，至冻结点 | ✅，至终态冻结点 | ✅，至终态冻结点 | ✅，至终态冻结点 |
| pause | ✅ | ❌ | ✅，不改终态冻结点 | ❌ | ❌ |
| unpause | ❌ | ⚠≥48h且冷却完成 | ❌ | ❌ | ❌ |
| enableEmergencyMode | ✅ | ✅ | ❌ | ❌ | ❌ |
| shutdown | ❌ | ❌ | ⚠≥48h | ⚠≥48h | ❌ |

> **状态覆写规则**：
> 非Shutdown的Emergency状态下，`emergencyWithdrawA/B` 忽略 `paused`；进入Shutdown后改用普通清算退出入口，普通 `withdraw/claim/forceClaimAll` 忽略 `paused`。两种退出守卫不得同时生效。偿债及必要的治理维护按各自权限和安全条件执行，不能借此恢复终态排放。

**Withdraw 状态逻辑说明**

普通Withdraw与Claim操作的状态校验为：

```solidity
require(shutdownMode || !paused, "PAUSED");
require(!emergencyMode || shutdownMode, "EMERGENCY_MODE");
```

其语义等价于：

- Normal 状态：允许 Withdraw。
- Paused 状态：禁止 Withdraw。
- Emergency 状态：禁止普通 Withdraw，使用 emergencyWithdraw。
- Shutdown 状态：允许 Withdraw，完全忽略暂停标志；Pool B沿用§5.3的Early Exit / Mature费率及奖励规则，锁仓与费率年龄仍按真实时间判断，不重启排放。

锁仓、WADP、领取冷却、Timelock、停机宽限和旁路期限均使用真实 `block.timestamp`。奖励计息单独使用§4.1的有效时钟，不能混用。

### 7.2 Pause / Unpause

暂停冻结的是奖励时钟，恢复补偿冻结时仍存在的排期。各池的恢复规则独立判断，不能无条件把全部锚点改为真实now。`pause()` 是0h防御开关，只写本地状态，不依赖全局计提、Token余额查询或可能失败的不变量检查；暂停前尚未结算的收益仍按旧份额计提，不能因此被跳过。

```solidity
// pause()：权限、重复暂停与终态守卫通过后，立即记录冻结点。
paused = true;
pausedAt = block.timestamp;
unpauseAt = block.timestamp + UNPAUSE_COOLDOWN;
// Emergency中设置paused不改变terminalRewardTime；Shutdown不再接受pause。

// 暂停期间：公开crank仍可推进至min(pausedAt, periodFinishX)。
// 所有允许的预算操作先按T=pausedAt完整结算；
// 只有≥48h治理排期能按同一T建窗，不得使用真实now重锚。

// unpause()：仅非Emergency/Shutdown且已暂停；≥48h治理且冷却完成。
require(paused && !emergencyMode && !shutdownMode, "WRONG_STATE");
require(block.timestamp >= unpauseAt, "UNPAUSE_COOLDOWN");
uint256 frozenAt = pausedAt;
uint256 delta = block.timestamp - frozenAt;
_updateGlobalA(); _updateGlobalB(); // 完整推进到min(frozenAt, periodFinishX)
_restorePoolClock(poolA, frozenAt, delta);
_restorePoolClock(poolB, frozenAt, delta);
paused = false;
pausedAt = 0;
unpauseAt = 0;

function _restorePoolClock(PoolInfo storage pool, uint256 frozenAt, uint256 delta) internal {
    if (pool.periodFinish > frozenAt) {
        // 包括暂停期间由治理按冻结点新建的排期；只平移有效窗口一次。
        require(pool.lastUpdateTime == frozenAt, "CATCH_UP_INCOMPLETE");
        pool.periodFinish += delta;
        pool.lastUpdateTime += delta;
    } else {
        // 已结束/从未建立的窗口不延长、不重启，保持完成后的锚点。
        require(pool.lastUpdateTime <= pool.periodFinish, "INVALID_TIME_ANCHOR");
    }
}
```

恢复后，尚活跃排期的 `periodFinish - lastUpdateTime` 与恢复前一致，速率不因补时改变；原本已经结束的排期保持结束。后续若有预算需要再排期，必须由治理单独走 §4.5。禁止暂停与重锚各自计算一份不同的补偿区间。进入Emergency或Shutdown后禁止unpause；终态冻结点永久保留。

### 7.3 EmergencyMode（单向不可逆）

* **激活**：Operator权限，0h延迟立即生效（`enableEmergencyMode`）。**不可撤销**；激活前先从本地状态取 `cutoff = paused ? pausedAt : block.timestamp`，再写 `emergencyMode = true`、`terminalRewardTime = cutoff`。若当前已暂停，保持原 `pausedAt` 不变；若当前未暂停，同步将 `pausedAt` 设为 `block.timestamp` 以保证状态可观测一致性（Emergency 路径的 `effectiveTime` 仍走 `terminalRewardTime`，此处仅为监控与可读性）。不依赖全局计提、Token余额查询或覆盖断言，已有账目/物理缺口不能阻止这个防御开关。
* **奖励停止**：自激活起永久停止冻结点之后的新增排放、普通注资和排期；激活不改变用户份额。此前未结算区间仍须完整计提到 `min(terminalRewardTime, periodFinishX)`，再结算用户、减本金。不能先减份额再把旧收益分给剩余用户。公开crank在所有状态下可推进到各自有效上限。
* **退出**：`emergencyWithdrawA/B` 使用 `require(emergencyMode && !shutdownMode)`，完全无视暂停；免锁、免协议费，明确放弃本池未领取奖励，按§5.5的负债安全规则核销。A紧急退出向B回流预算前须先完成两池旧区间计提；B紧急退出结算B。奖励账目缺口不应通过普通B不变量阻断已经满足本金保护的紧急返本，但不豁免本金足额覆盖、FOT检查及用户账本正确性。
* **边界**：资产行为或历史账本损坏而无法完成计提/结算时，须另行修复或迁移，不承诺任意异常状态下无条件退出。A普通/Shutdown退本的独立性按§5.3执行；Emergency A仍有上述跨池计提依赖。
* **治理**：仅开放紧急退出、crank、真实偿债、必要维护及延迟Shutdown等明确路径；治理模块仍属升级信任边界，不能宣称单向开关消除了所有治理风险。
* **既有奖励冻结与治理活性**：Emergency期间，`claimA` / `claimB` / `forceClaimAll`均不可用；已在Normal全退本金、但仍保留奖励的用户也受此限制，零本金不能调用紧急退出。未实际领取或明确放弃的已记账奖励继续保留在 `rewards` / `booked` 并由 `pending` 预留；尚未settle的合法债权仍由完整pending覆盖，不因冻结而核销。领取恢复依赖Admin经≥48h Timelock路径激活Shutdown，再按§5.4的冷却、坏账与实际资金保护规则办理；该过渡不会自动发生，治理不执行时奖励可能无限期冻结。本条明确既有状态策略，不开放新的Emergency领取路径，也不将状态冻结解释为奖励已没收。

### 7.4 ShutdownMode (彻底清扫)

* **激活**：前提是 `emergencyMode == true`，经 **Timelock调度后的Admin路径**激活（延迟 **≥48h**）。只设置 `shutdownMode`、真实 `shutdownAt`，沿用 `terminalRewardTime`；不要求先解除暂停、不恢复排放，也不依赖可能失败的计提、Token查询或余额断言。
* **退出**：采用§7.1的Shutdown守卫，普通提款/领奖忽略paused；B仍沿用§5.3的提前退出/到期费率和奖励处理，不新增免费退出政策。退出前按对应池完整结算到 `min(terminalRewardTime, periodFinishX)`；终态不重排。
* **僵尸死锁防护**：保留原365天宽限和1095天旁路；旁路只放宽“所有本金已退出”的条件，不放宽用户本金/奖励的实际资金保护。

```solidity
uint256 public constant SHUTDOWN_DEADLOCK_BYPASS = 1095 days;

function forceShutdownFinalize() external onlyAdmin nonReentrant {
    require(shutdownMode, "NOT_SHUTDOWN");
    require(block.timestamp >= shutdownAt + 365 days, "GRACE_PERIOD_NOT_MET");
    if (block.timestamp < shutdownAt + SHUTDOWN_DEADLOCK_BYPASS) {
        require(totalStakedA == 0 && totalStakedB == 0, "STILL_STAKED");
    }

    _updateGlobalA(); _updateGlobalB(); // 两池完整计提到各自min(terminalRewardTime, finish)
    require(badDebtA == 0 && badDebtB == 0, "BAD_DEBT_EXISTS");
    require(bookedUserRewardsA <= totalPendingA && bookedUserRewardsB <= totalPendingB,
            "BOOKED_EXCEEDS_PENDING");
    bool hasRemainingStake = totalStakedA != 0 || totalStakedB != 0;
    uint256 keptA = hasRemainingStake ? totalPendingA : bookedUserRewardsA;
    uint256 keptB = hasRemainingStake ? totalPendingB : bookedUserRewardsB;
    uint256 removableOrphan = (totalPendingA - keptA) + (totalPendingB - keptB);

    // 任何剩余质押存在时，两池完整pending均保留，包含尚未逐用户settle的债权。
    uint256 protectedB = totalStakedB + keptA + keptB;
    uint256 bookResidual = availableRewardsA + availableRewardsB
                         + unclaimedFeesB + removableOrphan;
    uint256 balanceB = rewardTokenB.balanceOf(address(this));
    require(stakingTokenA.balanceOf(address(this)) >= totalStakedA, "PRINCIPAL_A_DEFICIT");
    require(balanceB >= protectedB, "USER_LIABILITIES_UNFUNDED");
    uint256 sweep = Math.min(bookResidual, balanceB - protectedB);
    uint256 protocolResidualWrittenDown = bookResidual - sweep;

    totalPendingA = keptA; totalPendingB = keptB;
    availableRewardsA = 0; availableRewardsB = 0;
    unclaimedFeesB = 0;
    rewardRateA = 0; rewardRateB = 0;
    periodFinishA = lastUpdateTimeA; periodFinishB = lastUpdateTimeB;
    // 不清零本金、booked、用户奖励或指数/快照，也不修改terminalRewardTime。
    if (sweep > 0) {
        FOTTransferLib.transferGross(rewardTokenB, feeRecipient, sweep, maxTransferFeeBP, BASIS_POINTS);
    }
    require(rewardTokenB.balanceOf(address(this)) >= protectedB, "USER_LIABILITIES_UNFUNDED");
    _assertInvariantB();
    emit ShutdownResidualSwept(protectedB, bookResidual, sweep, protocolResidualWrittenDown, block.timestamp);
    emit ProtocolShutdownComplete(block.timestamp);
}
```

> **语义**：实际清扫不超过账面协议残值和真实用户保护资金之外的现金。只允许预算、协议费用及已证明无人拥有的orphan承担残值减记，并发事件；不得减记用户本金、保留pending或booked。实际余额连 `protectedB` 都不足时整体回滚，保留原账本，等待真实补款，不伪报完成。无本金时可将pending裁至booked；1095天旁路后仍有本金时完整保留pending供之后settle/claim。
>
> finalize后用户仍能提本金、领取保留奖励；该动作不是销毁合约或关闭用户退出。Emergency后不再有stake/compound，finalize至少在Shutdown满365天后执行，旧B仓位自然已超过90天最大锁期及180天最高费率年龄，不需新增“Shutdown免费”分支。
>
> 可再次调用finalize，但每次均须满足相同时间、计提、无badDebt及物理保护条件。第一次已清零的预算/费用不会重复计入残值；剩余本金未全部退出前完整pending继续保留。后续全部本金退出且已逐用户settle后，可再次finalize将pending裁至booked、按同样现金上限清扫真正orphan。recover不得提前裁剪pending，也不得把未settle债权当盈余；第三方捐赠不重启排期。

### 7.5 resolveBadDebt（坏账物理修复）

> **治理策略声明 (Cross-pool Injection)**：真实补款先偿A、再偿B；若仍有多余TokenB（`rem > 0`），并入 `availableRewardsB`。这是保留的跨池预算政策，**不自动开启或重排周期**；Emergency/Shutdown下仅保留为账面预算或最终残值。

生产资金路径固定为：**持币的48h Timelock授权Core → Timelock经门面调用 → Core从该真实payer单跳拉款**。门面只暴露 `resolveBadDebt(amount)`，内部固定payer为该门面对应的48h Timelock；Core若保留 `resolveBadDebt(address payer, uint256 amount)`，必须从持ADMIN_ROLE的调用门面取得其immutable `timelockGovernance()`绑定并校验payer一致，禁止调用者任填已给Core授权的用户。门面源码、地址及角色必须按治理配置审核。

门面必须以 `public immutable address timelockGovernance` 暴露该 getter；Core 的 `onlyAdmin`（`onlyRole(ADMIN_ROLE)`）保证 `msg.sender` 为审核过的门面。

```solidity
// Core语义；门面内部固定传入其48h Timelock，不从门面中转Token。
function resolveBadDebt(address payer, uint256 amount) external onlyAdmin nonReentrant {
    // onlyAdmin已限制msg.sender为审核过的治理门面；取其现有immutable绑定。
    address governancePayer = IDualPoolStakingAdmin(msg.sender).timelockGovernance();
    require(payer == governancePayer && payer != address(0) && payer != address(this), "INVALID_PAYER");
    require(amount > 0, "ZERO_AMOUNT");
    _updateGlobalA(); _updateGlobalB(); // 包含本次计提新增缺口
    require(badDebtA > 0 || badDebtB > 0, "NO_BAD_DEBT");

    // FOT入账例外：先Interaction后Effects，在共享重入锁内按真实实收记账。
    // 辅助函数须执行§4.6的payer/Core余额差与最大损耗检查。
    uint256 rem = _transferInMeasured(rewardTokenB, payer, amount);
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
    if (totalRepaid > 0) emit BadDebtResolvedTotal(totalRepaid, block.timestamp);

    // 用户债权已在pending：补款不得重复增加pending，也不自动重排。
    if (rem > 0) availableRewardsB += rem;
    _assertInvariantB();
}
```

生产测试须覆盖真实 `Timelock.executeBatch`：由持币Timelock对Core授权本次金额，再调门面resolve，必要时在同batch清零剩余授权；不能仅mock调用者来代替资金链路。补款按实收核减badDebt，不按请求额核销。

仅有外部物理损失、没有已记录badDebt时，应真实补入代币恢复覆盖；这种恢复资金不再增加available/pending。不得通过fund把同一笔修复资金又记作未来预算；实际资金不足不能靠虚增badDebt解除。

### 7.6 recoverToken（防窃取修正）

仅允许回收 **Pool A 质押代币（TokenA）** 或 **Pool B / 奖励代币（TokenB）**；其他 ERC20 一律 `TokenRecoveryRestricted`。

```solidity
require(amount > 0 && to != address(0) && to != address(this), "INVALID_RECOVERY");
// TokenA只恢复全池本金之外的真实盈余，不用B不变量阻断独立A资产检查。
if (token == address(stakingTokenA)) {
    uint256 balanceA = stakingTokenA.balanceOf(address(this));
    require(balanceA > totalStakedA, "NO_EXCESS_TOKEN_A");
    require(amount <= balanceA - totalStakedA, "CANNOT_RECOVER_STAKED_TOKEN_A");
}
else if (token == address(rewardTokenB)) {
    require(badDebtA == 0 && badDebtB == 0, "BAD_DEBT_EXISTS");
    // 必须保护本金、待付负债、预算与手续费（与 _assertInvariantB required 一致）
    uint256 required = totalStakedB + totalPendingA + totalPendingB
                      + availableRewardsA + availableRewardsB + unclaimedFeesB;
    uint256 balance = rewardTokenB.balanceOf(address(this));
    require(balance > required, "NO_EXCESS_TOKEN_B");
    require(amount <= balance - required, "EXCEEDS_EXCESS");
} else {
    revert TokenRecoveryRestricted();
}

FOTTransferLib.transferGross(IERC20(token), to, amount, maxTransferFeeBP, BASIS_POINTS);
// 转后再次校验对应资产保护；TokenB必须仍覆盖完整required，不能用booked替代pending。
emit TokenRecovered(token, amount, to);
```

> **`forceShutdownFinalize`** 清扫同样经 `FOTTransferLib.transferGross` 转至 `feeRecipient`。recover不重排、不改份额或预算；全部pending（含未settle债权和保守保留的orphan）均计入required，且TokenB须无badDebt。

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
event RewardForfeited(address indexed user, Pool indexed pool, uint256 forfeited,
    uint256 debtCancelled, uint256 lossAbsorbed, uint256 budgetReturned);

// ── 管理员与系统操作事件 ──────────────────────────────────────────────────
// RewardNotified仅保留旧ABI记录；修订后的fund与schedule用独立事件，不混用旧语义。
event RewardNotified(Pool indexed pool, uint256 amount, uint256 duration, uint256 rate);
event RewardsFunded(Pool indexed pool, address indexed payer, uint256 requested, uint256 received, uint256 currentTime);
event RewardScheduled(Pool indexed pool, uint256 duration, uint256 rate, uint256 effectiveStart, uint256 finish);
event RewardScheduleCancelled(Pool indexed pool, uint256 remainingBudget, uint256 at);
event PoolCatchUpCranked(Pool indexed pool, uint256 lastUpdateTime, bool complete, uint256 at);
event BudgetRebalanced(Pool indexed from, Pool indexed to, uint256 amount, uint256 at);
// Paused / Unpaused 沿用 OZ Pausable 原生事件，不重新声明：
//   event Paused(address account);
//   event Unpaused(address account);
// 暂停时间点通过公开状态 pausedAt / unpauseAt 读取，不写入事件。
event UserModuleUpdated(address indexed oldModule, address indexed newModule, uint256 at);
event AdminModuleUpdated(address indexed oldModule, address indexed newModule, uint256 at);
event SuperAdminTransferred(address indexed oldSuperAdmin, address indexed newSuperAdmin, uint256 at);
event EmergencyModeActivated(address indexed by, uint256 at);
event ShutdownActivated(address indexed by, uint256 at); 
event ProtocolShutdownComplete(uint256 at);
event ShutdownResidualSwept(uint256 protectedB, uint256 bookResidual, uint256 swept, uint256 protocolResidualWrittenDown, uint256 at);
event BadDebtResolved(Pool indexed pool, uint256 amount, uint256 at); 
event BadDebtResolvedTotal(uint256 totalRepaid, uint256 at);
event InvariantViolated(uint256 actual, uint256 required, uint256 at);
event InsufficientBudget(Pool indexed pool, uint256 shortfall, uint256 at); 
event TokenRecovered(address indexed token, uint256 amount, address indexed to);

// ── 参数变更事件 ──────────────────────────────────────────────────────────
event FeeRecipientUpdated(address indexed oldAddr, address indexed newAddr, uint256 at);
event FeesUpdated(uint256 penaltyBP, uint256 withdrawBP, uint256 midTermBP, uint256 at);
event LockDurationUpdated(uint256 oldDuration, uint256 newDuration, uint256 at);
event MinClaimAmountUpdated(uint256 oldVal, uint256 newVal, uint256 at); 
event MaxTVLCapUpdated(Pool indexed pool, uint256 oldCap, uint256 newCap, uint256 at);
event MinStakeAmountUpdated(Pool indexed pool, uint256 oldAmount, uint256 newAmount, uint256 at);
event RewardDurationUpdated(Pool indexed pool, uint256 oldDuration, uint256 newDuration, uint256 at);

```

**事件语义修订**：`ForceClaimed.unpaidA/unpaidB` 表示本次未支付、仍保留在用户rewards中的债权，**不表示已放弃**；实际支付才减少pending/booked，不因部分付款减少badDebt。零支付回滚，不发成功事件；健康Normal跨池足额领取仍逐池检查minClaim，只有坏账/Shutdown部分路径豁免该门槛。索引器、前端与ABI须随实现更新，不能沿用旧版“未付即没收”的解释。

**事件时间字段约定（强制）**：所有事件的 `at` / `currentTime` 字段一律使用**真实 `block.timestamp`**。会计与奖励计算使用 `_effectiveTime()`；在 Paused / Emergency / Shutdown 下两者可能不同。监控与索引器不得把事件时间用于奖励计算，只能用于展示与审计。

`EmergencyModeActivated` / `ShutdownActivated` 记录真实触发时间；前端/监控同时读取公开 `terminalRewardTime` 作为永久计息截止点。`InvariantViolated` 仅在成功的允许降级路径记录；emit后再revert的事件不会留在链上，监控必须主动读状态与失败交易。

`OutboundTransfer(address token,address to,uint256 grossAmount,uint256 netReceived)`沿用`FOTTransferLib`事件并纳入调用日志索引；`UserModuleUpdated`、`AdminModuleUpdated`、`SuperAdminTransferred` 及 AccessControl 角色事件沿用/新增既有风格 ABI。**`FeesClaimed` 的完整签名仍待核对既有 ABI，定稿前不得视为冻结；至少须记录 `(address indexed recipient, uint256 amount, uint256 at)` 三项信息。** 最小提前退出额、最大转账损耗等setter也须记录新旧值，不能只改状态而无可索引记录。

**`EmergencyWithdrawn` 字段说明**：`principal` 为退回的本金（A 池为 TokenA wei，B 池为 TokenB wei）；`rewardsForfeited` 为该池上紧急退出前用户已计提、本次被清零的奖励（`userInfo*.rewards` 快照，A/B 均为对应池奖励代币 wei），供链下监控统计没收量。

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
error CatchUpIncomplete();
error InvalidPayer();
error NoPayableLiquidity();
error UserLiabilitiesUnfunded();
error UnexpectedSenderDebit();
error RewardShareLimitExceeded();
error RewardIndexCapacityExceeded();

```

> **部署角色交接（Core + 模块 + 门面）**：标准顺序为
> 1. 部署 48h / 72h 两个 `TimelockController`，配置 proposer / executor / canceller，`minDelay` 分别为 ≥48h / ≥72h。
> 2. 部署 `DualPoolUserModule` 与 `DualPoolAdminModule`。
> 3. 部署 `DualPoolStaking`（deployer 在构造时仅获得 `DEFAULT_ADMIN_ROLE`，不直接获得 `ADMIN_ROLE` / `OPERATOR_ROLE`）。
> 4. 部署 `DualPoolStakingAdmin(core, timelockGovernance, timelockSuper)`。
> 5. deployer 调用 `setUserModule` / `setAdminModule` / `setAdmin(facade, true)` / `setOperator(ops, true)`。
> 6. deployer 调用 `transferSuperAdmin(facade)`，原子交接 `DEFAULT_ADMIN_ROLE` 与 `Ownable owner`；此后 deployer 不再持有任何角色。
> 7. 参数（含 `feeRecipient`）一律经 48h Timelock → 门面 → Core 设置，不得在部署脚本里直接调用 Core 的 setter 绕过 Timelock。
>
> 生产部署必须显式配置治理/运维地址（非零且不等于 deployer），`feeRecipient` 必须显式等于清单国库，不默认保留部署钱包。部署脚本须断言最终角色图（deployer 无角色、门面持有 `ADMIN_ROLE` / `DEFAULT_ADMIN_ROLE` / owner、ops 持有 `OPERATOR_ROLE`）、48h/72h 延迟、两个模块地址和国库，不能只打印配置。旧 `PRODUCTION=true` 开关如保留，仅作为额外的环境检查，不作为角色交接的依据。

---

## 9. 边界场景分析汇总

| 场景 | 处理规则与底层逻辑 |
| --- | --- |
| **空池首笔注入** | 空池不释放奖励；首笔stake只结算旧区间并增加份额，不自动重排。需要新窗或重锚时由≥48h治理通过scheduleRewardsA/B或reanchorRewardsA/B按§4.5执行，速率及总排放受预算约束，不承诺用户实际APR上限。 |
| **巨鲸追加仓位** | 取 `max(oldUnlock, now+lockDuration)`。大额资金追加无法压缩原有解锁时间，强制遵守锁定期限。 |
| **WADP 与 Lock 差异** | 属故意设计：提现费率由 WADP 加权更新（平滑后退），而锁定周期受 `Rolling Lock` 约束全额延长。 |
| **CompoundB 豁免 Cap** | 复投豁免业务TVL cap，仍强制执行MAX_REWARD_SHARES_B数值硬上限；超限整笔回滚，奖励保留供分池领取，不静默截断或核销。 |
| **Pause + Emergency** | 非Shutdown的Emergency紧急退出无视paused；Shutdown改用普通退出并同样无视paused，B仍按真实锁期和原Early/Mature规则。terminalRewardTime永久不变。 |
| **WithdrawB 罚金闭环** | Normal下Early Exit罚金及有资金支持的没收奖励留在Core；先核销坏账、吸收已有缺口，余额才回availableB，不自动重排。Shutdown前期仍按原B退出规则；finalize满365天后旧仓位自然已超过锁期/费率年龄，终态不重排。 |
| **坏账期 Claim** | 普通claim在任一侧badDebt>0时阻断；forceClaimAll健康Normal仍支持足额跨池领取并逐池检查minClaim；坏账/Shutdown才保护各桶后部分支付，按A→B优先且逐池不得超过pending−badDebt；未付保留，付款不减badDebt，零支付回滚。 |
| **`bookedUserRewards` 对账** | 各池booked≤pending，仍有本金时差额含未settle债权。finalize无本金才可裁至booked；旁路仍有本金时完整保留pending，后续形成orphan只能在全部本金退出后再次按§7.4安全finalize，不能擅自裁剪；booked>pending必须修复，禁止强砍用户奖励。 |
| **过期窗滞留预算** | 先完整结算到min(effectiveTime,finish)，由≥48h治理通过reanchorRewardsA/B重锚；fund/兼容notify只加实收预算。ceilDiv选时长后须重新floor速率，旧leftover已含在available中，不重复相加。 |
| **WADP 取整** | `PoolBWadpLib` 使用 **Ceil**，防止 floor 叠加导致提前进入低提现费档。 |
| **奖励预算不足** | 完整排放进入用户指数与保守pending，未出资部分记badDebt并告警；不得同时截断用户债权、又把短缺称为已确权坏账。 |
| **Bad Debt 期间复投** | 完整catch-up后检查两池badDebt，涵盖本次新增短缺，再决定能否将奖励转为本金。 |
| **僵尸残值死锁** | Shutdown满365天且无本金时可finalize；满1095天可放宽无本金条件，但必须保留本金与全部保留pending的真实资金，只扫min(bookResidual,balance−protected)，不能以超时剥夺用户债权。 |
| **防零罚金漏洞** | 若设置了 `penaltyFeeBP`（**仅 Pool B** Early Exit），则 `minEarlyExitAmountB` 必须满足计算出的罚金 $\ge 1 \text{ wei}$，防止利用整除截断零成本逃逸。 |
| **ERC777 绕过 CEI** | 不接受回调型资产；ERC1820对Core/Token的探测仅辅助，不能证明没有用户账户hook。须审核实际transfer行为并保留共享重入锁，不使用EOA限制误杀多签/AA。 |

---

## 附录 A：关键公式汇总

| 公式用途 | 表达式说明 |
| --- | --- |
| **有效时间窗口** | Emergency/Shutdown取T=terminalRewardTime；否则T=paused?pausedAt:block.timestamp；tApplicable=min(T,periodFinishX)。锁仓/治理期限仍取真实时间。 |
| **时间差上限** | 先处理 $tApplicable\le lastUpdateTimeX$；每片 $deltaTime=\min(tApplicable-lastUpdateTimeX,MAX\_DELTA\_TIME)$，入口须完整catch-up |
| **收益指数更新** (防溢出) | Q=REWARD_PRECISION=1e45；accX += mulDiv(rateX×deltaTime,Q,totalStakedX)，强制0<S≤Q并通过整窗headroom检查。 |
| **用户已赚奖励** | Earned=mulDiv(userStakedX,accX−userRewardPaidX,REWARD_PRECISION)，最终向下取整；预览及快照使用同一尺度。 |
| **Rolling Lock** (大值覆盖) | $unlockTime=\max(oldUnlock,\text{block.timestamp}+lockDuration)$ |
| **WADP 费率计时** (防套利) | $T_{new}=\left\lceil\frac{(Staked_{old} \times T_{old})+(Amount_{new} \times Now)}{Staked_{old}+Amount_{new}}\right\rceil$（`PoolBWadpLib`，Ceil） |
| **新奖励速率** (治理排期) | rate=floor(available/effectiveDuration)，要求0<rate≤cap，超cap回滚；duration==0使用pool.rewardDuration；显式/默认周期均1～365天。Operator fund/兼容notify不计算新rate，不把已含在available的leftover重复相加。 |
| **过期窗重锚** (≥48h治理) | 以T建立新窗；选定duration后rate=min(cap,floor(available/duration))，保证rate×duration≤available；小预算微排放例外按§4.5，stake/compound不触发。 |
| **活跃窗重排** (≥48h治理) | 先完整结算旧窗再按当前available排期；注资、首笔进池、复投、罚金回流、调拨均不隐式改变rate/finish。 |
| **停机 orphan** | $orphan_X=totalPending_X-bookedUserRewards_X$；无剩余质押 finalize 后 $totalPending_X \leftarrow bookedUserRewards_X$；deadlock bypass 仍有质押时不裁剪 $totalPending_X$ |
| **实际停机清扫上限** | sweep=min(bookResidual,balanceB−protectedB)，先require balanceB≥protectedB；protectedB=本金B+保留pendingA+保留pendingB。 |
| **部分领取** | 现金=max(balanceB−本金B−费用−available总额,0)；逐池实付≤pendingX−badDebtX；只核销实付，未付保留。 |
| **Early Exit 罚金（Pool B）** | $Penalty=\frac{Amount \times penaltyFeeBP}{10000}$ |
| **minEarlyExit 约束** (防零，Pool B) | penaltyFeeBP>0时minEarlyExitAmountB≥ceilDiv(BASIS_POINTS,penaltyFeeBP)；为0时不得执行除法，改罚金须联动校验。 |
| **TokenB不变量** | BalanceB+BadDebtA+BadDebtB≥本金B+pending总额+available总额+费用；付款、recover和finalize不得据此少留用户资金。 |
| **pending与取整** | Q=REWARD_PRECISION，0<S≤Q时q=floor(DQ/S)，ceil(Sq/Q)=D；足额pending加D、预算减D，取整差额留在pending作为orphan；不足时仍pending加完整D、badDebt加缺款。 |
| **奖励分片误差界** | 每正时间分片的指数阶段少分配<1 weiB，N片累计<N weiB；用户每次settle另有<1 weiB向下取整。不承诺微额奖励零相对误差。 |
| **新窗口指数容量** | H=floor((UINT_MAX−acc)/REWARD_PRECISION)，最终候选duration>0且rate≤floor(H/duration)；不足仅拒绝新排期，不重置指数或阻断已验证窗口退出。 |
| **最大速率约束** (上限保护) | $MAX\_REWARD\_RATE\_X=\frac{\text{maxTotalSupplyBForRewardRateCap} \times MAX\_APR\_BP}{10000 \times SECONDS\_PER\_YEAR}$（构造函数写入的 cap；**非** `notify` 时刻 `totalSupply()`） |
| **Excess TokenB 可回收量** | $Excess=BalanceB-(TotalStakedB+TotalPending_{A+B}+AvailableRewards_{A+B}+UnclaimedFeesB)$（与 §2.2 / §7.6、`recoverToken` 链上一致） |
| **Shutdown 有序退出检查** | 状态守卫见§7.1：Shutdown忽略paused，非Shutdown的Emergency使用紧急退出；B继续按原Early/Mature规则，锁期及费率年龄取真实时间。 |

---

## 10. 上线前风险假设与验收清单

本节列出合约无法单方面消除、但生产上线前必须由治理、运营、前端和监控共同承认并落实的风险假设。任何一项不满足，都应视为上线阻断项或降级上线项。

### 10.1 必须写入上线公告/审计范围的风险假设

| 假设 | 必须满足的上线条件 | 失效后的影响 |
| --- | --- | --- |
| **治理密钥安全** | Core的`DEFAULT_ADMIN_ROLE`与Ownable owner交接至治理门面；门面以不可变双Timelock鉴权，proposer/executor由已配置治理主体控制；模块替换、超级权限变更经≥72h超级路径。标准锁后续延迟变更的信任边界见§2.1.1。 | 可替换 delegatecall 模块或重配关键权限，等价于协议升级/接管风险。 |
| **模块地址有效性** | `setUserModule` / `setAdminModule` 目标地址必须为已部署合约，并在上线记录中保存 bytecode hash、源码版本、部署交易。 | delegatecall 到错误模块会导致入口异常、交易空执行或状态破坏。 |
| **Operator 多签安全与权限边界** | `OPERATOR_ROLE` 必须由多签合约持有（生产环境 ≥2-of-3，签名者地理与设备分散，硬件钱包存储）；`OPERATOR_ROLE` 仅用于pause、enableEmergencyMode及fund；不得同时持有Admin/Super权限，地址独立于治理门面；周期开启/取消/重排均≥48h。 | 多签被攻破（低概率）可暂停、进入紧急模式或注入异常奖励预算；缓解措施：多签阈值、签名者分散、硬件钱包、定期轮换、交易监控。 |
| **TokenA/TokenB 类型限制** | TokenB必须18 decimals；不支持rebasing/reflection、发送方额外扣税、黑名单、恶意balanceOf、回调或可阻断转账资产；ERC1820探测不足以替代Token行为审查。 | 不变量、真实入账、奖励分配或退出路径可能失真或被阻断。 |
| **奖励数值范围** | REWARD_PRECISION、原始总份额硬上限、整窗headroom及索引预览尺度须一起实现；原始单位上限按Token decimals换算披露，业务cap及复投豁免不能绕过。 | 只提高精度而无硬边界仍可能奖励归零；缺少容量检查可能在本金下降后溢出并阻断结算；旧尺度模块不能混用。 |
| **FOT TokenB 出账税费由用户承担** | 前端与公告必须展示合约转出 gross、用户预计到手 net、最大税费保护 `maxTransferFeeBP`；链上账本按 gross 核销。 | 用户实际到账少于 claim/withdraw 账面金额，属于代币税费经济结果而非协议补贴项。 |
| **长时间无人交互的奖励结算** | 修改份额/预算、领取、排期、偿债和finalize前按相关池完整catch-up；公开crank全状态可用。pause、enableEmergencyMode及shutdown激活只设状态/冻结点，不能要求成功计提或Token查询。 | 旧周期奖励可能被新用户分走、重复排期、跳过确权或产生非预期坏账。 |
| **BadDebt 修复路径资金来源** | 付款人固定为调用门面immutable timelockGovernance绑定的48h Timelock，持币直接授权Core；Core验证绑定后单跳拉款按实收核销，不能任填用户或从空门面拉款。 | 坏账无法修复，`recoverToken`、预算调拨等依赖无坏账的治理操作被永久阻断。 |
| **Shutdown 终态语义** | finalize前两池完整计提且badDebt=0；无本金才可裁pending至booked。旁路仍有本金时完整保留pending及其真实资金，清扫受账面残值与实际可支付额双限；后续orphan须待全本金退出后按同一安全条件再次finalize。 | 若前端/公告仍按“一律清扫 orphan”解释，会误导留仓用户对可领取奖励的预期。 |
| **Emergency奖励领取的治理活性依赖** | 必须披露：Emergency关闭全部普通奖励领取；已无本金但仍有奖励的用户也不能领取或用零本金紧急退出，未放弃债权继续保留。运营须准备Admin经≥48h Timelock路径转入Shutdown后恢复按既有保护规则领取的治理流程；状态不会自动过渡。 | 若治理失联或不执行Shutdown，既有奖励可能无限期冻结；不能将Emergency宣传为用户可自主领取全部资产的模式。 |
| **forceClaimAll 部分兑付顺序** | 健康Normal支持跨池足额领取且逐池满足minClaim；仅坏账/Shutdown允许部分并豁免minClaim，本金/费用/available隔离，A→B优先，未付债权保留，零支付回滚。不能宣传为全协议等比例赔付。 | 用户可能误以为所有用户统一等比例兑付、未付奖励已被没收，或忽略真实资金补入前仍可能无法付款。 |
| **链下监控依赖** | 监控必须覆盖 `InvariantViolated`、`InsufficientBudget`、`BadDebtResolved*`、`OutboundTransfer`、pause/emergency/shutdown、rewardRate/availableRewards 异常。 | 异常会计状态无法被及时发现，治理响应滞后。 |

### 10.2 上线前必须调整/确认的实现项

1. **全入口 catch-up 规则**
   stake/fund/分池withdraw/取消排期结算对应池；**claimA/claimB 计提两池、settle 目标池**（跨池 badDebt 守卫要求两池都先计提，见 §5.4）；schedule/reanchor、compound、forceClaimAll、rebalance、resolve、claimFees和finalize结算两池；Emergency A回流B前结算两池，Emergency B结算B。Normal/Shutdown A退本不依赖B计提。活跃/过期均完整推进至各自min(effectiveTime,finish)，分片不足先公开crank；防御开关及shutdown激活不依赖计提，recover按完整账面保护excess。

2. **活跃预算不可直接搬走**
   两池先完整结算，无badDebt；只能搬走source.available−rate×max(finish−effectiveTime,0)之外的预算。需搬走未来承诺时，≥48h治理先显式取消旧周期再调拨；调入、fund、罚金或没收回流均不自动重排。

3. **FOT 出账可观测性**
   出账路径必须记录 gross 与 net，用户承担税费，但协议必须让前端和索引器能证明差额来自 Token 税费，而不是协议少付。

4. **坏账修复生产路径**
   按§7.5用调用门面immutable绑定校验真实48h Timelock payer、直接授权Core及单跳实收核销；验证任意用户payer拒绝，补款不重复增加pending、余款不自动重排。真实资金/调用路径测试不能用mock身份替代。

5. **模块升级校验**
   模块setter链上强制非零且code.length>0；布局兼容、bytecode hash、selector、直接调用拒绝和角色延迟须审查/测试。部署断言不能替代链上地址检查，代码存在也不能证明语义或布局安全。

6. **前端风险展示**
   claim/withdraw/forceClaimAll 需展示 FOT gross/net、坏账下 partial payout、停机/紧急模式状态、Timelock 延迟、Operator 热权限说明，以及§7.3的Emergency奖励冻结与治理转Shutdown依赖，不得只展示理想到账金额。

### 10.3 生产监控阈值

| 指标 | 触发动作 |
| --- | --- |
| `badDebtA > 0` 或 `badDebtB > 0` | 立即阻断 TokenB recover/rebalance 操作；准备 `resolveBadDebt`。 |
| `balanceB + badDebt < requiredB`或本金实物不足 | 触发 P0 告警，优先 pause，再评估 emergency。 |
| `effectiveTime > periodFinish` 且 `availableRewards > 0` | 标记stale schedule；相关入口先完整catch-up，由≥48h治理按预算约束重锚，用户/Operator不得隐式重排。 |
| `rewardRate == 0 && availableRewards > 0 && periodFinish > effectiveTime` | 检查是否为治理取消/终态保留预算；需要新周期时由≥48h治理处理，不自动重启。 |
| `OutboundTransfer.grossAmount > netReceived` | 前端/索引器展示 FOT 税费，若超过 `maxTransferFeeBP` 应回滚或告警。 |
| pause 超过 `UNPAUSE_COOLDOWN` | 检查 catch-up 完整性后才允许治理 unpause。 |


### 10.4 本次修订状态与首批验收（2026-10-22）

本次确认维护根目录v1.1；本节的“规范已修订”不等于“实现已通过”。实现证据以 [Implementation-review-2026-10-22.md](Implementation-review-2026-10-22.md) 及后续修复提交、回归结果为准。

| 项目 | 文档目标 | 当前状态 / 验收要求 |
| --- | --- | --- |
| F01 奖励取整 | §4.1/§4.2：每步保守预留，完整累计债权有覆盖 | 规范已修订，代码待修；3 wei质押、1 wei/秒、两次crank后应能提本并领取1 wei；普通金额A/B及多人退出回归须全部通过 |
| F02 过期重锚 | §4.5：仅治理重锚，最终rate×duration不得超过预算 | 规范已修订，代码待修；100万B过期预算治理重锚不得产生0.634...B虚假坏账；不可整除、ceil/cap与微排放边界全部覆盖 |
| F03 暂停时钟 | §4.1/§4.5/§7.2：冻结时间、活跃窗口平移一次 | 规范已修订，代码待修；暂停前fund只增加预算、不重排；暂停中fund及兼容仅注资notify必须回滚且不改账本。暂停中治理调拨/排期或偿债余款后恢复，足额预算不得产生虚假坏账；过期/零窗口不重启，终态不恢复时钟 |
| 长闲置与补款 | 活跃/过期完整catch-up；完整确权后补款不重复加pending | 31/100/365天场景；预算5、排放10后补5，用户应可兑付10，补款不得误成可回收excess |
| F04 退出状态机 | §5/§7：Emergency与Shutdown退出守卫一致且可达 | 待实现/回归；Pause→Emergency→Shutdown（paused仍true）普通提款不再被paused阻断；B保持原Early/Mature规则；0h开关不因计提/余额异常失败，crank全状态可用。另覆盖Normal全退本金保留奖励→Emergency领取及零本金紧急退出回滚、债权不核销→治理转Shutdown后按原领取规则可达的轨迹 |
| F05 部分支付 | §5.4：只核销实付、余款保留 | 待实现；健康Normal跨池足额领取及逐池minClaim继续可用；坏账/Shutdown部分按A→B优先、逐池pending−debt上限正确；零支付回滚、二次补款后仍可领余款，不减badDebt，成功支付更新共享冷却 |
| F06 停机清扫 | §7.4：账面残值与物理资金双上限 | 待实现；用户奖励约1600、余额1607时最多扫7；protected不足整体回滚；365/1095天及有未settle用户场景覆盖；finalize后仍可退本/领保留奖励；重复调用不重复清扫旧桶，全本金退出后再finalize安全释放真正orphan |
| F07 没收核销 | §5.5：未出资债权不变可用预算 | 待实现；badDebt、pending/booked、真实缺口及回B预算守恒；Shutdown保留原B奖励处理规则；终态回流不重排 |
| F08 资产准入/FOT | §4.6/§7.6：gross核销，净入账/出账及sender扣款受检 | 待实现；标准Token、cap=0、税率/极小额边界；stake/fund/resolve及全部用户/治理出账拒绝sender额外扣税；recover保护全required |
| F09 热权限/治理 | §2/§6：Operator只注资，排期≥48h | 待实现；1 wei fund/stake/compound/罚金回流不能改变旧rate/finish；旧notify非零duration拒绝；治理真实调用链、模块code/布局及继承权限旁路验证 |
| F10 偿债与部署 | §7.5/§8.2：门面immutable绑定真实payer、显式国库及完整交接 | 待实现；持币48h Timelock授权Core→门面→Core单跳偿债，任填用户payer拒绝；国库严格等于清单TREASURY、deployer撤权，最终角色图断言通过 |
| F11 全套验收 | 原失败回归恢复，无skip掩盖 | 待完成；完整forge test可编译无失败，随机交错/模糊不变量验证债权、资金桶、退出和治理保护，固定编译配置重测合约及initcode大小 |
| F12 结算频率与精度 | §3.1/§4.1/§4.2：奖励专用Q、硬份额上限、绝对误差界 | 规范已复核，代码待实现；36 decimals、100 A、1 B/秒、1天的单次/12秒/60秒计提均应产生86400 B奖励。增加第三方1原始单位stake/withdraw扰动、1 weiB微额排放及S=1、Q−1、Q、Q+1边界；S>Q必须拒绝，业务cap=0及compound豁免不能绕过；指数误差按每片<1 weiB而非所有微额相对误差为0验收；取整差额留在pending作为orphan，pending完整覆盖债权 |
| F13 指数容量与尺度 | §4.5：整窗headroom、旧尺度迁移边界 | 规范已复核，代码待实现；按最小残余S=1验证最终rate/duration容量，覆盖恰好合法及超1单位边界、所有重锚微排放分支；headroom不足不影响旧窗口结算/取消/退出，不清acc/paid；旧1e18与新1e45尺度不得混用 |
| 历史状态 | 修订算法不能替代历史对账 | 本项目为全新部署，无历史状态需迁移；若未来存在旧部署，先核对pending/booked/badDebt并制定迁移或补账方案，不能按改代码自动完成处理 |

**本次集中收口状态：** 上述奖励会计、排期权限、暂停/终态、部分支付、没收核销、清扫保护、FOT及部署资金链已形成本文统一开发目标；**业务代码与测试仍待修复验收**，本次修订不代表实现通过。保留原有双池、模块化、FOT、BadDebt、WADP、锁仓及费用范围，未采用docs/v1的重写方案。现存代码、旧伪代码或历史审阅证据不能覆盖本次已修订条款。

开发完成条件：实现与本轮规范一致，每项验收对应修复提交、测试名、运行配置及结果；原舍入、重锚、暂停注入及新增退出/资金安全回归通过；完整测试套件可编译且无失败，不能删除或skip失败回归充当通过；重新核验runtime/initcode大小、ABI与事件索引。独立整数模型可用于推导，但不能替代Solidity回归或真实治理调用链验证。本文收口不等于代码已修好、完成独立外审或满足生产发布条件。

### 10.5 生产部署安全检查清单

本节为生产环境上线前的强制检查项，任何一项不满足都视为上线阻断项。

#### Operator 配置

- [ ] Operator 地址必须是多签合约（如 Gnosis Safe），禁止单签 EOA / 热钱包
- [ ] 多签阈值至少 2-of-3（推荐 3-of-5）
- [ ] 签名者地理分散（不同城市/国家，防止区域性风险）
- [ ] 签名者设备安全（硬件钱包存储私钥）
- [ ] 有签名者丢失/损坏的恢复流程（文档化并测试过）
- [ ] Operator 多签不能同时持有 `ADMIN_ROLE` 或 `DEFAULT_ADMIN_ROLE`
- [ ] Operator 地址与治理门面地址完全独立

#### Admin 配置

- [ ] Admin 地址是治理门面（`DualPoolStakingAdmin`）
- [ ] 治理门面由 `TimelockController` 控制（常规 48h 延迟）
- [ ] Timelock 的 `proposer` / `executor` 由安全的治理多签控制
- [ ] Timelock 的 `canceller` 配置合理（防止恶意取消）

#### DEFAULT_ADMIN 配置

- [ ] `DEFAULT_ADMIN_ROLE` 是超级治理门面
- [ ] 由 `TimelockController` 控制（超级 72h 延迟）
- [ ] 部署后转移所有权，deployer 撤销所有角色（`DEFAULT_ADMIN_ROLE`、`ADMIN_ROLE`、`Ownable` owner）

#### 模块配置

- [ ] `adminModule` 指向已部署的 `DualPoolAdminModule` 合约
- [ ] `userModule` 指向已部署的 `DualPoolUserModule` 合约
- [ ] 模块 bytecode hash 记录在上线文档
- [ ] 模块源码版本与审计版本一致

#### 参数配置

- [ ] `feeRecipient` 等于清单国库地址（不是 deployer 或默认值）
- [ ] `lockDuration`、`penaltyFeeBP`、`withdrawFeeBP`、`midTermFeeBP` 等参数符合业务需求
- [ ] `maxTransferFeeBP` 覆盖 TokenB 的实际税费上限
- [ ] `maxTVLCap`、`minStakeAmount` 等池参数已设置

#### Token 验证

- [ ] TokenA / TokenB 已审查（非 rebasing、reflection、黑名单、ERC777 hook）
- [ ] TokenB decimals == 18
- [ ] TokenA / TokenB 的转账行为已测试（标准转账、FOT 转账）

#### 监控与告警

- [ ] 链上监控覆盖所有关键事件（`Paused`、`EmergencyModeActivated`、`RewardsFunded`、`InvariantViolated` 等）
- [ ] `badDebtA > 0` 或 `badDebtB > 0` 触发 P0 告警
- [ ] `balanceB + badDebt < requiredB` 触发 P0 告警
- [ ] Operator 多签交易实时监控

#### 文档与公告

- [ ] 用户公告披露：FOT 税费由用户承担、Emergency 奖励冻结、Shutdown 清算规则
- [ ] 前端展示：gross/net 金额、紧急模式状态、Timelock 延迟
- [ ] 审计范围明确：覆盖所有入口、角色权限、资金路径

#### 最终验证

- [ ] 完整 `forge test` 通过（无 skip、无 failure）
- [ ] 主网 fork 测试通过（真实 Token、真实治理调用链）
- [ ] 部署脚本断言最终角色图（deployer 无角色、门面持有 `ADMIN_ROLE` / `DEFAULT_ADMIN_ROLE` / owner、Operator 多签持有 `OPERATOR_ROLE`）
- [ ] 部署脚本断言所有参数、模块地址、国库地址
- [ ] 独立审计完成（如适用）
