"use client";

import { ProductStateCard } from "@/components/product/ProductStateCard";
import { useI18n } from "@/lib/i18n";

type Props = {
  connected: boolean;
  emptyHint?: string;
};

/** 未连接 / 无仓位时的占位卡 */
export function ProductEmptyPositionCard({ connected, emptyHint }: Props) {
  const { t } = useI18n();
  const hint = emptyHint ?? t("emptyPosition.emptyHint");

  return (
    <div className="dp-card p-5 sm:p-6">
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">{t("emptyPosition.title")}</h2>
      <div className="mt-3">
        <ProductStateCard
          compact
          title={connected ? t("emptyPosition.noPosition") : t("emptyPosition.notConnected")}
          description={connected ? hint : t("emptyPosition.notConnectedDesc")}
        />
      </div>
    </div>
  );
}
