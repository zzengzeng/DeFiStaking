"use client";

import { useStaking } from "@/hooks/useStaking";
import { useI18n } from "@/lib/i18n";
import { canPermissionlessCrank } from "@/lib/poolCatchUp";

/** 全局计息未追平时提示：赎回/领取前会自动或需先 crank（M-2）。 */
export function CatchUpBanner() {
  const { t } = useI18n();
  const staking = useStaking();

  const catchUpIncomplete = !staking.poolACatchUpComplete || !staking.poolBCatchUpComplete;
  const paused = staking.status === "PAUSED";
  const shutdown = staking.status === "SHUTDOWN";

  if (!catchUpIncomplete) return null;
  if (!canPermissionlessCrank(paused, shutdown)) return null;

  return (
    <div className="sticky top-0 z-40 mb-4">
      <div className="flex flex-col gap-2 rounded-2xl border border-sky-500/30 bg-gradient-to-r from-sky-500/15 to-cyan-500/10 px-3 py-3 text-sm text-sky-100 backdrop-blur sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-4">
        <div className="shrink-0 font-semibold">{t("statusBanner.catchUpTitle")}</div>
        <div className="min-w-0 break-words text-xs leading-relaxed text-sky-200/90 sm:text-right">
          {t("statusBanner.catchUpDesc")}
        </div>
      </div>
    </div>
  );
}
