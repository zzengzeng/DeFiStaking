"use client";

import { safeNumber } from "@/lib/format";
import { formatTvlDisplay } from "@/components/product/widgets/ProtocolStats";
import { estAprPercent, estApyDailyCompoundPercent } from "@/lib/poolMetrics";

import { ProductPageTitle } from "@/components/product/ProductPageTitle";

type MetricsProps = {
  tokenSymbol: string;
  rewardToken?: string;
  totalStakedWei: bigint;
  rewardRateWei: bigint;
};

/** 池页指标条 */
export function ProductPoolMetrics({
  tokenSymbol,
  rewardToken = "TokenB",
  totalStakedWei,
  rewardRateWei,
}: MetricsProps) {
  const apr = estAprPercent(rewardRateWei, totalStakedWei);
  const apy = estApyDailyCompoundPercent(apr);

  const metrics = [
    {
      label: "年化 APR",
      value: `${safeNumber(apr).toFixed(2)}%`,
      sub: apy !== null ? `复利约 ${safeNumber(apy).toFixed(2)}%` : undefined,
      highlight: true,
    },
    {
      label: "总锁仓 TVL",
      value: formatTvlDisplay(totalStakedWei, tokenSymbol),
      sub: `质押 ${tokenSymbol}`,
    },
    {
      label: "奖励代币",
      value: rewardToken,
      sub: "收益计价单位",
    },
  ];

  return (
    <div className="dp-card grid grid-cols-1 gap-px overflow-hidden sm:grid-cols-3">
      {metrics.map((m) => (
        <div key={m.label} className="bg-[var(--dp-surface-raised)] px-4 py-4 sm:px-5 sm:py-5">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{m.label}</div>
          <div
            className={`mt-1 text-xl font-bold tracking-tight sm:text-2xl ${m.highlight ? "text-[var(--dp-accent)]" : "text-zinc-50"}`}
          >
            {m.value}
          </div>
          {m.sub ? <div className="mt-0.5 text-xs text-zinc-500">{m.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

type Props = MetricsProps & {
  title: string;
  subtitle: string;
};

/** 池页顶栏：标题 + 横向指标条 */
export function ProductPoolHero({ title, subtitle, ...metrics }: Props) {
  return (
    <header className="space-y-4 sm:space-y-5">
      <ProductPageTitle title={title} subtitle={subtitle} />
      <ProductPoolMetrics {...metrics} />
    </header>
  );
}
