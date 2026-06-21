/**
 * Tx Center 全局队列（Zustand + localStorage）。
 * 与 useTransactionFlow / runTransactionPipeline 配合；合约或 chain 变更时由 TxActivityScopeSync 清理。
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { pruneStaleTxs } from "@/lib/txActivityScope";

const STORAGE_KEY = "dualpool-tx-center-v2";
const MAX_TXS = 120;

export type TxCenterStatus = "awaiting_signature" | "pending" | "confirmed" | "failed";

export type TxItem = {
  id: string;
  type: string;
  title: string;
  description?: string;
  status: TxCenterStatus;
  txHash?: string;
  createdAt: number;
  updatedAt: number;
  chainId?: number;
  explorerUrl?: string;
  metadata?: {
    amount?: string;
    token?: string;
    pool?: "A" | "B";
    /** notifyRewardAmount* 的 emission duration（秒），可选 */
    durationSec?: string;
  };
};

type TxStoreState = {
  /** 与 `getTxActivityScopeKey` 一致；换链或换质押合约后清空 txs */
  scopeKey: string;
  txs: TxItem[];
  panelOpen: boolean;
  filterType: "all" | string;
  addTx: (tx: TxItem) => void;
  updateTx: (id: string, updates: Partial<TxItem>) => void;
  removeTx: (id: string) => void;
  clearFinishedTx: () => void;
  clearAllTx: () => void;
  syncActivityScope: (scopeKey: string) => void;
  getPendingTxs: () => TxItem[];
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  setFilterType: (f: "all" | string) => void;
};

export const useTxStore = create<TxStoreState>()(
  persist(
    (set, get) => ({
      scopeKey: "",
      txs: [],
      panelOpen: false,
      filterType: "all",

      addTx: (tx) =>
        set((s) => ({
          txs: [tx, ...s.txs].slice(0, MAX_TXS),
        })),

      updateTx: (id, updates) =>
        set((s) => ({
          txs: s.txs.map((t) => (t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t)),
        })),

      removeTx: (id) =>
        set((s) => ({
          txs: s.txs.filter((t) => t.id !== id),
        })),

      clearFinishedTx: () =>
        set((s) => ({
          txs: s.txs.filter((t) => t.status === "awaiting_signature" || t.status === "pending"),
        })),

      clearAllTx: () => set({ txs: [] }),

      syncActivityScope: (nextScope) => {
        const { scopeKey, txs } = get();
        const safeTxs = Array.isArray(txs) ? txs : [];
        if (!scopeKey || scopeKey !== nextScope) {
          set({ scopeKey: nextScope, txs: [] });
          return;
        }
        const pruned = pruneStaleTxs(safeTxs);
        if (pruned.length !== safeTxs.length) set({ txs: pruned });
      },

      getPendingTxs: () => get().txs.filter((t) => t.status === "awaiting_signature" || t.status === "pending"),

      setPanelOpen: (open) => set({ panelOpen: open }),
      togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
      setFilterType: (f) => set({ filterType: f }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ txs: s.txs, scopeKey: s.scopeKey }),
      version: 2,
      migrate: (persisted) => {
        const p = persisted as Partial<TxStoreState> | undefined;
        return {
          txs: Array.isArray(p?.txs) ? p!.txs : [],
          scopeKey: typeof p?.scopeKey === "string" ? p.scopeKey : "",
        };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!Array.isArray(state.txs)) state.txs = [];
        if (typeof state.scopeKey !== "string") state.scopeKey = "";
      },
    },
  ),
);
