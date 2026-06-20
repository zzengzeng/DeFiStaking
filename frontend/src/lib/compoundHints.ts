import type { CompoundPreview } from "@/components/product/widgets/PositionSummary";
import { formatCountdownHms } from "@/lib/timelockCountdown";

type CompoundContext = {
  compoundPreview: CompoundPreview;
  status: string;
  globalBadDebt: bigint;
  claimCooldownRemainingSec: bigint;
  canCompound: boolean;
};

/** 用户可读的复利不可用原因（产品端展示）。 */
export function getCompoundDisabledReason(ctx: CompoundContext): string | null {
  if (ctx.canCompound) return null;
  if (ctx.compoundPreview.totalWei <= 0n) {
    return "暂无待领奖励。质押并等待收益累积后，可将双池 TokenB 奖励复利到锁仓池本金。";
  }
  if (ctx.status !== "NORMAL") return "协议非正常状态，暂不可复利再投。";
  if (ctx.globalBadDebt > 0n) return "协议存在坏账，暂不可复利再投。";
  if (ctx.claimCooldownRemainingSec > 0n) {
    return `领取/复利冷却中，${formatCountdownHms(Number(ctx.claimCooldownRemainingSec))} 后可操作。`;
  }
  return "当前不可复利再投。";
}
