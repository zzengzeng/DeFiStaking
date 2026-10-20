import type { Hash, PublicClient } from "viem";

import { mapContractErrorLocalized } from "@/lib/errors";
import { getTxExplorerUrl } from "@/lib/explorerLink";
import { type TxItem, useTxStore } from "@/store/useTxStore";

export function generateTxId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tx-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export type RunPipelineDeps = {
  publicClient?: PublicClient | null;
  chainId: number;
  onAfterConfirmed?: () => void | Promise<unknown>;
};

/**
 * 更新 store 中的单笔交易：签名 → 已提交 → 确认 / 失败。
 * 由 Tx Center 调用；失败描述经 mapContractErrorLocalized 写入 description。
 */
export async function runTransactionPipeline(id: string, send: () => Promise<Hash>, deps: RunPipelineDeps): Promise<Hash> {
  const updateTx = useTxStore.getState().updateTx;
  const now = () => Date.now();

  updateTx(id, { status: "awaiting_signature", updatedAt: now() });

  try {
    const hash = await send();
    const explorerUrl = getTxExplorerUrl(deps.chainId, hash);
    updateTx(id, {
      status: "pending",
      txHash: hash,
      explorerUrl,
      updatedAt: now(),
    });

    if (deps.publicClient) {
      await deps.publicClient.waitForTransactionReceipt({ hash });
    }

    updateTx(id, { status: "confirmed", updatedAt: now() });
    await Promise.resolve(deps.onAfterConfirmed?.());
    return hash;
  } catch (e) {
    const msg = mapContractErrorLocalized(e);
    updateTx(id, {
      status: "failed",
      description: msg,
      updatedAt: now(),
    });
    throw e;
  }
}

export type NewTxPayload = Omit<TxItem, "id" | "createdAt" | "updatedAt" | "status"> & {
  status?: TxItem["status"];
};

/** 构造新 Tx 条目（未写入 store） */
export function buildTxItem(partial: NewTxPayload & { id?: string }): TxItem {
  const id = partial.id ?? generateTxId();
  const t = Date.now();
  return {
    id,
    type: partial.type,
    title: partial.title,
    description: partial.description,
    status: partial.status ?? "awaiting_signature",
    createdAt: t,
    updatedAt: t,
    chainId: partial.chainId,
    metadata: partial.metadata,
  };
}
