"use client";

import { useState } from "react";

import { usePoolCatchUpEnsurer } from "@/hooks/usePoolCatchUpEnsurer";
import { useStaking } from "@/hooks/useStaking";
import { useI18n } from "@/lib/i18n";
import { CATCH_UP_BOTH, canPermissionlessCrank } from "@/lib/poolCatchUp";

/** 全局计息未追平时提示：可先手动同步，避免领取/复利时突然弹出多笔追账。 */
export function CatchUpBanner() {
  const { t } = useI18n();
  const staking = useStaking();
  const { ensureCatchUp } = usePoolCatchUpEnsurer();
  const [syncing, setSyncing] = useState(false);

  const catchUpIncomplete = !staking.poolACatchUpComplete || !staking.poolBCatchUpComplete;
  const paused = staking.status === "PAUSED";
  const shutdown = staking.status === "SHUTDOWN";

  if (!catchUpIncomplete) return null;
  if (!canPermissionlessCrank(paused, shutdown)) return null;

  const onSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await ensureCatchUp(CATCH_UP_BOTH);
    } catch {
      /* Tx Center / toast */
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="sticky top-0 z-40 mb-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-sky-500/30 bg-gradient-to-r from-sky-500/15 to-cyan-500/10 px-3 py-3 text-sm text-sky-100 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4">
        <div className="min-w-0">
          <div className="font-semibold">{t("statusBanner.catchUpTitle")}</div>
          <div className="mt-1 text-xs leading-relaxed text-sky-200/90">{t("statusBanner.catchUpDesc")}</div>
        </div>
        <button
          type="button"
          onClick={() => void onSync()}
          disabled={syncing}
          className="shrink-0 rounded-xl border border-sky-400/40 bg-sky-500/20 px-4 py-2 text-sm font-semibold text-sky-50 transition hover:bg-sky-500/30 disabled:opacity-50"
        >
          {syncing ? t("statusBanner.catchUpSyncing") : t("statusBanner.catchUpAction")}
        </button>
      </div>
    </div>
  );
}
