/** 产品端：面向质押用户；控制台：合约 / 运维 / 治理调试 */
export type AppMode = "product" | "console";

export const APP_MODE_STORAGE_KEY = "dualpool-ui-mode";

export function isConsolePath(pathname: string): boolean {
  return pathname === "/console" || pathname.startsWith("/console/");
}

export function modeFromPath(pathname: string): AppMode {
  return isConsolePath(pathname) ? "console" : "product";
}

/** 双模式间对应路由：控制台 → 产品首页；产品深链 → 对应控制台池子 */
export function counterpartPath(pathname: string): string {
  if (isConsolePath(pathname)) {
    return "/";
  }

  if (pathname === "/earn/flexible" || pathname === "/withdraw/flexible") {
    return "/console/pool-a";
  }
  if (pathname === "/earn/locked" || pathname === "/withdraw/locked") {
    return "/console/pool-b";
  }

  return "/console";
}

export const POOL_COPY = {
  flexible: {
    id: "A" as const,
    slug: "flexible",
    productTitle: "灵活质押",
    productSubtitle: "随存随取，无锁仓与提现手续费",
    consoleTitle: "灵活池",
    stakeToken: "TokenA",
    rewardToken: "TokenB",
    earnHref: "/earn/flexible",
    withdrawHref: "/withdraw/flexible",
    consoleHref: "/console/pool-a",
    accent: "from-emerald-950/40 to-zinc-900",
    border: "border-emerald-800/40",
  },
  locked: {
    id: "B" as const,
    slug: "locked",
    productTitle: "锁仓质押",
    productSubtitle: "更高收益，支持复利；提前退出可能产生费用",
    consoleTitle: "锁仓池",
    stakeToken: "TokenB",
    rewardToken: "TokenB",
    earnHref: "/earn/locked",
    withdrawHref: "/withdraw/locked",
    consoleHref: "/console/pool-b",
    accent: "from-violet-950/40 to-zinc-900",
    border: "border-violet-800/40",
  },
} as const;
