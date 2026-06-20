"use client";

import { useState } from "react";
import { useAccount } from "wagmi";

import { ConfirmActionModal } from "@/components/ConfirmActionModal";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import type { CompoundPreview } from "@/components/product/widgets/PositionSummary";
import { formatToken, formatTokenDisplay } from "@/lib/format";

type Props = {
  preview: CompoundPreview;
  disabled?: boolean;
  disabledReason?: string | null;
  busy?: boolean;
  onCompound: () => Promise<void>;
  /** 嵌入操作卡内时去掉外层卡片 */
  embedded?: boolean;
};

/**
 * 用户向复利卡片：说明 + 双池奖励拆解 + 确认再投。
 * 锁仓池核心能力，与质押/赎回同级展示。
 */
export function CompoundWidget({ preview, disabled, disabledReason, busy, onCompound, embedded = false }: Props) {
  const { isConnected } = useAccount();
  const [open, setOpen] = useState(false);
  const hasRewards = preview.totalWei > 0n;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-zinc-100">复利再投</h3>
          <p className="mt-1 text-sm leading-relaxed text-zinc-500">
            不领取到钱包，将<strong className="font-medium text-zinc-300">灵活池 + 锁仓池</strong>的 TokenB 奖励直接追加到
            <strong className="font-medium text-violet-300">锁仓池本金</strong>，适合长期持有。
          </p>
        </div>
        <span className="shrink-0 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-violet-200">
          锁仓池
        </span>
      </div>

      <div className="mt-4 space-y-2 rounded-xl border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] p-4 text-sm">
        <div className="flex justify-between text-zinc-400">
          <span>灵活池待领</span>
          <span className="font-mono text-zinc-200">{formatToken(preview.rewardAWei, 18, 4)} TokenB</span>
        </div>
        <div className="flex justify-between text-zinc-400">
          <span>锁仓池待领</span>
          <span className="font-mono text-zinc-200">{formatToken(preview.rewardBWei, 18, 4)} TokenB</span>
        </div>
        <div className="flex justify-between border-t border-[var(--dp-border)] pt-2 font-medium">
          <span className="text-zinc-300">合计可复利</span>
          <span className="text-[var(--dp-accent)]">
            {hasRewards
              ? formatTokenDisplay(preview.totalWei, "TokenB")
              : "0 TokenB"}
          </span>
        </div>
      </div>

      {!isConnected ? (
        <div className="mt-5">
          <ConnectWalletButton className="dp-button min-h-[52px] w-full rounded-xl text-base">
            连接钱包以复利
          </ConnectWalletButton>
        </div>
      ) : (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={disabled || busy}
            className="min-h-[52px] w-full rounded-xl border border-violet-500/50 bg-violet-500/15 text-base font-semibold text-violet-100 transition hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "处理中…" : hasRewards ? "复利再投" : "暂无可复利奖励"}
          </button>
          {disabledReason ? (
            <p className="mt-2 text-center text-xs leading-relaxed text-zinc-500">{disabledReason}</p>
          ) : hasRewards ? (
            <p className="mt-2 text-center text-xs text-zinc-600">复利后奖励计入锁仓本金，并刷新锁仓计时规则。</p>
          ) : null}
        </div>
      )}

      <ConfirmActionModal
        open={open}
        title="确认复利再投"
        rows={[
          { label: "灵活池奖励", value: `${formatToken(preview.rewardAWei)} TokenB` },
          { label: "锁仓池奖励", value: `${formatToken(preview.rewardBWei)} TokenB` },
          { label: "合计再投", value: `${formatToken(preview.totalWei)} TokenB` },
        ]}
        warning="奖励将自动再投入锁仓池本金，链上结果可能与估算略有差异。"
        confirmText="确认复利"
        busy={busy}
        onClose={() => !busy && setOpen(false)}
        onConfirm={async () => {
          await onCompound();
          setOpen(false);
        }}
      />
    </>
  );

  if (embedded) return body;
  return <div className="dp-card p-5 sm:p-6">{body}</div>;
}
