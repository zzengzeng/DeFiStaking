"use client";

import { OperatorNotifyPanel } from "@/components/OperatorNotifyPanel";
import { OperatorNotifyRewardHistory } from "@/components/OperatorNotifyRewardHistory";
import { useI18n } from "@/lib/i18n";

type Props = {
  onRefresh: () => Promise<void>;
};

/** 治理页运营区：A/B 双池奖励注入（0h，OPERATOR_ROLE，不经 Timelock）。 */
export function OperatorNotifyRewardsSection({ onRefresh }: Props) {
  const { t } = useI18n();

  return (
    <div className="space-y-3 border-t border-amber-500/20 pt-3">
      <div>
        <h5 className="text-sm font-semibold text-amber-100/95">{t("governance.notifyTitle")}</h5>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
          {t("governance.notifyDescPrefix")}
          <strong className="font-medium text-zinc-400">{t("governance.notifyDescMust")}</strong>
          {t("governance.notifyDescRest")}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <OperatorNotifyPanel pool="A" invalidate={onRefresh} hideEmergency compact />
        <OperatorNotifyPanel pool="B" invalidate={onRefresh} hideEmergency compact />
      </div>
      <OperatorNotifyRewardHistory />
    </div>
  );
}
