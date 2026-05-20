import type { Hash } from "viem";

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
export function txStateMessage(state: TxState): string {
  switch (state) {
    case "idle":
      return "Ready";
    case "needs_approval":
      return "Token approval required before this action.";
    case "approving":
      return "Preparing approval transaction…";
    case "approval_pending":
      return "Approval transaction submitted. Waiting for on-chain confirmation…";
    case "approval_confirmed":
      return "Approval confirmed.";
    case "awaiting_signature":
      return "Confirm the transaction in your wallet.";
    case "submitting":
      return "Submitting to the network…";
    case "pending":
      return "Waiting for on-chain confirmation…";
    case "confirmed":
      return "Transaction confirmed.";
    case "failed":
      return "Transaction failed.";
    default:
      return state;
  }
}

type IdlePrimary = "Stake" | "Approve" | "Submit" | "Confirm";

/**
 * 主按钮文案（与产品规范一致）
 * - `idle` 且链上 allowance 不足时，UI 层可映射为 `needs_approval` 传入本函数
 */
export function transactionButtonLabel(
  state: TxState,
  ctx: { needsApproval: boolean; idlePrimary: IdlePrimary },
): string {
  switch (state) {
    case "needs_approval":
      return "Approve";
    case "approving":
      return "Approving...";
    case "approval_pending":
      return "Approval Pending...";
    case "approval_confirmed":
      return "Approved";
    case "awaiting_signature":
      return "Confirm in Wallet";
    case "submitting":
      return "Submitting...";
    case "pending":
      return "Pending...";
    case "confirmed":
      return "Confirmed";
    case "failed":
      return "Retry";
    case "idle":
    default:
      return ctx.needsApproval ? "Approve" : ctx.idlePrimary;
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
