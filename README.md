# DualPoolStaking — 平行双池复合奖励质押系统

基于 Foundry 构建的 Solidity 智能合约，实现了一个**平行双池（Parallel Dual-Pool）复合奖励质押协议**。

## 目录

- [架构概览](#架构概览)
- [核心特性](#核心特性)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [合约说明](#合约说明)
- [测试](#测试)
- [部署](#部署)
- [安全设计](#安全设计)

## 架构概览

本协议采用**平行双池**设计，通过负债累积模型（Liability Accumulation Model）实现 TokenB 奖励的线性确权：

| 池 | 质押资产 | 奖励资产 | 定位 |
|---|---|---|---|
| **Pool A** | TokenA | TokenB | 基础质押池，无锁定期、无本金手续费 |
| **Pool B** | TokenB | TokenB | 复利池，支持奖励再质押，带滚动锁定期与费率阶梯 |

用户可在 Pool A / Pool B 之间进行 **Stake → Earn → Compound** 的完整闭环操作。

## 核心特性

- **双池质押** — Pool A（TokenA → 赚 TokenB）和 Pool B（TokenB → 赚 TokenB）
- **复合奖励** — 将 A/B 两池的已确权奖励一次性转入 Pool B 本金，自动复投
- **负债累积模型** — 通过全局指数 `accRewardPerToken` 配合用户快照实现精确到 wei 的收益计算
- **WADP 时间加权** — 加权平均持仓起点，防止通过追加质押套利费率阶梯
- **Rolling Lock** — 大值覆盖法，每次 Stake/Compound 维持或向后推迟解锁时间
- **紧急模式** — Operator 可激活单向不可逆的紧急退出通道
- **Shutdown 清算** — 有序停机 + `forceShutdownFinalize` 防僵尸死锁
- **坏账管理** — `BadDebt` 记录 + `resolveBadDebt` 物理修复 + `forceClaimAll` 折损逃生舱
- **TokenB 不变量** — 物理余额必须始终覆盖账面债务，每笔状态变更末尾强制执行校验
- **FOT 防御** — 支持 Fee-On-Transfer 代币，含滑点保护与真实入账 Cap 检查
- **ERC777 防御** — 部署期白名单 + ERC1820 探测，防止钩子绕过 CEI
- **Timelock 治理** — 基于 OpenZeppelin `TimelockController`，Admin 操作 ≥48h 延迟，超级变更 ≥72h

## 项目结构

```
DeFiStaking/
├── foundry.toml                  # Foundry 配置（编译器 0.8.34）
├── Makefile                      # 构建/测试/部署快捷命令
├── PRD.md                        # 协议需求规格说明书（完整数学公式与架构文档）
├── src/
│   ├── DualPoolStaking.sol       # 核心合约：质押/提款/奖励/状态机
│   ├── DualPoolStakingAdmin.sol  # 治理门面（Admin 操作包装）
│   ├── StakeTypes.sol            # 类型定义（Pool 枚举、事件、错误）
│   ├── StakingExecutionErrors.sol# 自定义错误集
│   ├── MockERC20.sol             # 测试用 ERC20 模拟代币
│   ├── libraries/                # 逻辑库（library）
│   │   ├── PoolAccrualLib.sol    # 全局收益更新引擎 _updateGlobalX
│   │   ├── PoolAStakeLib.sol     # Pool A 质押逻辑
│   │   ├── PoolBStakeLib.sol     # Pool B 质押逻辑
│   │   ├── PoolBCompoundLib.sol  # 复合奖励（CompoundB）逻辑
│   │   ├── PoolBWithdrawLib.sol  # Pool B 提款逻辑（含 Early Exit / Mature Fee）
│   │   ├── ForceClaimAllLib.sol  # forceClaimAll 折损清算逻辑
│   │   ├── NotifyRewardLib.sol   # notifyRewardAmount 注入逻辑
│   │   ├── PoolSingleClaimLib.sol# 单边奖励领取（claimA / claimB）
│   │   └── StakingAdminLib.sol   # 管理员参数配置逻辑
│   └── modules/
│       ├── DualPoolUserModule.sol    # 用户操作模块（stake/withdraw/claim/compound/emergency）
│       ├── DualPoolAdminModule.sol   # 管理员操作模块（fees/pause/shutdown/recovery 等）
│       └── DualPoolStorageLayout.sol # 统一存储布局，继承安全
├── test/
│   └── DualPoolStaking.t.sol       # 完整测试套件
├── script/
│   └── DualPoolStaking.s.sol       # 一键部署脚本（含 Mock + Timelock）
└── frontend/                       # 前端 DApp（Next.js + TypeScript）
```

## 快速开始

### 前置条件

- [Foundry](https://book.getfoundry.sh/)（`forge`, `cast`, `anvil`）
- 推荐 Solidity 版本：**0.8.34**

### 安装

```shell
# 安装依赖（forge-std + OpenZeppelin Contracts v5.6.1）
make install

# 编译
make build
```

### 运行测试

```shell
make test          # 运行所有测试
make snapshot      # Gas 快照
```

### 本地部署

```shell
# 终端 A：启动 Anvil 本地节点
make anvil

# 终端 B：部署全栈合约
make deploy
```

### Sepolia 部署

```shell
# 在 .env 中配置：SEPOLIA_RPC_URL, PRIVATE_KEY, ETHERSCAN_API_KEY
make deploy NETWORK=sepolia
```

## 合约说明

### DualPoolStaking（核心合约）

主合约继承用户模块、管理员模块与存储布局，实现以下核心功能：

| 功能 | 说明 |
|---|---|
| `stakeA(amount)` / `stakeB(amount)` | 质押 TokenA 或 TokenB |
| `withdrawA(amount)` / `withdrawB(amount)` | 提款（A 无锁无费；B 含费率阶梯） |
| `compound()` | 将 A+B 已确权奖励全部转入 Pool B 本金 |
| `claim()` / `forceClaimAll()` | 领取奖励 / 折损逃生（坏账时） |
| `emergencyWithdraw()` | 紧急模式退出（放弃未领奖励） |
| `notifyRewardAmountA(amount, duration)` / `notifyRewardAmountB` | 注入奖励预算 |
| `pause()` / `unpause()` | 暂停/恢复协议 |
| `enableEmergencyMode()` | 激活紧急模式（单向不可逆） |
| `shutdown()` / `forceShutdownFinalize()` | 停机清算 |

### DualPoolStakingAdmin（治理门面）

包装需延迟执行的 Admin 操作：

- 费率配置（`setFees`, `setLockDuration`）
- TVL 上限与最小质押量
- 预算调拨（`rebalanceBudgets`）
- 手续费提取（`claimFees`）
- 代币回收（`recoverToken`）
- 坏账修复（`resolveBadDebt`）

## 测试

测试文件位于 [`test/DualPoolStaking.t.sol`](test/DualPoolStaking.t.sol)，覆盖：

- Stake / Withdraw / Claim / Compound 全流程
- Early Exit 罚金与 Mature 费率阶梯
- WADP 时间加权校验
- Rolling Lock 行为
- Emergency / Shutdown 状态机
- 空池重锚（Re-anchor）
- 预算不足坏账（BadDebt）处理
- `forceClaimAll` 折损清算
- `resolveBadDebt` 修复
- TokenB 不变量验证
- FOT 代币模拟

## 部署

部署脚本 [`script/DualPoolStaking.s.sol`](script/DualPoolStaking.s.sol) 一键完成：

1. 部署 MockERC20（TokenA / TokenB）
2. 部署 `DualPoolStaking` 核心
3. 部署用户模块与管理员模块
4. 部署治理门面 `DualPoolStakingAdmin`
5. 初始化 `TimelockController`

## 安全设计

### 角色体系

| 角色 | 权限 | Timelock |
|---|---|---|
| **Owner** (`DEFAULT_ADMIN_ROLE`) | 模块指针、超级配置 | ≥72h |
| **Admin** (`ADMIN_ROLE`) | 风险参数、提取资产、预算调拨 | ≥48h |
| **Operator** (`OPERATOR_ROLE`) | 暂停、紧急模式、注入奖励 | 0h（防御/注资） |
| **User** | 质押/提款/领取/复合 | — |

### 关键安全机制

- **CEI 优先** — 严格遵循 Check-Effect-Interaction 顺序
- **非重入保护** — 所有资产变动函数使用 `nonReentrant`
- **TokenB 不变量** — 物理余额覆盖账面债务，每笔操作末尾校验
- **WADP 防套利** — 时间加权防止费率阶梯被重置
- **MAX_DELTA_TIME（30天）** — 单次时间差上限，防溢出
- **Dust 回收** — 除法是截断粉尘累积到阈值后回灌预算

### 完整架构文档

详见 [`PRD.md`](PRD.md) — 包含完整数学公式、状态机矩阵、边界场景分析与事件/错误定义。

## 许可证

MIT
