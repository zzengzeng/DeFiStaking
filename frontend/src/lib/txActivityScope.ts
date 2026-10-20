import { contractAddresses } from "@/contracts/addresses";

import type { TxItem } from "@/store/useTxStore";

/** 超过此时长的 awaiting_signature / pending 视为过期，自动清理。 */
export const STALE_PENDING_MS = 6 * 60 * 60 * 1000;

/** Activity 作用域 = 链 + 当前质押合约（换部署后历史不混用）。 */
export function getTxActivityScopeKey(chainId: number): string {
  return `${chainId}:${contractAddresses.staking.toLowerCase()}`;
}

export function pruneStaleTxs(txs: TxItem[]): TxItem[] {
  const now = Date.now();
  return txs.filter((t) => {
    if (t.status !== "awaiting_signature" && t.status !== "pending") return true;
    return now - t.updatedAt < STALE_PENDING_MS;
  });
}

export function isStalePendingTx(tx: TxItem): boolean {
  if (tx.status !== "awaiting_signature" && tx.status !== "pending") return false;
  return Date.now() - tx.updatedAt >= STALE_PENDING_MS;
}
