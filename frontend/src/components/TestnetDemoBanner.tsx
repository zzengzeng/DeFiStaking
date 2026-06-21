"use client";

import Link from "next/link";

import { appChainLabel, isMainnetTarget } from "@/config/chains";
import { hasWalletConnect } from "@/config/walletConnect";
import { useI18n } from "@/lib/i18n";

const SEPOLIA_FAUCET = "https://sepoliafaucet.com/";

/** 测试网公开演示顶栏提示（主网目标时不展示） */
export function TestnetDemoBanner() {
  const { t } = useI18n();

  if (isMainnetTarget) return null;

  return (
    <div
      role="status"
      className="mb-4 rounded-xl border border-sky-500/25 bg-gradient-to-r from-sky-500/10 via-[var(--dp-surface)] to-violet-500/10 px-4 py-3 text-sm text-zinc-200"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sky-200">{t("demo.title")}</span>
            <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-200">
              {t("demo.unaudited")}
            </span>
            <span className="text-xs text-zinc-500">{t("demo.network", { network: appChainLabel })}</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{t("demo.body")}</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {hasWalletConnect ? t("demo.wcHint") : t("demo.wcMissing")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <a
            href={SEPOLIA_FAUCET}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[36px] items-center rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 text-xs font-medium text-sky-200 transition hover:bg-sky-500/20"
          >
            {t("demo.faucet")} ↗
          </a>
          <Link
            href="/learn"
            className="inline-flex min-h-[36px] items-center rounded-lg border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] px-3 text-xs font-medium text-zinc-300 transition hover:text-zinc-100"
          >
            {t("demo.docs")}
          </Link>
        </div>
      </div>
    </div>
  );
}
