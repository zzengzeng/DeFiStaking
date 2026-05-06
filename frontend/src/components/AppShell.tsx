"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import clsx from "clsx";

import { StatusBanner } from "@/components/StatusBanner";
import { TxCenterHeaderButton } from "@/components/TxCenterPanel";
import { useProtocolRoles } from "@/hooks/useProtocolRoles";
import { useStaking } from "@/hooks/useStaking";
import { useTimelockGovernanceRoles } from "@/hooks/useTimelockGovernanceRoles";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const staking = useStaking();
  const roles = useProtocolRoles();
  const tl = useTimelockGovernanceRoles();

  const canSeeGovernance = Boolean(roles.address && (roles.isOperator || tl.canAccessTimelockGovernance));

  const links = useMemo(() => {
    const base: { href: string; label: string }[] = [
      { href: "/", label: "Dashboard" },
      { href: "/pool-a", label: "Pool A" },
      { href: "/pool-b", label: "Pool B" },
    ];
    if (canSeeGovernance) {
      base.push({ href: "/governance", label: "Governance" });
    }
    base.push({ href: "/learn", label: "学习" });
    return base;
  }, [canSeeGovernance]);

  const rolesLoading = roles.isLoading || tl.isLoading;

  const roleBadge =
    roles.address && !rolesLoading
      ? (() => {
          const bits: string[] = [];
          if (tl.canAccessTimelockGovernance) bits.push("Timelock 治理");
          if (roles.isOperator) bits.push("运营");
          return bits.length ? bits.join(" · ") : null;
        })()
      : null;

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-zinc-950 text-zinc-100">
      <header className="shrink-0 border-b border-zinc-800 bg-zinc-900/80">
        <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-3 px-3 py-3 sm:px-4 sm:py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div className="flex min-w-0 items-center justify-between gap-2 lg:max-w-[280px] lg:shrink-0">
            <div className="min-w-0 truncate text-base font-semibold sm:text-lg">DualPool Staking</div>
            <div className="flex max-w-[min(100%,200px)] shrink-0 items-center gap-1.5 lg:hidden">
              {roleBadge ? (
                <span
                  className="max-w-[5.5rem] truncate rounded-full border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium text-amber-200/95"
                  title="链上角色：TimelockController（治理）/ DualPoolStaking OPERATOR（运营）"
                >
                  {roleBadge}
                </span>
              ) : null}
              <TxCenterHeaderButton />
              <ConnectButton />
            </div>
          </div>
          <nav
            aria-label="Primary"
            className="-mx-1 flex w-full min-w-0 flex-nowrap gap-1 overflow-x-auto overscroll-x-contain px-1 pb-0.5 sm:gap-2 lg:w-auto lg:flex-1 lg:justify-center lg:overflow-x-visible lg:px-0 lg:pb-0"
          >
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium sm:px-3 sm:text-sm",
                  pathname === link.href ? "bg-zinc-100 text-black" : "text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-100",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="hidden shrink-0 items-center gap-2 lg:flex">
            {roleBadge ? (
              <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] font-medium text-amber-200/95" title="链上角色：TimelockController（治理）/ DualPoolStaking OPERATOR（运营）">
                {roleBadge}
              </span>
            ) : null}
            <TxCenterHeaderButton />
            <ConnectButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-3 py-4 sm:px-4 sm:py-6">
        <StatusBanner status={staking.status} />
        {children}
      </main>
    </div>
  );
}
