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
      return "就绪";
    case "needs_approval":
      return "执行此操作前需先授权代币。";
    case "approving":
      return "正在准备授权交易…";
    case "approval_pending":
      return "授权交易已提交，等待链上确认…";
    case "approval_confirmed":
      return "授权已确认。";
    case "awaiting_signature":
      return "请在钱包中确认交易。";
    case "submitting":
      return "正在提交到网络…";
    case "pending":
      return "等待链上确认…";
    case "confirmed":
      return "交易已确认。";
    case "failed":
      return "交易失败。";
    default:
      return state;
  }
}

type IdlePrimary = "Stake" | "Approve" | "Submit" | "Confirm" | "质押" | "授权" | "提交" | "确认";

const IDLE_PRIMARY_ZH: Record<string, string> = {
  Stake: "质押",
  Approve: "授权",
  Submit: "提交",
  Confirm: "确认",
  质押: "质押",
  授权: "授权",
  提交: "提交",
  确认: "确认",
};

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
      return "授权";
    case "approving":
      return "授权中…";
    case "approval_pending":
      return "授权确认中…";
    case "approval_confirmed":
      return "已授权";
    case "awaiting_signature":
      return "请在钱包确认";
    case "submitting":
      return "提交中…";
    case "pending":
      return "确认中…";
    case "confirmed":
      return "已确认";
    case "failed":
      return "重试";
    case "idle":
    default:
      return ctx.needsApproval ? "授权" : IDLE_PRIMARY_ZH[ctx.idlePrimary] ?? ctx.idlePrimary;
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
