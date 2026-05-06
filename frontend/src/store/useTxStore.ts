import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const STORAGE_KEY = "dualpool-tx-center-v1";
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
  txs: TxItem[];
  panelOpen: boolean;
  filterType: "all" | string;
  addTx: (tx: TxItem) => void;
  updateTx: (id: string, updates: Partial<TxItem>) => void;
  removeTx: (id: string) => void;
  clearFinishedTx: () => void;
  getPendingTxs: () => TxItem[];
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  setFilterType: (f: "all" | string) => void;
};

export const useTxStore = create<TxStoreState>()(
  persist(
    (set, get) => ({
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

      getPendingTxs: () => get().txs.filter((t) => t.status === "awaiting_signature" || t.status === "pending"),

      setPanelOpen: (open) => set({ panelOpen: open }),
      togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
      setFilterType: (f) => set({ filterType: f }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ txs: s.txs }),
    },
  ),
);
