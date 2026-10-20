"use client";

import { formatToken, safeNumber } from "@/lib/format";
import { estAprPercent, estApyDailyCompoundPercent, userSharePercent } from "@/lib/poolMetrics";
import { useConsoleCopy } from "@/lib/consoleCopy";

type Props = {
  variant?: "product" | "console";
  poolLabel: string;
  tokenSymbol: string;
  totalStakedWei: bigint;
  rewardRateWei: bigint;
  userStakedWei: bigint;
  walletConnected: boolean;
};

/** Pool 页顶栏：TVL、APR/APY、用户份额（与 Dashboard 同一 APR 口径）。 */
export function PoolHeaderStats({
  variant = "console",
  poolLabel,
  tokenSymbol,
  totalStakedWei,
  rewardRateWei,
  userStakedWei,
  walletConnected,
}: Props) {
  const copy = useConsoleCopy();
  const apr = estAprPercent(rewardRateWei, totalStakedWei);
  const apy = estApyDailyCompoundPercent(apr);
  const sharePct = walletConnected && totalStakedWei > 0n ? userSharePercent(userStakedWei, totalStakedWei) : null;

  return (
    <div className="min-w-0 rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-950 to-zinc-900/50 p-3 sm:p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{poolLabel}</div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
          <div className="text-xs text-zinc-500">{copy.stats.tvl}</div>
          <div className="mt-1 break-words font-mono text-base font-semibold text-zinc-100 sm:text-lg">
            {formatToken(totalStakedWei)} {tokenSymbol}
          </div>
        </div>
        <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
          <div className="text-xs text-zinc-500">{copy.stats.apr}</div>
          <div className="mt-1 text-base font-semibold text-zinc-100 sm:text-lg">{safeNumber(apr).toFixed(2)}%</div>
        </div>
        <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
          <div className="text-xs text-zinc-500">{copy.stats.apy}</div>
          <div
            className="mt-1 text-base font-semibold text-emerald-200/90 sm:text-lg"
            title={apy === null ? copy.stats.apyTooHigh : undefined}
          >
            {apy === null ? "—" : `${safeNumber(apy).toFixed(2)}%`}
          </div>
        </div>
        <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
          <div className="text-xs text-zinc-500">{copy.stats.yourShare}</div>
          <div className="mt-1 text-base font-semibold text-sky-200/90 sm:text-lg">
            {!walletConnected ? "—" : sharePct !== null && sharePct > 0 ? `${safeNumber(sharePct).toFixed(4)}%` : "0%"}
          </div>
        </div>
      </div>
      {variant === "console" ? (
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">{copy.stats.footnote}</p>
      ) : null}
    </div>
  );
}
