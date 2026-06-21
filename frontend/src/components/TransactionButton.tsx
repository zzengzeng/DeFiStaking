"use client";

import clsx from "clsx";

import { useI18n } from "@/lib/i18n";
import type { TxState } from "@/lib/txFlowTypes";
import { transactionButtonLabel } from "@/lib/txFlowTypes";

type Props = {
  /** 当前状态机状态（可与 `needsApproval` 组合显示 Approve） */
  flowState: TxState;
  needsApproval?: boolean;
  idlePrimary?: "stake" | "submit" | "confirm";
  /** product：品牌蓝；console：琥珀（与控制台主色一致） */
  accent?: "product" | "console";
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  type?: "button" | "submit";
  children?: React.ReactNode;
};

export function TransactionButton({
  flowState,
  needsApproval = false,
  idlePrimary = "submit",
  accent = "product",
  disabled,
  onClick,
  className,
  type = "button",
  children,
}: Props) {
  const { t } = useI18n();
  const label = children ?? transactionButtonLabel(flowState, t, { needsApproval, idlePrimary });
  const showSpinner =
    flowState === "approving" ||
    flowState === "approval_pending" ||
    flowState === "awaiting_signature" ||
    flowState === "submitting" ||
    flowState === "pending";

  const idleClass =
    accent === "console"
      ? "bg-amber-400 text-black hover:bg-amber-300"
      : "bg-[var(--dp-accent)] text-black hover:bg-[var(--dp-accent-hover)]";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || showSpinner}
      className={clsx(
        "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
        !className?.includes("dp-button") && flowState === "failed" && "bg-red-500/90 text-white",
        !className?.includes("dp-button") && flowState === "confirmed" && "bg-[var(--dp-accent-hover)] text-black",
        !className?.includes("dp-button") && flowState !== "failed" && flowState !== "confirmed" && idleClass,
        className,
      )}
    >
      {showSpinner ? (
        <span
          className="inline-block size-4 animate-spin rounded-full border-2 border-black/30 border-t-black"
          aria-hidden
        />
      ) : null}
      <span>{label}</span>
    </button>
  );
}
