"use client";

import { usePathname, useRouter } from "next/navigation";

import { POOL_COPY } from "@/lib/appMode";

import { PoolTabs } from "./PoolTabs";

const TABS = [
  { id: "flexible", label: "灵活 · TokenA", token: "TokenA" },
  { id: "locked", label: "锁仓 · TokenB", token: "TokenB" },
] as const;

/** 赎回专页：灵活池 A / 锁仓池 B 切换 */
export function WithdrawPoolTabs() {
  const pathname = usePathname();
  const router = useRouter();

  const activeId = pathname === POOL_COPY.locked.withdrawHref ? "locked" : "flexible";

  return (
    <PoolTabs
      tabs={[...TABS]}
      activeId={activeId}
      onChange={(id) => {
        const href = id === "locked" ? POOL_COPY.locked.withdrawHref : POOL_COPY.flexible.withdrawHref;
        if (href !== pathname) router.push(href);
      }}
    />
  );
}
