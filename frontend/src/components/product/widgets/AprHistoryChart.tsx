"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import { useChainId } from "wagmi";

import type { IndexedNotifyReward } from "@/types/notifyRewardLog";
import { ProductStateCard, ProductSkeletonRows } from "@/components/product/ProductStateCard";
import { formatBlockDate } from "@/lib/enrichBlockTimestamps";
import { getTxExplorerUrl } from "@/lib/explorerLink";
import { safeNumber } from "@/lib/format";
import { estAprPercent } from "@/lib/poolMetrics";

type PoolId = "A" | "B";
type RangeId = "7d" | "30d" | "90d" | "all";

type Props = {
  entries: IndexedNotifyReward[];
  tvlA: bigint;
  tvlB: bigint;
  currentAprA: number;
  currentAprB: number;
  loading?: boolean;
  error?: string;
};

const RANGES: { id: RangeId; label: string; sec: number | null }[] = [
  { id: "7d", label: "7天", sec: 7 * 86400 },
  { id: "30d", label: "30天", sec: 30 * 86400 },
  { id: "90d", label: "90天", sec: 90 * 86400 },
  { id: "all", label: "全部", sec: null },
];

function sparkArea(points: number[], w: number, h: number): { line: string; area: string } {
  if (points.length < 2) return { line: "", area: "" };
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const stepX = w / (points.length - 1);
  const toY = (v: number) => h - ((v - min) / span) * h;

  let line = `M 0 ${toY(points[0]).toFixed(2)}`;
  for (let i = 1; i < points.length; i += 1) {
    line += ` L ${(i * stepX).toFixed(2)} ${toY(points[i]).toFixed(2)}`;
  }
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  return { line, area };
}

function filterByRange(rows: IndexedNotifyReward[], rangeSec: number | null): IndexedNotifyReward[] {
  if (rangeSec === null) return rows;
  const cutoff = Math.floor(Date.now() / 1000) - rangeSec;
  return rows.filter((r) => {
    const ts = Number(r.blockTimestamp ?? 0);
    // 无 timestamp 时保留，避免误过滤
    if (ts <= 0) return true;
    return ts >= cutoff;
  });
}

