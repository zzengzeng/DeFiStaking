/** 全站共享 UI 文案（交易、Timelock、赎回预览等） */
export const UI_COPY = {
  tx: {
    awaitingSignature: "等待钱包签名",
    pending: "链上确认中",
    confirmed: "已确认",
    failed: "失败",
    confirmInWallet: "请在钱包中确认",
    submitted: "交易已提交",
    confirmedToast: "交易已确认",
    failedToast: "交易失败",
    explorer: "区块浏览器",
    poolMeta: (pool: string) => `${pool === "A" ? "灵活池" : "锁仓池"}`,
    timeAgo: (s: number) => {
      if (s < 60) return `${s} 秒前`;
      const m = Math.floor(s / 60);
      if (m < 60) return `${m} 分钟前`;
      const h = Math.floor(m / 60);
      if (h < 48) return `${h} 小时前`;
      return `${Math.floor(h / 24)} 天前`;
    },
    typeLabel: {
      stake: "质押",
      approve: "授权",
      withdraw: "赎回",
      claim: "领取",
      compound: "复利",
      emergency: "紧急",
      governance: "治理",
      notify: "注入奖励",
      write: "合约调用",
    } as Record<string, string>,
    approveStakeToken: "授权质押代币",
    stake: "质押",
  },
  timelock: {
    notQueued: "未排队",
    queued: "已排队",
    ready: "可执行",
    executed: "已执行",
    cancelled: "已取消",
    remaining: "剩余",
    executeAt: "可执行时间",
    remainingHms: "剩余 (时:分:秒)",
    executedAt: "执行于",
    cancelledAt: "取消于",
    idleHint: "该操作尚无 Timelock 排队记录。",
    schedule: "排队",
    execute: "执行",
    cancel: "取消",
    executeTitle: (title: string) => `执行：${title}`,
    executeWarning:
      "将通过 TimelockController → DualPoolStakingAdmin → 核心，在链上执行已排队的治理操作。",
    executeConfirm: "链上执行",
    scheduleAction: (title: string) => `Timelock 排队：${title}`,
    executeAction: (title: string) => `Timelock 执行：${title}`,
    cancelAction: (title: string) => `Timelock 取消：${title}`,
    queueTitle: "待执行队列",
    queueDesc: "函数、参数摘要、本地可执行时间、剩余倒计时与状态。所有治理写操作均经 Timelock 延迟。",
    queueEmpty: "暂无待执行的 Timelock 操作。",
    recentTitle: "近期结算",
    recentDesc: "最近已执行或已取消的 Timelock 载荷（只读）。",
    colFunction: "函数",
    colParams: "参数",
    colExecuteAt: "可执行时间",
    colRemaining: "剩余 (时:分:秒)",
    colStatus: "状态",
    colSettledAt: "结算时间（本地）",
    unknown: "未知",
    roleSchedule: "排队：需要 Timelock `PROPOSER_ROLE`。",
    roleExecute: "执行：需要 Timelock `EXECUTOR_ROLE`（到达 minDelay 后）。",
    roleCancel: "取消：需要 Timelock `CANCELLER_ROLE`（操作仍在 pending 时）。",
  },
  withdrawPreview: {
    contractGross: "合约转出（毛额）",
    walletReceive: "预计钱包到账",
    youReceive: "预计到账",
    fee: "手续费",
    penalty: "罚金",
    fotHint: (pct: string) =>
      `FOT 代币：转账税（最高 ${pct}）由用户承担，池子不补贴。`,
  },
  operator: {
    approveNotify: (pool: "A" | "B") =>
      `授权 TokenB（${pool === "A" ? "灵活池" : "锁仓池"}注资）`,
    notify: (pool: "A" | "B") => `注入奖励（${pool === "A" ? "灵活池" : "锁仓池"}）`,
    enableEmergency: "开启紧急模式",
  },
} as const;
