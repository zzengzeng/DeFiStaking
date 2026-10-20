"use client";

import { useMemo } from "react";
import { formatUnits } from "viem";
import { useChainId } from "wagmi";

import { ProductStateCard, ProductSkeletonRows } from "@/components/product/ProductStateCard";
import { useRewardNotifiedHistory } from "@/hooks/useRewardNotifiedHistory";
import { useProtocolRoles } from "@/hooks/useProtocolRoles";
import { getTxExplorerUrl } from "@/lib/explorerLink";
import { useI18n } from "@/lib/i18n";

/** 运营可见：链上 RewardNotified 注资记录 */
export function OperatorNotifyRewardHistory() {
  const { t } = useI18n();
  const chainId = useChainId();
  const { isOperator, isLoading: rolesLoading } = useProtocolRoles();
  const { data, isLoading, isError, refetch, isFetching } = useRewardNotifiedHistory(isOperator);
  const rows = data?.entries ?? [];
  const apiError = data?.error;

  const formatDurationSec = (sec: bigint) => {
    if (sec >= 86_400n && sec % 86_400n === 0n) return t("notifyHistory.durationDays", { n: Number(sec / 86_400n) });
    if (sec >= 3600n && sec % 3600n === 0n) return t("notifyHistory.durationHours", { n: Number(sec / 3600n) });
    return t("notifyHistory.durationSeconds", { n: sec.toString() });
  };

  const emptyHint = useMemo(() => {
    if (apiError) {
      return apiError.includes("maximum block range") || apiError.includes("exceed maximum block range")
        ? t("notifyHistory.errBlockRange")
        : t("notifyHistory.errFetchFailed");
    }
    return t("notifyHistory.emptyDefault");
  }, [apiError, t]);

  if (rolesLoading || !isOperator) return null;

  return (
    <div className="mt-4 border-t border-amber-500/20 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-200/90">{t("notifyHistory.title")}</h4>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-amber-500/40 disabled:opacity-50"
        >
          {isFetching ? t("notifyHistory.refreshing") : t("notifyHistory.refresh")}
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{t("notifyHistory.sourceDesc")}</p>

      {isLoading ? (
        <div className="mt-3">
          <ProductSkeletonRows rows={2} />
        </div>
      ) : isError ? (
        <div className="mt-3">
          <ProductStateCard
            compact
            tone="error"
            title={t("notifyHistory.loadFailed")}
            description={t("notifyHistory.loadFailedDesc")}
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-3">
          <ProductStateCard compact title={t("notifyHistory.noEvents")} description={emptyHint} />
        </div>
      ) : (
        <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-zinc-800/80">
          <table className="w-full min-w-[520px] border-collapse text-left text-[11px] text-zinc-300">
            <thead className="sticky top-0 bg-zinc-950/95 text-zinc-500 backdrop-blur">
              <tr className="border-b border-zinc-800">
                <th className="px-2 py-2 font-medium">{t("notifyHistory.colPool")}</th>
                <th className="px-2 py-2 font-medium">{t("notifyHistory.colAmount")}</th>
                <th className="px-2 py-2 font-medium">{t("notifyHistory.colDuration")}</th>
                <th className="px-2 py-2 font-medium">{t("notifyHistory.colRate")}</th>
                <th className="px-2 py-2 font-medium">{t("notifyHistory.colBlock")}</th>
                <th className="px-2 py-2 font-medium">{t("notifyHistory.colTx")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const poolLabel = r.pool === 1 ? "B" : "A";
                const amt = formatUnits(BigInt(r.amount), 18);
                const rateStr = BigInt(r.rate).toString();
                const txUrl = getTxExplorerUrl(chainId, r.transactionHash);
                return (
                  <tr key={`${r.transactionHash}-${r.logIndex}`} className="border-b border-zinc-800/60 last:border-0">
                    <td className="px-2 py-1.5 font-mono text-amber-200/90">{poolLabel}</td>
                    <td className="px-2 py-1.5 font-mono text-zinc-200" title={r.amount}>
                      {amt}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-zinc-400" title={r.duration}>
                      {formatDurationSec(BigInt(r.duration))}
                    </td>
                    <td className="max-w-[140px] truncate px-2 py-1.5 font-mono text-zinc-500" title={rateStr}>
                      {rateStr}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-zinc-500">{r.blockNumber}</td>
                    <td className="px-2 py-1.5">
                      <a
                        href={txUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-amber-300/90 underline decoration-amber-500/30 hover:decoration-amber-400"
                      >
                        {r.transactionHash.slice(0, 8)}…
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