/** APR 历史图表：无历史数据时回退为当前 APR 平线 */
export function AprHistoryChart({ entries, tvlA, tvlB, currentAprA, currentAprB, loading, error }: Props) {
  const chainId = useChainId();
  const [pool, setPool] = useState<PoolId>("A");
  const [range, setRange] = useState<RangeId>("all");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const w = 560;
  const h = 140;
  const rangeSec = RANGES.find((r) => r.id === range)?.sec ?? null;
  const currentApr = pool === "A" ? currentAprA : currentAprB;
  const tvl = pool === "A" ? tvlA : tvlB;

  const { ordered, points, fromFallback } = useMemo(() => {
    const poolRows = entries.filter((e) => (pool === "B" ? e.pool === 1 : e.pool === 0));
    const ranged = filterByRange(poolRows, rangeSec).slice(0, 48);
    const orderedRows = [...ranged].reverse();
    let pts = orderedRows.map((r) => estAprPercent(BigInt(r.rate), tvl > 0n ? tvl : 1n));

    let fallback = false;
    if (pts.length === 0 && currentApr > 0) {
      pts = [currentApr, currentApr];
      fallback = true;
    } else if (pts.length === 1) {
      pts = [pts[0], pts[0]];
      fallback = true;
    }

    return { ordered: orderedRows, points: pts, fromFallback: fallback };
  }, [entries, pool, rangeSec, tvl, currentApr]);

  const { line, area } = useMemo(() => sparkArea(points, w, h), [points]);
  const min = points.length ? Math.min(...points) : null;
  const max = points.length ? Math.max(...points) : null;

  const hoveredApr = hoverIdx !== null ? points[hoverIdx] : null;
  const hoveredRow = hoverIdx !== null ? ordered[hoverIdx] : null;
  const hoverX = hoverIdx !== null && points.length > 1 ? (hoverIdx * w) / (points.length - 1) : null;
  const hoverY =
    hoverIdx !== null && points.length > 1 && min !== null && max !== null
      ? h - ((points[hoverIdx] - min) / (max - min || 1)) * h
      : null;

  return (
    <div className="dp-card flex flex-col p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">APR 历史</h2>
          <p className="mt-1 text-xs text-zinc-500">奖励注资后的年化走势</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-xl border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] p-1">
            {(["A", "B"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPool(p)}
                className={clsx(
                  "min-h-[32px] rounded-lg px-2.5 text-xs font-medium sm:px-3 sm:text-sm",
                  pool === p ? "bg-[var(--dp-accent)] text-black" : "text-zinc-400",
                )}
              >
                {p === "A" ? "灵活" : "锁仓"}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] p-1">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={clsx(
                  "min-h-[32px] rounded-lg px-2 text-xs font-medium sm:px-2.5",
                  range === r.id ? "bg-zinc-700 text-zinc-100" : "text-zinc-500",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] px-3 py-3">
          <div className="text-xs text-zinc-500">当前</div>
          <div className="mt-1 text-lg font-bold text-[var(--dp-accent)] sm:text-xl">
            {loading ? "…" : `${safeNumber(currentApr).toFixed(2)}%`}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] px-3 py-3">
          <div className="text-xs text-zinc-500">区间最低</div>
          <div className="mt-1 text-lg font-bold text-zinc-100 sm:text-xl">
            {min === null ? "—" : `${safeNumber(min).toFixed(2)}%`}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] px-3 py-3">
          <div className="text-xs text-zinc-500">区间最高</div>
          <div className="mt-1 text-lg font-bold text-zinc-100 sm:text-xl">
            {max === null ? "—" : `${safeNumber(max).toFixed(2)}%`}
          </div>
        </div>
      </div>

      <div className="relative mt-4 overflow-hidden rounded-xl border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] p-3">
        {loading ? (
          <div className="h-36 sm:h-40">
            <ProductSkeletonRows rows={3} />
          </div>
        ) : points.length < 2 ? (
          <div className="flex h-36 items-center sm:h-40">
            <ProductStateCard
              compact
              title="暂无注资历史"
              description="奖励注资后这里会展示 APR 变化曲线；当前先以实时 APR 和池子指标为准。"
            />
          </div>
        ) : (
          <>
            <svg viewBox={`0 0 ${w} ${h}`} className="h-36 w-full sm:h-40" preserveAspectRatio="none" role="img" aria-label="APR history chart">
              <defs>
                <linearGradient id="aprChartFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(0,163,255,0.35)" />
                  <stop offset="100%" stopColor="rgba(0,163,255,0)" />
                </linearGradient>
              </defs>
              <path d={area} fill="url(#aprChartFill)" />
              <path d={line} fill="none" stroke="rgba(0,163,255,0.95)" strokeWidth="2.5" strokeLinecap="round" />
              {hoverX !== null && hoverY !== null ? (
                <>
                  <line x1={hoverX} y1={0} x2={hoverX} y2={h} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
                  <circle cx={hoverX} cy={hoverY} r="5" fill="#00a3ff" stroke="#0d0d0d" strokeWidth="2" />
                </>
              ) : null}
              {points.map((_, i) => (
                <rect
                  // eslint-disable-next-line react/no-array-index-key
                  key={i}
                  x={i * (w / (points.length - 1)) - w / (points.length - 1) / 2}
                  y={0}
                  width={w / (points.length - 1)}
                  height={h}
                  fill="transparent"
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                />
              ))}
            </svg>

            {error ? (
              <div className="mt-2">
                <ProductStateCard compact tone="warning" title="历史索引暂不可用" description="已展示当前 APR 参考线，稍后可刷新重试。" />
              </div>
            ) : fromFallback ? (
              <p className="mt-2 text-center text-xs text-zinc-500">注资记录较少，展示当前 APR 参考线</p>
            ) : hoveredApr !== null && hoveredRow ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--dp-border)] bg-[var(--dp-surface)] px-3 py-2 text-xs">
                <div>
                  <span className="text-zinc-500">{formatBlockDate(hoveredRow.blockTimestamp)}</span>
                  <span className="ml-2 text-lg font-bold text-[var(--dp-accent)]">{safeNumber(hoveredApr).toFixed(2)}%</span>
                </div>
                <Link
                  href={getTxExplorerUrl(chainId, hoveredRow.transactionHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--dp-accent)] hover:underline"
                >
                  查看交易
                </Link>
              </div>
            ) : (
              <p className="mt-2 text-center text-xs text-zinc-500">
                悬停查看详情 · {ordered.length} 次注资
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
