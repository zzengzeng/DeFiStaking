"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import { useChainId } from "wagmi";

import type { IndexedNotifyReward } from "@/types/notifyRewardLog";
import { ProductStateCard, ProductSkeletonRows } from "@/components/product/ProductStateCard";
import { formatBlockDate } from "@/lib/enrichBlockTimestamps";
import { getTxExplorerUrl } from "@/lib/explorerLink";
import { safeNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { chartTvlForApr, estAprPercent } from "@/lib/poolMetrics";

type PoolId = "A" | "B";
type RangeId = "7d" | "30d" | "90d" | "all";
type ViewMode = "single" | "compare";

type Props = {
  entries: IndexedNotifyReward[];
  tvlA: bigint;
  tvlB: bigint;
  currentAprA: number;
  currentAprB: number;
  loading?: boolean;
  error?: string;
};

type ChartPoint = {
  x: number;
  apr: number;
  row: IndexedNotifyReward;
};

const VIEW_W = 600;
const VIEW_H = 180;
const PAD_LEFT = 54;
const PAD_RIGHT = 12;
const PAD_TOP = 18;
const PAD_BOTTOM = 14;
const PLOT_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = VIEW_H - PAD_TOP - PAD_BOTTOM;

const POOL_COLORS = {
  A: { stroke: "rgba(0,163,255,0.95)", fill: "rgba(0,163,255,0.35)", dot: "#00a3ff" },
  B: { stroke: "rgba(167,139,250,0.95)", fill: "rgba(167,139,250,0.28)", dot: "#a78bfa" },
} as const;

function filterByRange(rows: IndexedNotifyReward[], rangeSec: number | null): IndexedNotifyReward[] {
  if (rangeSec === null) return rows;
  const cutoff = Math.floor(Date.now() / 1000) - rangeSec;
  return rows.filter((r) => {
    const ts = Number(r.blockTimestamp ?? 0);
    if (ts <= 0) return true;
    return ts >= cutoff;
  });
}

function buildSeries(
  rows: IndexedNotifyReward[],
  tvl: bigint,
  rangeSec: number | null,
  fallbackApr: number,
  plotW: number,
): { points: ChartPoint[]; fromFallback: boolean; usesReferenceTvl: boolean } {
  const poolRows = filterByRange(rows, rangeSec).slice(0, 48);
  const ordered = [...poolRows].reverse();
  const aprTvl = chartTvlForApr(tvl);
  const usesReferenceTvl = tvl === 0n && ordered.length > 0;

  if (ordered.length === 0 && fallbackApr > 0) {
    const stub = rows[0];
    if (!stub) {
      return { points: [], fromFallback: false, usesReferenceTvl: false };
    }
    return {
      points: [
        { x: 0, apr: fallbackApr, row: stub },
        { x: plotW, apr: fallbackApr, row: stub },
      ],
      fromFallback: true,
      usesReferenceTvl: false,
    };
  }

  if (ordered.length === 0) {
    return { points: [], fromFallback: false, usesReferenceTvl: false };
  }

  const timestamps = ordered.map((r) => Number(r.blockTimestamp ?? 0)).filter((ts) => ts > 0);
  const minTs = timestamps.length ? Math.min(...timestamps) : 0;
  const maxTs = timestamps.length ? Math.max(...timestamps) : minTs + 1;
  const span = maxTs - minTs || 1;

  const points: ChartPoint[] = ordered.map((row, i) => {
    const ts = Number(row.blockTimestamp ?? 0);
    const x = ts > 0 ? ((ts - minTs) / span) * plotW : (i / Math.max(ordered.length - 1, 1)) * plotW;
    const apr = estAprPercent(BigInt(row.rate), aprTvl);
    return { x, apr, row };
  });

  if (points.length === 1) {
    points.push({ ...points[0], x: plotW });
    return { points, fromFallback: true, usesReferenceTvl };
  }

  return { points, fromFallback: false, usesReferenceTvl };
}

/** Y 轴留白，避免单点 / 平坦曲线贴在底部或刻度重叠。 */
function chartYDomain(dataMin: number, dataMax: number): { lo: number; hi: number } {
  if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) return { lo: 0, hi: 10 };
  if (dataMin === dataMax) {
    if (dataMax <= 0) return { lo: 0, hi: 10 };
    const pad = Math.max(dataMax * 0.15, 2);
    return { lo: Math.max(0, dataMax - pad), hi: dataMax + pad * 0.35 };
  }
  const pad = Math.max((dataMax - dataMin) * 0.12, 1);
  return { lo: Math.max(0, dataMin - pad), hi: dataMax + pad };
}

