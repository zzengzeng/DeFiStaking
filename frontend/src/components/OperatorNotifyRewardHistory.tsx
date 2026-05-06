"use client";

import { useMemo } from "react";
import { formatUnits } from "viem";
import { useChainId } from "wagmi";

import { useNotifyRewardLogs } from "@/hooks/useNotifyRewardLogs";
import { useProtocolRoles } from "@/hooks/useProtocolRoles";
import { getTxExplorerUrl } from "@/lib/explorerLink";

function formatDurationSec(sec: bigint): string {
  if (sec >= 86_400n && sec % 86_400n === 0n) return `${sec / 86_400n} 天`;
  if (sec >= 3600n && sec % 3600n === 0n) return `${sec / 3600n} 小时`;
  return `${sec.toString()} 秒`;
}

/** 运营可见：链上 RewardNotified 注资记录 */
export function OperatorNotifyRewardHistory() {
  const chainId = useChainId();
  const { isOperator, isLoading: rolesLoading } = useProtocolRoles();
  const { data, isLoading, isError, refetch, isFetching } = useNotifyRewardLogs(isOperator);

  if (rolesLoading || !isOperator) return null;

  const rows = data?.entries ?? [];
  const apiError = data?.error;

  const emptyHint = useMemo(() => {
    if (apiError) return `读链失败：${apiError}`;
    return "当前质押合约上暂无 RewardNotified 事件。若刚换过合约地址，请确认 `NEXT_PUBLIC_DUAL_STAKING_ADDRESS` 与链上部署一致；若历史较早，可调低 `NEXT_PUBLIC_STAKING_DEPLOY_BLOCK` 以扩大扫描起点。";
  }, [apiError]);

  return (
    <div className="mt-4 border-t border-amber-500/20 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-200/90">注入奖励记录</h4>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-amber-500/40 disabled:opacity-50"
        >
          {isFetching ? "刷新中…" : "刷新"}
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
        来源合约事件 <span className="font-mono text-zinc-400">RewardNotified</span>（实际入账 amount、发放周期、新
        rewardRate）。
      </p>

      {isLoading ? (
        <p className="mt-3 text-xs text-zinc-500">加载中…</p>
      ) : isError ? (
        <p className="mt-3 text-xs text-red-300/90">加载失败，请稍后重试。</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-500">{emptyHint}</p>
      ) : (
        <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-zinc-800/80">
          <table className="w-full min-w-[520px] border-collapse text-left text-[11px] text-zinc-300">
            <thead className="sticky top-0 bg-zinc-950/95 text-zinc-500 backdrop-blur">
              <tr className="border-b border-zinc-800">
                <th className="px-2 py-2 font-medium">池</th>
                <th className="px-2 py-2 font-medium">入账 TokenB</th>
                <th className="px-2 py-2 font-medium">周期</th>
                <th className="px-2 py-2 font-medium">rate / 秒</th>
                <th className="px-2 py-2 font-medium">区块</th>
                <th className="px-2 py-2 font-medium">交易</th>
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
