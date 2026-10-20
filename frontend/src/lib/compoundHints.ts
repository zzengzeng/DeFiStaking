import type { CompoundPreview } from "@/components/product/widgets/PositionSummary";
import type { TranslateFn } from "@/lib/i18n";
import { formatCountdownHms } from "@/lib/timelockCountdown";

type CompoundContext = {
  compoundPreview: CompoundPreview;
  status: string;
  globalBadDebt: bigint;
  claimCooldownRemainingSec: bigint;
  canCompound: boolean;
};

/** 用户可读的复利不可用原因（产品端展示）。 */
export function getCompoundDisabledReason(ctx: CompoundContext, t: TranslateFn): string | null {
  if (ctx.canCompound) return null;
  if (ctx.compoundPreview.totalWei <= 0n) {
    return t("compound.noRewardsReason");
  }
  if (ctx.status !== "NORMAL") return t("compound.abnormalStatus");
  if (ctx.globalBadDebt > 0n) return t("compound.badDebt");
  if (ctx.claimCooldownRemainingSec > 0n) {
    return t("compound.cooldown", {
      countdown: formatCountdownHms(Number(ctx.claimCooldownRemainingSec)),
    });
  }
  return t("compound.unavailable");
}
