import type { ReactNode } from "react";
import Link from "next/link";

const repoRoot = "仓库根目录（Foundry + Next.js 子项目）";

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <h2 className="text-base font-semibold text-zinc-100 sm:text-lg">{title}</h2>
      <div className="text-sm leading-relaxed text-zinc-400">{children}</div>
    </section>
  );
}

function PathLine({ path, note }: { path: string; note: string }) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2">
      <div className="font-mono text-xs text-sky-400/90 sm:text-sm">{path}</div>
      <div className="mt-1 text-xs text-zinc-500">{note}</div>
    </div>
  );
}

function FlowBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/40 px-3 py-2 text-center text-xs text-zinc-300">
      <div className="mb-1 font-medium text-zinc-200">{title}</div>
      <div className="text-left text-[11px] leading-snug text-zinc-500">{children}</div>
    </div>
  );
}

export default function LearnPage() {
  return (
    <div className="space-y-8 pb-8">
      <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-950 to-zinc-900/50 p-4 sm:p-6">
        <h1 className="text-lg font-semibold text-zinc-100 sm:text-xl">代码库学习指南</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          本页概括 DeFiStaking 双池质押协议的目录结构、链上模块关系、端到端核心流程，以及建议的阅读顺序，便于从「产品界面」一路读到「delegatecall
          模块与库」。上线运维、角色与 <code className="font-mono text-zinc-300">notify</code> 排障等见仓库根目录{" "}
          <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-zinc-200">运维 Runbook.md</code>。
        </p>
        <nav className="mt-4 flex flex-wrap gap-2 text-xs">
          {[
            ["#suite", "三件套"],
            ["#dirs", "目录"],
            ["#modules", "模块关系"],
            ["#flows", "核心流程"],
            ["#order", "阅读顺序"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-full border border-zinc-700 bg-zinc-900/60 px-3 py-1 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
            >
              {label}
            </a>
          ))}
        </nav>
      </div>

      <Section id="suite" title="零、学习三件套">
        <p className="mb-4">
          你现在可以同时使用「结构化文档 + 图谱 + 页面」三种载体学习，分别覆盖深度阅读、全局关系和快速导航。
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
            <div className="text-sm font-semibold text-zinc-100">结构化学习文档</div>
            <div className="mt-1 font-mono text-xs text-sky-400">LEARNING_GUIDE.md</div>
            <p className="mt-2 text-xs text-zinc-500">覆盖总览、主流程、学习路线、周计划、易错点与进阶练习。</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
            <div className="text-sm font-semibold text-zinc-100">Mermaid 图谱</div>
            <div className="mt-1 font-mono text-xs text-sky-400">LEARNING_MAP.md</div>
            <p className="mt-2 text-xs text-zinc-500">包含目录职责图、链上调用图、端到端数据流图、推荐阅读图谱。</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
            <div className="text-sm font-semibold text-zinc-100">学习页面</div>
            <div className="mt-1 font-mono text-xs text-sky-400">frontend/src/app/learn/page.tsx</div>
            <p className="mt-2 text-xs text-zinc-500">在项目 UI 内浏览目录解读、模块关系、核心流程与阅读顺序。</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
            <div className="text-sm font-semibold text-zinc-100">运维 Runbook</div>
            <div className="mt-1 font-mono text-xs text-sky-400">运维 Runbook.md</div>
            <p className="mt-2 text-xs text-zinc-500">上线后运营/治理 checklist、建议参数、notify 与排障流程（与 PRD 冲突时以 PRD 为准）。</p>
          </div>
        </div>
      </Section>

      <Section id="dirs" title="一、项目目录解读">
        <p className="mb-4">
          {repoRoot} 大致分为链上合约（Foundry）、部署脚本与广播记录、以及{" "}
          <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-zinc-200">frontend/</code>{" "}
          独立 Next.js 应用。
        </p>
        <pre className="mb-4 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-400 sm:text-xs">
          {`DeFiStaking/
├── foundry.toml                   # Forge 工程配置
├── src/                           # 主合约与库
│   ├── DualPoolStaking.sol        # 核心：入口 + delegatecall 分发
│   ├── DualPoolStakingAdmin.sol   # 治理门面：onlyOwner → core（配合 Timelock）
│   ├── StakeTypes.sol             # 结构体与枚举（Pool、PoolInfo、UserInfo…）
│   ├── StakingExecutionErrors.sol
│   ├── MockERC20.sol
│   ├── modules/
│   │   ├── DualPoolStorageLayout.sol  # 与核心 slot 顺序一致的抽象布局
│   │   ├── DualPoolUserModule.sol     # 用户路径 executeStake*/Withdraw/Claim/Compound…
│   │   └── DualPoolAdminModule.sol    # 管理/运营路径 notify、参数、暂停、pendingOps…
│   └── libraries/                 # 纯逻辑库（accrual、notify、单池 claim、B 池提现等）
├── script/DualPoolStaking.s.sol   # 部署：代币、核心、模块、Admin、Timelock、角色交接
├── test/DualPoolStaking.t.sol
├── broadcast/                     # forge script 广播产物（含 Sepolia 等）
├── PRD.md                         # 需求与协议细节（权威业务说明）
└── frontend/                      # Next 14 App Router + wagmi / RainbowKit
    ├── src/app/                   # 页面：/、/pool-a、/pool-b、/governance、/learn
    ├── src/components/            # UI 与交易流（TxCenter、模态框、治理面板等）
    ├── src/hooks/                 # useStaking（multicall）、usePoolA/B、时间锁索引等
    ├── src/contracts/             # ABI 与部署地址
    ├── src/lib/                   # 格式化、错误映射、交易执行辅助
    └── src/providers/Web3Provider.tsx`}
        </pre>
        <div className="space-y-2">
          <PathLine path="src/DualPoolStaking.sol" note="对外 API：stake/withdraw/claim、pause、角色校验；通过 _delegateTo 把执行委托给 userModule / adminModule。" />
          <PathLine path="src/modules/DualPoolStorageLayout.sol" note="核心与模块共享同一存储布局；修改字段顺序会破坏 delegatecall，需同步迁移。" />
          <PathLine path="frontend/src/hooks/useStaking.ts" note="单次 multicall 拉取 poolA/B、暂停/紧急/关停、费率与用户仓位，供 Dashboard 与各池页面复用。" />
          <PathLine path="frontend/src/app/api/timelock-ops/route.ts + server/timelockIndexer.ts" note="链下索引或辅助读取，支撑治理页排队与倒计时展示。" />
        </div>
      </Section>

      <Section id="modules" title="二、模块关系">
        <p className="mb-4">
          链上采用「单合约状态 + 可升级逻辑」模式：<strong className="text-zinc-300">状态永远在 DualPoolStaking 地址下</strong>
          ，UserModule / AdminModule 仅作为 delegatecall 目标，运行时代码在核心上下文中执行。
        </p>

        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <FlowBox title="前端（frontend）">
            Next.js 页面 → wagmi 读写合约；交易编排见 useTransactionFlow / useTxCenter、executeTransaction；治理页组合
            Timelock + DualPoolStakingAdmin。
          </FlowBox>
          <FlowBox title="治理层">
            TimelockController（延迟）拥有 DualPoolStakingAdmin；Admin 合约带 onlyOwner 转发到 DualPoolStaking 的 ADMIN
            类入口。暂停、notifyReward 等热路径通常保留 OPERATOR 直连核心（见脚本注释）。
          </FlowBox>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
          <div className="mb-3 text-center text-xs font-medium uppercase tracking-wide text-zinc-500">链上调用关系</div>
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-3">
            <FlowBox title="DualPoolStaking（核心）">
              Ownable + AccessControl + ReentrancyGuard + Pausable；持有 pool 状态、pendingOps、模块地址。
            </FlowBox>
            <span className="hidden text-zinc-600 sm:inline">delegatecall</span>
            <div className="grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
              <FlowBox title="DualPoolUserModule">
                executeStakeA/B、executeWithdraw、executeClaim、executeCompoundB、executeForceClaimAll、紧急提现等；内部调用
                libraries/*。
              </FlowBox>
              <FlowBox title="DualPoolAdminModule">
                executeNotifyReward、费率/锁仓/TVL 等参数、pendingOps 时间锁执行、shutdown、recover 等。
              </FlowBox>
            </div>
          </div>
          <p className="mt-4 border-t border-zinc-800 pt-3 text-xs text-zinc-500">
            库层（<span className="font-mono text-zinc-400">PoolAccrualLib</span>、
            <span className="font-mono text-zinc-400">NotifyRewardLib</span>、
            <span className="font-mono text-zinc-400">PoolBWithdrawLib</span> 等）被模块内联调用，负责累加器更新、预算与不变量检查，避免核心单文件过大。
          </p>
        </div>
      </Section>

      <Section id="flows" title="三、核心流程">
        <ol className="list-decimal space-y-4 pl-5 marker:text-zinc-500">
          <li>
            <span className="text-zinc-200">用户质押 Pool A（TokenA → 计息）</span>
            <p className="mt-1 pl-0 sm:pl-1">
              钱包授权 TokenA → 调用 <code className="font-mono text-zinc-300">stakeA</code> → 核心 delegatecall{" "}
              <code className="font-mono text-zinc-300">executeStakeA</code> →{" "}
              <code className="font-mono text-zinc-300">PoolAStakeLib</code>{" "}
              按实际到账量记账（兼容 FOT 等转账费）。奖励在 Pool A 预算内按 accRewardPerToken 累积，领取走{" "}
              <code className="font-mono text-zinc-300">claimA</code> /{" "}
              <code className="font-mono text-zinc-300">PoolSingleClaimLib</code>。
            </p>
          </li>
          <li>
            <span className="text-zinc-200">用户质押 Pool B（TokenB、带锁与费用语义）</span>
            <p className="mt-1 pl-0 sm:pl-1">
              <code className="font-mono text-zinc-300">stakeB</code> 更新加权质押与{" "}
              <code className="font-mono text-zinc-300">unlockTimeB</code>；<code className="font-mono text-zinc-300">withdrawB</code>{" "}
              经 <code className="font-mono text-zinc-300">PoolBWithdrawLib</code> 区分提前/中期/正常退出与罚金、手续费；可{" "}
              <code className="font-mono text-zinc-300">compoundB</code> 将两池待领奖励复投为 B 池本金。
            </p>
          </li>
          <li>
            <span className="text-zinc-200">运营注资与 emission（OPERATOR）</span>
            <p className="mt-1 pl-0 sm:pl-1">
              <code className="font-mono text-zinc-300">notifyRewardAmountA/B</code> 进入 AdminModule →{" "}
              <code className="font-mono text-zinc-300">NotifyRewardLib</code>，拉长{" "}
              <code className="font-mono text-zinc-300">periodFinish</code>、调整{" "}
              <code className="font-mono text-zinc-300">rewardRate</code>，并维护可用奖励预算与全局累加器更新入口（与{" "}
              <code className="font-mono text-zinc-300">PoolAccrualLib</code> 配合）。
            </p>
          </li>
          <li>
            <span className="text-zinc-200">治理与时间锁（ADMIN / Timelock）</span>
            <p className="mt-1 pl-0 sm:pl-1">
              敏感参数通过核心上的 <code className="font-mono text-zinc-300">pendingOps</code>{" "}
              与 AdminModule 内逻辑调度；链下通过前端治理页查看队列、倒计时，链上由 Timelock 调度 Admin 合约再调用核心。运营类{" "}
              <code className="font-mono text-zinc-300">pause</code> / <code className="font-mono text-zinc-300">notifyReward</code>{" "}
              按设计可走零延迟角色以保障运维响应（详见部署脚本 NatSpec）。
            </p>
          </li>
          <li>
            <span className="text-zinc-200">前端一次读多状态</span>
            <p className="mt-1 pl-0 sm:pl-1">
              <code className="font-mono text-zinc-300">useStaking</code> 用 <code className="font-mono text-zinc-300">useReadContracts</code>{" "}
              合并只读调用；写路径经 <code className="font-mono text-zinc-300">useWriteWithStatus</code>、交易中心与 Toast 统一反馈。
            </p>
          </li>
        </ol>
      </Section>

      <Section id="order" title="四、建议阅读顺序">
        <p className="mb-3">按「先业务全貌 → 核心入口 → 执行拆分 → 前端对接」递进：</p>
        <ol className="list-decimal space-y-2 pl-5 text-zinc-300 marker:text-zinc-500">
          <li>
            <span className="text-zinc-200">PRD.md</span> — 双池经济模型、角色、时间锁操作 ID、风险与边界条件。
          </li>
          <li>
            <span className="text-zinc-200">StakeTypes.sol</span> — <code className="font-mono text-zinc-400">PoolInfo</code> /{" "}
            <code className="font-mono text-zinc-400">UserInfo</code> / <code className="font-mono text-zinc-400">PendingOp</code>{" "}
            字段含义，后续读存储与事件会轻松很多。
          </li>
          <li>
            <span className="text-zinc-200">DualPoolStaking.sol</span> — 浏览对外函数列表与 <code className="font-mono text-zinc-400">_delegateTo</code>
            ，建立「入口 → 模块」心智模型。
          </li>
          <li>
            <span className="text-zinc-200">DualPoolStorageLayout.sol</span> — 对照核心合约状态字段顺序（delegatecall 安全必修课）。
          </li>
          <li>
            <span className="text-zinc-200">DualPoolUserModule.sol</span> — 任选一条路径（如 executeStakeB）跟进到具体 library。
          </li>
          <li>
            <span className="text-zinc-200">DualPoolAdminModule.sol + NotifyRewardLib / StakingAdminLib</span> — 治理与注资路径。
          </li>
          <li>
            <span className="text-zinc-200">script/DualPoolStaking.s.sol</span> — 部署顺序与角色归属（Operator vs Timelock Admin）。
          </li>
          <li>
            <span className="text-zinc-200">test/DualPoolStaking.t.sol</span> — 用例即「可执行规格」，适合反向理解边界。
          </li>
          <li>
            <span className="text-zinc-200">frontend：contracts/addresses.ts → hooks/useStaking.ts → app/pool-a|pool-b|governance</span> — 从数据到页面。
          </li>
        </ol>
        <p className="mt-4 rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2 text-xs text-zinc-500">
          可选：<code className="font-mono text-zinc-400">DualPoolStakingOld.sol</code> /{" "}
          <code className="font-mono text-zinc-400">*AdminOld*</code> 用于对比迁移前后；日常学习以非 Old 为准。
        </p>
      </Section>

      <div className="flex flex-wrap gap-3 border-t border-zinc-800 pt-6 text-sm">
        <Link href="/" className="text-sky-400 hover:underline">
          ← Dashboard
        </Link>
        <Link href="/governance" className="text-sky-400 hover:underline">
          Governance →
        </Link>
      </div>
    </div>
  );
}
