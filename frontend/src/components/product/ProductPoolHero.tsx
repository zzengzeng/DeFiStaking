"use client";

import { safeNumber } from "@/lib/format";
import { formatTvlDisplay } from "@/components/product/widgets/ProtocolStats";
import { estAprPercent, estApyDailyCompoundPercent } from "@/lib/poolMetrics";
import { useI18n } from "@/lib/i18n";

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
  const { t } = useI18n();
  const apr = estAprPercent(rewardRateWei, totalStakedWei);
  const apy = estApyDailyCompoundPercent(apr);

  const metrics = [
    {
      label: t("poolMetrics.apr"),
      value: `${safeNumber(apr).toFixed(2)}%`,
      sub: apy !== null ? t("poolMetrics.apyCompound", { apy: safeNumber(apy).toFixed(2) }) : undefined,
      highlight: true,
    },
    {
      label: t("poolMetrics.tvl"),
      value: formatTvlDisplay(totalStakedWei, tokenSymbol),
      sub: t("poolMetrics.stakeToken", { token: tokenSymbol }),
    },
    {
      label: t("poolMetrics.rewardToken"),
      value: rewardToken,
      sub: t("poolMetrics.rewardUnit"),
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
