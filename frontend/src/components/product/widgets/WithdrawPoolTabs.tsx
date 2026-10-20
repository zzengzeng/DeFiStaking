"use client";

import { usePathname, useRouter } from "next/navigation";

import { POOL_COPY } from "@/lib/appMode";
import { useI18n } from "@/lib/i18n";

import { PoolTabs } from "./PoolTabs";

/** 赎回专页：灵活池 A / 锁仓池 B 切换 */
export function WithdrawPoolTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();

  const tabs = [
    { id: "flexible", label: t("home.tabFlexible"), token: "TokenA" },
    { id: "locked", label: t("home.tabLocked"), token: "TokenB" },
  ];

  const activeId = pathname === POOL_COPY.locked.withdrawHref ? "locked" : "flexible";

  return (
    <PoolTabs
      tabs={tabs}
      activeId={activeId}
      onChange={(id) => {
        const href = id === "locked" ? POOL_COPY.locked.withdrawHref : POOL_COPY.flexible.withdrawHref;
        if (href !== pathname) router.push(href);
      }}
    />
  );
}
