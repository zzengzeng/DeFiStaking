"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import clsx from "clsx";

import { BrandMark } from "@/components/BrandMark";
import { ModeSwitcher } from "@/components/ModeSwitcher";
import { NetworkGuard } from "@/components/NetworkGuard";
import { ProductFooter } from "@/components/product/ProductFooter";
import { StatusBanner } from "@/components/StatusBanner";
import { TxCenterHeaderButton } from "@/components/TxCenterPanel";
import { useStaking } from "@/hooks/useStaking";

const PRODUCT_LINKS = [
  { href: "/", label: "质押" },
  { href: "/withdraw/flexible", label: "赎回" },
  { href: "/learn", label: "了解更多" },
] as const;

function isNavActive(pathname: string, href: string): boolean {
  if (href === "/withdraw/flexible") {
    return pathname === "/withdraw/flexible" || pathname === "/withdraw/locked";
  }
  return pathname === href;
}

function WalletCluster({ roleBadge }: { roleBadge: string | null }) {
  return (
    <>
      {roleBadge ? (
        <span className="max-w-[6rem] truncate rounded-full border border-amber-800/40 bg-amber-950/30 px-2 py-0.5 text-[10px] text-amber-200 lg:max-w-none">
          {roleBadge}
        </span>
      ) : null}
      <TxCenterHeaderButton />
      <ConnectButton />
    </>
  );
}

/** 产品端顶栏壳层 */
export function ProductShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const staking = useStaking();

  const roleBadge = useMemo(() => {
    if (staking.status === "NORMAL") return null;
    return staking.status;
  }, [staking.status]);

  return (
    <div className="flex min-h-screen min-w-0 flex-col overflow-x-clip bg-[#0d0d0d] text-zinc-100">
      <header className="dp-app-header shrink-0 border-b border-[var(--dp-border)] bg-[var(--dp-surface)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--dp-surface)]/80">
        <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-3 px-4 py-3 sm:py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <Link href="/" className="flex min-w-0 items-center gap-2">
              <BrandMark size="sm" />
              <span className="truncate text-base font-semibold tracking-tight sm:text-lg">
                DualPool
              </span>
            </Link>
            <div className="flex shrink-0 items-center gap-1.5 lg:hidden">
              <ModeSwitcher compact />
              <WalletCluster roleBadge={roleBadge} />
            </div>
          </div>
          <nav
            aria-label="产品导航"
            className="dp-scrollbar-none -mx-1 flex min-w-0 max-w-full flex-nowrap gap-0.5 overflow-x-auto overscroll-x-contain px-1 sm:gap-1 lg:flex-1 lg:justify-center"
          >
            {PRODUCT_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition",
                  isNavActive(pathname, link.href)
                    ? "bg-[var(--dp-accent-muted)] text-[var(--dp-accent)]"
                    : "text-zinc-400 hover:text-zinc-100",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="hidden shrink-0 items-center gap-2 lg:flex">
            <ModeSwitcher />
            <WalletCluster roleBadge={roleBadge} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 overflow-x-clip px-4 pb-6 sm:pb-8">
        {staking.status !== "NORMAL" ? <StatusBanner status={staking.status} showEscapeAnchor /> : null}
        <NetworkGuard />
        {children}
        <ProductFooter />
      </main>
    </div>
  );
}
