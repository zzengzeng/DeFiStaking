"use client";

import { OperatorNotifyPanel } from "@/components/OperatorNotifyPanel";
import { OperatorNotifyRewardHistory } from "@/components/OperatorNotifyRewardHistory";

type Props = {
  onRefresh: () => Promise<void>;
};

/** 治理页运营区：A/B 双池奖励注入（0h，OPERATOR_ROLE，不经 Timelock）。 */
export function OperatorNotifyRewardsSection({ onRefresh }: Props) {
  return (
    <div className="space-y-3 border-t border-amber-500/20 pt-3">
      <div>
        <h5 className="text-sm font-semibold text-amber-100/95">注入奖励（notifyRewardAmountA / B）</h5>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
          部署后<strong className="font-medium text-zinc-400">必做</strong>：向池子预算注入 TokenB。需钱包持有{" "}
          <span className="font-mono text-zinc-400">OPERATOR_ROLE</span>，先{" "}
          <span className="font-mono text-zinc-300">mint</span> 足够 TokenB 再 approve → notify。不经 Timelock（0h 生效）。
          Pool A/B 页面仍保留相同入口，便于按池操作。
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
