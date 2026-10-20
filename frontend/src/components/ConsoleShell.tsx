"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import clsx from "clsx";

import { BrandMark } from "@/components/BrandMark";
import { BrandedWalletButton } from "@/components/ConnectWalletButton";
import { ConsoleStatusBadge } from "@/components/console/ConsoleStatusBadge";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { ModeSwitcher } from "@/components/ModeSwitcher";
import { StatusBanner } from "@/components/StatusBanner";
import { CatchUpBanner } from "@/components/CatchUpBanner";
import { TxCenterHeaderButton } from "@/components/TxCenterPanel";
import { POOL_COPY } from "@/lib/appMode";
import { useConsoleCopy } from "@/lib/consoleCopy";
import { governanceAddresses } from "@/contracts/addresses";
import { useProtocolRoles } from "@/hooks/useProtocolRoles";
import { useStaking } from "@/hooks/useStaking";
import { useTimelockGovernanceRoles } from "@/hooks/useTimelockGovernanceRoles";

/** 合约控制台 / 内部运维工具壳层（导航、角色徽章、Locale / Mode 切换） */
export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const copy = useConsoleCopy();
  const pathname = usePathname();
  const staking = useStaking();
  const roles = useProtocolRoles();
  const tl = useTimelockGovernanceRoles();
  const tlSuper = useTimelockGovernanceRoles(governanceAddresses.timelockSuper);

  const canSeeGovernance = Boolean(
    roles.address &&
      (roles.isAdmin || roles.isOperator || tl.canAccessTimelockGovernance || tlSuper.canAccessTimelockGovernance),
  );

  const links = useMemo(() => {
    const base: { href: string; label: string }[] = [
      { href: "/console", label: copy.nav.hub },
      { href: POOL_COPY.flexible.consoleHref, label: copy.nav.poolFlexible },
      { href: POOL_COPY.locked.consoleHref, label: copy.nav.poolLocked },
    ];
    if (canSeeGovernance) {
      base.push({ href: "/console/governance", label: copy.nav.governance });
    }
    return base;
  }, [canSeeGovernance, copy.nav.governance, copy.nav.hub, copy.nav.poolFlexible, copy.nav.poolLocked]);

  const rolesLoading = roles.isLoading || tl.isLoading || tlSuper.isLoading;

  const roleBadge =
    roles.address && !rolesLoading
      ? (() => {
          const bits: string[] = [];
          if (tl.canAccessTimelockGovernance) bits.push(copy.roleBadge.timelock);
          if (tlSuper.canAccessTimelockGovernance) bits.push("Super");
          if (roles.isAdmin) bits.push("Admin");
          if (roles.isOperator) bits.push(copy.roleBadge.operator);
          return bits.length ? bits.join(" · ") : null;
        })()
      : null;

  return (
    <div className="dp-console-grid flex min-h-screen min-w-0 flex-col overflow-x-clip bg-zinc-950 text-zinc-100">
      <header className="dp-app-header dp-brand-frame shrink-0 border-b border-[var(--dp-border)] bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/85">
        <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-3 px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <Link href="/console" className="flex min-w-0 items-center gap-2">
              <BrandMark variant="console" size="sm" />
              <span className="min-w-0">
                <span className="block font-mono text-base font-semibold sm:text-lg">{copy.brand.title}</span>
                <span className="hidden text-[10px] text-amber-200/70 sm:block">{copy.brand.subtitle}</span>
              </span>
            </Link>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <LocaleSwitcher compact className="sm:hidden" />
              <LocaleSwitcher compact className="hidden sm:inline-flex" />
              <ModeSwitcher compact className="sm:hidden" />
              <ModeSwitcher className="hidden sm:inline-flex" />
              {roleBadge ? (
                <ConsoleStatusBadge tone="good" className="hidden max-w-[8rem] truncate md:inline">
                  {roleBadge}
                </ConsoleStatusBadge>
              ) : null}
              <TxCenterHeaderButton />
              <BrandedWalletButton compact variant="console" />
            </div>
          </div>
          <nav
            aria-label={copy.nav.aria}
            className="dp-scrollbar-none -mx-1 flex w-full min-w-0 flex-wrap gap-1 overflow-x-auto overscroll-x-contain px-1 sm:gap-2"
          >
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 font-mono text-xs transition sm:px-3 sm:text-sm",
                  pathname === link.href
                    ? "bg-amber-300 text-black shadow-[0_0_0_1px_rgba(251,191,36,0.18)]"
                    : "border border-transparent text-zinc-400 hover:border-zinc-800 hover:bg-zinc-900 hover:text-zinc-100",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 overflow-x-clip px-3 py-4 sm:px-4 sm:py-6">
        <CatchUpBanner />
        <StatusBanner status={staking.status} />
        {children}
      </main>
    </div>
  );
}