function sparkPaths(points: ChartPoint[], min: number, max: number, h: number): { line: string; area: string } {
  if (points.length < 2) return { line: "", area: "" };
  const span = max - min || 1;
  const toY = (apr: number) => h - ((apr - min) / span) * h;

  let line = `M ${points[0].x.toFixed(2)} ${toY(points[0].apr).toFixed(2)}`;
  for (let i = 1; i < points.length; i += 1) {
    line += ` L ${points[i].x.toFixed(2)} ${toY(points[i].apr).toFixed(2)}`;
  }
  const area = `${line} L ${points[points.length - 1].x.toFixed(2)} ${h} L ${points[0].x.toFixed(2)} ${h} Z`;
  return { line, area };
}

function nearestPoint(points: ChartPoint[], x: number): ChartPoint | null {
  if (!points.length) return null;
  let best = points[0];
  let bestDist = Math.abs(points[0].x - x);
  for (const p of points) {
    const d = Math.abs(p.x - x);
    if (d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

function formatYAxisTick(value: number): string {
  const n = safeNumber(value);
  if (n >= 100) return `${n.toFixed(0)}%`;
  if (n >= 10) return `${n.toFixed(1)}%`;
  return `${n.toFixed(2)}%`;
}

function yAxisTicks(lo: number, hi: number): number[] {
  const span = hi - lo || 1;
  const step = span / 2;
  return [hi, lo + step, lo];
}

/** APR 历史图表：单池 / 双池对比、Y 轴、悬停 tooltip */
export function AprHistoryChart({ entries, tvlA, tvlB, currentAprA, currentAprB, loading, error }: Props) {
  const chainId = useChainId();
  const { t } = useI18n();
  const svgRef = useRef<SVGSVGElement>(null);

  const [pool, setPool] = useState<PoolId>("A");
  const [range, setRange] = useState<RangeId>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [hoverX, setHoverX] = useState<number | null>(null);

  const ranges = useMemo(
    () =>
      [
        { id: "7d" as const, label: t("chart.range7d"), sec: 7 * 86400 },
        { id: "30d" as const, label: t("chart.range30d"), sec: 30 * 86400 },
        { id: "90d" as const, label: t("chart.range90d"), sec: 90 * 86400 },
        { id: "all" as const, label: t("chart.rangeAll"), sec: null },
      ] as const,
    [t],
  );

  const rangeSec = ranges.find((r) => r.id === range)?.sec ?? null;
  const compare = viewMode === "compare";

  const seriesA = useMemo(() => {
    const rows = entries.filter((e) => e.pool === 0);
    return buildSeries(rows, tvlA, rangeSec, currentAprA, PLOT_W);
  }, [entries, tvlA, rangeSec, currentAprA]);

  const seriesB = useMemo(() => {
    const rows = entries.filter((e) => e.pool === 1);
    return buildSeries(rows, tvlB, rangeSec, currentAprB, PLOT_W);
  }, [entries, tvlB, rangeSec, currentAprB]);

  const activeSeries = pool === "A" ? seriesA : seriesB;
  const displayPoints = compare
    ? [...seriesA.points, ...seriesB.points]
    : activeSeries.points;

  const dataMin = displayPoints.length ? Math.min(...displayPoints.map((p) => p.apr)) : null;
  const dataMax = displayPoints.length ? Math.max(...displayPoints.map((p) => p.apr)) : null;
  const yDomain =
    dataMin !== null && dataMax !== null ? chartYDomain(dataMin, dataMax) : { lo: 0, hi: 10 };
  const yMin = yDomain.lo;
  const yMax = yDomain.hi;
  const statsMin = dataMin;
  const statsMax = dataMax;

  const pathsA = useMemo(
    () => (displayPoints.length ? sparkPaths(seriesA.points, yMin, yMax, PLOT_H) : { line: "", area: "" }),
    [seriesA.points, yMin, yMax, displayPoints.length],
  );
  const pathsB = useMemo(
    () => (displayPoints.length ? sparkPaths(seriesB.points, yMin, yMax, PLOT_H) : { line: "", area: "" }),
    [seriesB.points, yMin, yMax, displayPoints.length],
  );
  const pathsSingle = pool === "A" ? pathsA : pathsB;

  const pickX = useCallback((clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = 0;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const { x } = pt.matrixTransform(ctm.inverse());
    setHoverX(Math.max(0, Math.min(PLOT_W, x - PAD_LEFT)));
  }, []);

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse" && e.buttons === 0) pickX(e.clientX);
    else if (e.pointerType !== "mouse") pickX(e.clientX);
  };

  const hoverA = hoverX !== null ? nearestPoint(seriesA.points, hoverX) : null;
  const hoverB = hoverX !== null ? nearestPoint(seriesB.points, hoverX) : null;
  const hoverSingle = hoverX !== null ? nearestPoint(activeSeries.points, hoverX) : null;

  const toPlotY = (apr: number) => PAD_TOP + PLOT_H - ((apr - yMin) / (yMax - yMin || 1)) * PLOT_H;
  const toPlotYInner = (apr: number) => PLOT_H - ((apr - yMin) / (yMax - yMin || 1)) * PLOT_H;

  const currentApr = pool === "A" ? currentAprA : currentAprB;
  const usesReferenceTvl = compare
    ? seriesA.usesReferenceTvl || seriesB.usesReferenceTvl
    : activeSeries.usesReferenceTvl;
  const notifyCount = compare
    ? new Set([...seriesA.points, ...seriesB.points].map((p) => p.row.transactionHash)).size
    : activeSeries.points.length;

  const hasChart = seriesA.points.length >= 2 || seriesB.points.length >= 2;

  return (
    <div className="dp-card flex flex-col p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">{t("chart.title")}</h2>
          <p className="mt-1 text-xs text-zinc-500">{t("chart.subtitle")}</p>
        </div>
        <div className="flex max-w-full flex-wrap gap-2 overflow-x-auto pb-0.5">
          <div className="flex rounded-xl border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] p-1">
            {(["single", "compare"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={clsx(
                  "min-h-[32px] rounded-lg px-2.5 text-xs font-medium sm:px-3",
                  viewMode === mode ? "bg-zinc-700 text-zinc-100" : "text-zinc-500",
                )}
              >
                {t(mode === "single" ? "chart.single" : "chart.compare")}
              </button>
            ))}
          </div>
          {!compare ? (
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
                  {t(p === "A" ? "chart.flexible" : "chart.locked")}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex rounded-xl border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] p-1">
            {ranges.map((r) => (
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

      {compare ? (
        <div className="mt-3 flex flex-wrap gap-4 text-xs">
          <span className="inline-flex items-center gap-2 text-zinc-400">
            <span className="size-2.5 rounded-full bg-[#00a3ff]" aria-hidden />
            {t("chart.legendFlexible")} · {safeNumber(currentAprA).toFixed(2)}%
          </span>
          <span className="inline-flex items-center gap-2 text-zinc-400">
            <span className="size-2.5 rounded-full bg-[#a78bfa]" aria-hidden />
            {t("chart.legendLocked")} · {safeNumber(currentAprB).toFixed(2)}%
          </span>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        <div className="min-w-0 rounded-xl border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] px-2 py-3 sm:px-3">
          <div className="text-[11px] leading-tight text-zinc-500 sm:text-xs">{t("chart.current")}</div>
          <div className="mt-1 text-lg font-bold text-[var(--dp-accent)] sm:text-xl">
            {loading ? "…" : `${safeNumber(compare ? Math.max(currentAprA, currentAprB) : currentApr).toFixed(2)}%`}
          </div>
        </div>
        <div className="min-w-0 rounded-xl border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] px-2 py-3 sm:px-3">
          <div className="text-[11px] leading-tight text-zinc-500 sm:text-xs">
            {usesReferenceTvl && !compare ? t("chart.minEstimated") : t("chart.min")}
          </div>
          <div className="mt-1 text-lg font-bold text-zinc-100 sm:text-xl">
            {statsMin === null ? "—" : `${safeNumber(statsMin).toFixed(2)}%`}
          </div>
        </div>
        <div className="min-w-0 rounded-xl border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] px-2 py-3 sm:px-3">
          <div className="text-[11px] leading-tight text-zinc-500 sm:text-xs">
            {usesReferenceTvl && !compare ? t("chart.maxEstimated") : t("chart.max")}
          </div>
          <div className="mt-1 text-lg font-bold text-zinc-100 sm:text-xl">
            {statsMax === null ? "—" : `${safeNumber(statsMax).toFixed(2)}%`}
          </div>
        </div>
      </div>

      <div className="relative mt-4 rounded-xl border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] p-3 pr-2 pl-2 sm:pl-3">
        {loading ? (
          <div className="h-44 sm:h-48">
            <ProductSkeletonRows rows={3} />
          </div>
        ) : !hasChart ? (
          <div className="flex h-44 items-center sm:h-48">
            <ProductStateCard compact title={t("chart.noHistory")} description={t("chart.noHistoryDesc")} />
          </div>
        ) : (
          <>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              className="h-44 w-full touch-none sm:h-48"
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={t("chart.title")}
              onPointerMove={onPointerMove}
              onPointerLeave={() => setHoverX(null)}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                pickX(e.clientX);
              }}
            >
              <defs>
                <linearGradient id="aprChartFillA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={POOL_COLORS.A.fill} />
                  <stop offset="100%" stopColor="rgba(0,163,255,0)" />
                </linearGradient>
                <linearGradient id="aprChartFillB" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={POOL_COLORS.B.fill} />
                  <stop offset="100%" stopColor="rgba(167,139,250,0)" />
                </linearGradient>
              </defs>

              {displayPoints.length
                ? yAxisTicks(yMin, yMax).map((tick, idx) => {
                    const y = toPlotY(tick);
                    return (
                      <g key={`${tick}-${idx}`}>
                        <line
                          x1={PAD_LEFT}
                          y1={y}
                          x2={VIEW_W - PAD_RIGHT}
                          y2={y}
                          stroke="rgba(255,255,255,0.06)"
                          strokeDasharray="3 4"
                        />
                        <text
                          x={PAD_LEFT - 8}
                          y={y}
                          textAnchor="end"
                          dominantBaseline="middle"
                          fill="rgba(161,161,170,0.85)"
                          fontSize="10"
                        >
                          {formatYAxisTick(tick)}
                        </text>
                      </g>
                    );
                  })
                : null}

              <g transform={`translate(${PAD_LEFT}, ${PAD_TOP})`}>
                {compare ? (
                  <>
                    {pathsA.area ? <path d={pathsA.area} fill="url(#aprChartFillA)" /> : null}
                    {pathsB.area ? <path d={pathsB.area} fill="url(#aprChartFillB)" opacity={0.65} /> : null}
                    {pathsA.line ? <path d={pathsA.line} fill="none" stroke={POOL_COLORS.A.stroke} strokeWidth="2.5" /> : null}
                    {pathsB.line ? <path d={pathsB.line} fill="none" stroke={POOL_COLORS.B.stroke} strokeWidth="2.5" /> : null}
                  </>
                ) : (
                  <>
                    {pathsSingle.area ? (
                      <path d={pathsSingle.area} fill={pool === "A" ? "url(#aprChartFillA)" : "url(#aprChartFillB)"} />
                    ) : null}
                    {pathsSingle.line ? (
                      <path
                        d={pathsSingle.line}
                        fill="none"
                        stroke={pool === "A" ? POOL_COLORS.A.stroke : POOL_COLORS.B.stroke}
                        strokeWidth="2.5"
                      />
                    ) : null}
                  </>
                )}

                {hoverX !== null ? (
                  <line x1={hoverX} y1={0} x2={hoverX} y2={PLOT_H} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
                ) : null}

                {compare && hoverA ? (
                  <circle cx={hoverA.x} cy={toPlotYInner(hoverA.apr)} r="4.5" fill={POOL_COLORS.A.dot} stroke="#0d0d0d" strokeWidth="2" />
                ) : null}
                {compare && hoverB ? (
                  <circle cx={hoverB.x} cy={toPlotYInner(hoverB.apr)} r="4.5" fill={POOL_COLORS.B.dot} stroke="#0d0d0d" strokeWidth="2" />
                ) : null}
                {!compare && hoverSingle ? (
                  <circle
                    cx={hoverSingle.x}
                    cy={toPlotYInner(hoverSingle.apr)}
                    r="5"
                    fill={pool === "A" ? POOL_COLORS.A.dot : POOL_COLORS.B.dot}
                    stroke="#0d0d0d"
                    strokeWidth="2"
                  />
                ) : null}
              </g>
            </svg>

            {error ? (
              <div className="mt-2">
                <ProductStateCard compact tone="warning" title={t("chart.indexError")} description={t("chart.indexErrorDesc")} />
              </div>
            ) : usesReferenceTvl ? (
              <p className="mt-2 text-center text-xs text-zinc-500">{t("chart.zeroTvlEstimated")}</p>
            ) : activeSeries.fromFallback && !compare ? (
              <p className="mt-2 text-center text-xs text-zinc-500">{t("chart.fallback")}</p>
            ) : compare && hoverA && hoverB ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {[hoverA, hoverB].map((pt, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-[var(--dp-border)] bg-[var(--dp-surface)] px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2 rounded-full"
                        style={{ background: idx === 0 ? POOL_COLORS.A.dot : POOL_COLORS.B.dot }}
                        aria-hidden
                      />
                      <span className="text-zinc-500">{formatBlockDate(pt.row.blockTimestamp)}</span>
                    </div>
                    <div className="mt-1 text-lg font-bold" style={{ color: idx === 0 ? POOL_COLORS.A.dot : POOL_COLORS.B.dot }}>
                      {safeNumber(pt.apr).toFixed(2)}%
                    </div>
                    <Link
                      href={getTxExplorerUrl(chainId, pt.row.transactionHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-[var(--dp-accent)] hover:underline"
                    >
                      {t("chart.viewTx")}
                    </Link>
                  </div>
                ))}
              </div>
            ) : !compare && hoverSingle ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--dp-border)] bg-[var(--dp-surface)] px-3 py-2 text-xs">
                <div>
                  <span className="text-zinc-500">{formatBlockDate(hoverSingle.row.blockTimestamp)}</span>
                  <span className="ml-2 text-lg font-bold text-[var(--dp-accent)]">{safeNumber(hoverSingle.apr).toFixed(2)}%</span>
                </div>
                <Link
                  href={getTxExplorerUrl(chainId, hoverSingle.row.transactionHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--dp-accent)] hover:underline"
                >
                  {t("chart.viewTx")}
                </Link>
              </div>
            ) : (
              <p className="mt-2 text-center text-xs text-zinc-500">
                {t("chart.hoverHint")} · {t("chart.notifyCount", { count: notifyCount })}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
