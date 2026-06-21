"use client";

import { useState } from "react";
import { useAccount } from "wagmi";

import { ConfirmActionModal } from "@/components/ConfirmActionModal";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import type { CompoundPreview } from "@/components/product/widgets/PositionSummary";
import { formatToken, formatTokenDisplay } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

type Props = {
  preview: CompoundPreview;
  disabled?: boolean;
  disabledReason?: string | null;
  busy?: boolean;
  onCompound: () => Promise<void>;
  /** 嵌入操作卡内时去掉外层卡片 */
  embedded?: boolean;
};

/** 用户向复利卡片：说明 + 双池奖励拆解 + 确认再投。 */
export function CompoundWidget({ preview, disabled, disabledReason, busy, onCompound, embedded = false }: Props) {
  const { isConnected } = useAccount();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const hasRewards = preview.totalWei > 0n;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-zinc-100">{t("compound.title")}</h3>
          <p className="mt-1 text-sm leading-relaxed text-zinc-500">{t("compound.desc")}</p>
        </div>
        <span className="shrink-0 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-violet-200">
          {t("compound.lockedPool")}
        </span>
      </div>

      <div className="mt-4 space-y-2 rounded-xl border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] p-4 text-sm">
        <div className="flex justify-between text-zinc-400">
          <span>{t("compound.flexiblePending")}</span>
          <span className="font-mono text-zinc-200">{formatToken(preview.rewardAWei, 18, 4)} TokenB</span>
        </div>
        <div className="flex justify-between text-zinc-400">
          <span>{t("compound.lockedPending")}</span>
          <span className="font-mono text-zinc-200">{formatToken(preview.rewardBWei, 18, 4)} TokenB</span>
        </div>
        <div className="flex justify-between border-t border-[var(--dp-border)] pt-2 font-medium">
          <span className="text-zinc-300">{t("compound.totalAvailable")}</span>
          <span className="text-[var(--dp-accent)]">
            {hasRewards ? formatTokenDisplay(preview.totalWei, "TokenB") : "0 TokenB"}
          </span>
        </div>
      </div>

      {!isConnected ? (
        <div className="mt-5">
          <ConnectWalletButton className="dp-button min-h-[52px] w-full rounded-xl text-base">
            {t("compound.connect")}
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
            {busy ? t("common.busy") : hasRewards ? t("compound.title") : t("compound.noRewards")}
          </button>
          {disabledReason ? (
            <p className="mt-2 text-center text-xs leading-relaxed text-zinc-500">{disabledReason}</p>
          ) : hasRewards ? (
            <p className="mt-2 text-center text-xs text-zinc-600">{t("compound.afterFootnote")}</p>
          ) : null}
        </div>
      )}

      <ConfirmActionModal
        open={open}
        title={t("position.confirmCompound")}
        rows={[
          { label: t("position.flexibleReward"), value: `${formatToken(preview.rewardAWei)} TokenB` },
          { label: t("position.lockedReward"), value: `${formatToken(preview.rewardBWei)} TokenB` },
          { label: t("position.totalCompound"), value: `${formatToken(preview.totalWei)} TokenB` },
        ]}
        warning={t("position.compoundWarning")}
        confirmText={t("position.confirmCompoundBtn")}
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
