"use client";

import Link from "next/link";
import { useState } from "react";

import { ConfirmActionModal } from "@/components/ConfirmActionModal";
import { formatToken, formatTokenDisplay } from "@/lib/format";

type PoolPosition = {
  label: string;
  amount: string;
};

export type CompoundPreview = {
  rewardAWei: bigint;
  rewardBWei: bigint;
  totalWei: bigint;
};

type Props = {
  stakedLabel?: string;
  stakedWei: bigint;
  rewardsWei: bigint;
  positions?: PoolPosition[];
  onClaim?: () => void;
  claimDisabled?: boolean;
  claimBusy?: boolean;
  compoundPreview?: CompoundPreview;
  onCompound?: () => Promise<void>;
  compoundDisabled?: boolean;
  compoundDisabledReason?: string | null;
  compoundBusy?: boolean;
  manageHref: string;
};

/** 已连接钱包时的仓位摘要卡 */
export function PositionSummary({
  stakedLabel,
  stakedWei,
  rewardsWei,
  positions,
  onClaim,
  claimDisabled,
  claimBusy,
  compoundPreview,
  onCompound,
  compoundDisabled,
  compoundDisabledReason,
  compoundBusy,
  manageHref,
}: Props) {
  const [compoundOpen, setCompoundOpen] = useState(false);
  const hasRewards = rewardsWei > 0n;
  const hasStake = stakedWei > 0n;
  const showCompound = Boolean(onCompound);
  const canCompoundNow = Boolean(compoundPreview && compoundPreview.totalWei > 0n && !compoundDisabled);
  const busy = Boolean(claimBusy || compoundBusy);

  if (!hasStake && !hasRewards && !positions?.length) return null;

  return (
    <div className="dp-card p-5 sm:p-6">
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">我的质押</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="text-xs text-zinc-500">已质押</div>
          {positions && positions.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {positions.map((p) => (
                <li key={p.label} className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="text-xs text-zinc-500">{p.label}</span>
                    <div className="text-lg font-bold text-zinc-50 sm:text-xl">{p.amount}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-1 text-2xl font-bold text-zinc-50">{stakedLabel ?? "—"}</div>
          )}
        </div>
        <div>
          <div className="text-xs text-zinc-500">待领取奖励</div>
          <div className="mt-1 text-2xl font-bold text-[var(--dp-accent)]">
            {formatTokenDisplay(rewardsWei, "TokenB")}
          </div>
          {showCompound ? (
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
              {canCompoundNow ? "可将双池奖励复利再投入锁仓池" : "复利：奖励自动追加到锁仓池本金"}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {onClaim ? (
          <button
            type="button"
            onClick={onClaim}
            disabled={claimDisabled || busy || !hasRewards}
            className="dp-button min-h-[48px] flex-1 rounded-xl text-sm disabled:opacity-40"
          >
            {claimBusy ? "处理中…" : "领取奖励"}
          </button>
        ) : null}
        {showCompound ? (
          <button
            type="button"
            onClick={() => setCompoundOpen(true)}
            disabled={compoundDisabled || busy || !compoundPreview || compoundPreview.totalWei <= 0n}
            className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-violet-500/40 bg-violet-500/10 text-sm font-medium text-violet-200 transition hover:bg-violet-500/20 disabled:opacity-40"
            title={compoundDisabledReason ?? undefined}
          >
            {compoundBusy ? "处理中…" : "复利再投"}
          </button>
        ) : null}
        <Link
          href={manageHref}
          className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-[var(--dp-border)] text-sm font-medium text-zinc-200 transition hover:bg-[var(--dp-surface-raised)]"
        >
          赎回
        </Link>
      </div>

      {showCompound && compoundPreview ? (
        <ConfirmActionModal
          open={compoundOpen}
          title="确认复利再投"
          rows={[
            { label: "灵活池奖励", value: `${formatToken(compoundPreview.rewardAWei)} TokenB` },
            { label: "锁仓池奖励", value: `${formatToken(compoundPreview.rewardBWei)} TokenB` },
            { label: "合计再投", value: `${formatToken(compoundPreview.totalWei)} TokenB` },
          ]}
          warning="奖励将自动再投入锁仓池本金，链上结果可能与估算略有差异。"
          confirmText="确认复利"
          busy={compoundBusy}
          onClose={() => !compoundBusy && setCompoundOpen(false)}
          onConfirm={async () => {
            if (!onCompound) return;
            await onCompound();
            setCompoundOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
