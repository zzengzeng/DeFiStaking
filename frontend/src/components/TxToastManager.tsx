"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { useTxStore } from "@/store/useTxStore";

/**
 * 根据 Tx Center store 状态更新 sonner：开始 / 已提交 / 确认 / 失败（与 Activity 面板并行）。
 */
export function TxToastManager() {
  const txs = useTxStore((s) => s.txs);
  const lastStatus = useRef<Record<string, string>>({});

  useEffect(() => {
    for (const tx of txs) {
      const prev = lastStatus.current[tx.id];
      if (prev === tx.status) continue;
      if (prev === undefined && (tx.status === "confirmed" || tx.status === "failed")) {
        lastStatus.current[tx.id] = tx.status;
        continue;
      }
      lastStatus.current[tx.id] = tx.status;
      const tid = `txcenter-${tx.id}`;

      switch (tx.status) {
        case "awaiting_signature":
          toast.loading(tx.title, { id: tid, description: "Confirm in wallet" });
          break;
        case "pending":
          toast.loading("Transaction submitted", {
            id: tid,
            description: tx.explorerUrl ?? (tx.txHash ? `${tx.txHash.slice(0, 12)}…` : undefined),
            action: tx.explorerUrl
              ? {
                  label: "Explorer",
                  onClick: () => window.open(tx.explorerUrl!, "_blank", "noopener,noreferrer"),
                }
              : undefined,
          });
          break;
        case "confirmed":
          toast.success("Transaction confirmed", { id: tid, description: tx.txHash ? `${tx.txHash.slice(0, 10)}…${tx.txHash.slice(-8)}` : undefined });
          break;
        case "failed":
          toast.error(tx.description ?? "Transaction failed", { id: tid });
          break;
        default:
          break;
      }
    }
  }, [txs]);

  return null;
}
