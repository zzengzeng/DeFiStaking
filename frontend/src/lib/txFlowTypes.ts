import type { Hash } from "viem";

import type { TranslateFn } from "@/lib/i18n";

/** 全应用统一的链上写交易状态（质押 / 提现 / 治理共用） */
export type TxState =
  | "idle"
  | "needs_approval"
  | "approving"
  | "approval_pending"
  | "approval_confirmed"
  | "awaiting_signature"
  | "submitting"
  | "pending"
  | "confirmed"
  | "failed";

/** @deprecated 使用 TxState */
export type DeFiTxState = TxState;

export function isTerminalTxState(s: TxState): boolean {
  return s === "confirmed" || s === "failed";
}

/** 进行中：应禁用主操作、显示进度 */
export function isTxBusy(s: TxState): boolean {
  return (
    s === "approving" ||
    s === "approval_pending" ||
    s === "approval_confirmed" ||
    s === "awaiting_signature" ||
    s === "submitting" ||
    s === "pending"
  );
}

/** Modal / 文案：人类可读状态说明 */
export function txStateMessage(state: TxState, t: TranslateFn): string {
  switch (state) {
    case "idle":
      return t("txState.idle");
    case "needs_approval":
      return t("txState.needsApproval");
    case "approving":
      return t("txState.approving");
    case "approval_pending":
      return t("txState.approvalPending");
    case "approval_confirmed":
      return t("txState.approvalConfirmed");
    case "awaiting_signature":
      return t("txState.awaitingSignature");
    case "submitting":
      return t("txState.submitting");
    case "pending":
      return t("txState.pending");
    case "confirmed":
      return t("txState.confirmed");
    case "failed":
      return t("txState.failed");
    default:
      return state;
  }
}

type IdlePrimaryKey = "stake" | "submit" | "confirm";

/**
 * 主按钮文案（与产品规范一致）
 * - `idle` 且链上 allowance 不足时，UI 层可映射为 `needs_approval` 传入本函数
 */
export function transactionButtonLabel(
  state: TxState,
  t: TranslateFn,
  ctx: { needsApproval: boolean; idlePrimary?: IdlePrimaryKey },
): string {
  switch (state) {
    case "needs_approval":
      return t("txButton.approve");
    case "approving":
      return t("txButton.approving");
    case "approval_pending":
      return t("txButton.approvalPending");
    case "approval_confirmed":
      return t("txButton.approved");
    case "awaiting_signature":
      return t("txButton.awaitingSignature");
    case "submitting":
      return t("txButton.submitting");
    case "pending":
      return t("txButton.pending");
    case "confirmed":
      return t("txButton.confirmed");
    case "failed":
      return t("txButton.failed");
    case "idle":
    default:
      return ctx.needsApproval ? t("txButton.approve") : t(`txButton.${ctx.idlePrimary ?? "submit"}`);
  }
}

/** @deprecated 使用 isTxBusy */
export function isInFlightTxState(s: TxState): boolean {
  return isTxBusy(s);
}

export type TxSessionSnapshot = {
  id: string;
  actionLabel: string;
  state: TxState;
  hash?: Hash;
  error?: string;
};
