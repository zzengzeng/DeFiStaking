"use client";

import { formatToken, safeNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

type Stat = {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
};

/** 协议级横向统计条 */
export function ProtocolStats({ stats, loading }: { stats: Stat[]; loading?: boolean }) {
  const { t } = useI18n();

  if (loading) {
    return (
      <div className="dp-card grid grid-cols-2 gap-px overflow-hidden sm:grid-cols-4" aria-busy="true" aria-label={t("async.loadingProtocol")}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-[var(--dp-surface-raised)] px-4 py-4 sm:px-5 sm:py-5">
            <div className="h-3 w-16 animate-pulse rounded bg-zinc-800" />
            <div className="mt-3 h-7 w-24 animate-pulse rounded bg-zinc-700" />
            <div className="mt-2 h-3 w-20 animate-pulse rounded bg-zinc-800/80" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="dp-card grid grid-cols-2 gap-px overflow-hidden sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="bg-[var(--dp-surface-raised)] px-4 py-4 sm:px-5 sm:py-5">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{s.label}</div>
          <div
            className={`mt-1 text-xl font-bold tracking-tight sm:text-2xl ${s.highlight ? "text-[var(--dp-accent)]" : "text-zinc-50"}`}
          >
            {s.value}
          </div>
          {s.sub ? <div className="mt-0.5 text-xs text-zinc-500">{s.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function formatTvlDisplay(wei: bigint, symbol: string): string {
  const n = safeNumber(Number(wei) / 1e18);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M ${symbol}`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K ${symbol}`;
  return `${formatToken(wei, 18, 2)} ${symbol}`;
}
