"use client";

import clsx from "clsx";

import { ProductStateCard } from "@/components/product/ProductStateCard";
import { TxItemCard } from "@/components/TxItemCard";
import { isStalePendingTx } from "@/lib/txActivityScope";
import { useTxStore } from "@/store/useTxStore";

const FILTER_OPTIONS: { id: "all" | string; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "stake", label: "质押" },
  { id: "approve", label: "授权" },
  { id: "withdraw", label: "赎回" },
  { id: "claim", label: "领取" },
  { id: "compound", label: "复利" },
  { id: "emergency", label: "紧急" },
  { id: "governance", label: "治理" },
];

export function TxCenterHeaderButton() {
  const txs = useTxStore((s) => s.txs) ?? [];
  const togglePanel = useTxStore((s) => s.togglePanel);
  const pendingCount = txs.filter((t) => t.status === "awaiting_signature" || t.status === "pending").length;

  return (
    <button
      type="button"
      onClick={() => togglePanel()}
      className="relative flex size-10 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
      aria-label="交易中心"
      title="交易中心"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path strokeLinecap="round" d="M5 6h14M5 12h14M5 18h10" />
        <path strokeLinecap="round" d="M17 16l2 2 4-4" className="opacity-40" />
      </svg>
      {pendingCount > 0 ? (
        <span className="absolute -right-1 -top-1 flex min-w-[1.125rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-black">
          {pendingCount > 9 ? "9+" : pendingCount}
        </span>
      ) : null}
    </button>
  );
}

export function TxCenterPanel() {
  const panelOpen = useTxStore((s) => s.panelOpen);
  const setPanelOpen = useTxStore((s) => s.setPanelOpen);
  const txs = useTxStore((s) => s.txs) ?? [];
  const filterType = useTxStore((s) => s.filterType);
  const setFilterType = useTxStore((s) => s.setFilterType);
  const clearFinishedTx = useTxStore((s) => s.clearFinishedTx);
  const clearAllTx = useTxStore((s) => s.clearAllTx);
  const removeTx = useTxStore((s) => s.removeTx);

  const filtered = filterType === "all" ? txs : txs.filter((t) => t.type === filterType);
  const pending = filtered.filter((t) => t.status === "awaiting_signature" || t.status === "pending");
  const done = filtered.filter((t) => t.status === "confirmed" || t.status === "failed");

  if (!panelOpen) return null;

  return (
    <>
      <button type="button" className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-[1px]" aria-label="关闭交易中心" onClick={() => setPanelOpen(false)} />
      <aside className="fixed inset-y-0 right-0 z-[95] flex w-full max-w-[min(100vw,28rem)] flex-col overflow-x-hidden border-l border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">交易中心</h2>
            <p className="text-[11px] text-zinc-500">当前质押合约下的本地交易记录</p>
          </div>
          <button type="button" onClick={() => setPanelOpen(false)} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" aria-label="关闭">
            ✕
          </button>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-zinc-800 px-3 py-2">
          {FILTER_OPTIONS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilterType(f.id as "all" | string)}
              className={clsx(
                "rounded-full px-2.5 py-1 text-[11px] font-medium",
                filterType === f.id ? "bg-zinc-100 text-black" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-end gap-3 border-b border-zinc-800 px-3 py-2">
          <button type="button" onClick={() => clearFinishedTx()} className="text-xs text-zinc-500 hover:text-zinc-300">
            清除已完成
          </button>
          <button type="button" onClick={() => clearAllTx()} className="text-xs text-zinc-500 hover:text-red-300">
            清空全部
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {pending.length > 0 ? (
            <section className="mb-6">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-200/90">进行中</h3>
              <div className="space-y-2">
                {pending.map((tx) => (
                  <TxItemCard key={tx.id} tx={tx} onDismiss={isStalePendingTx(tx) ? removeTx : undefined} />
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">已完成</h3>
            {done.length === 0 ? (
              <ProductStateCard compact title="暂无交易记录" description="提交质押、赎回、领取或治理交易后会显示在这里。" />
            ) : (
              <div className="space-y-2">
                {done.map((tx) => (
                  <TxItemCard key={tx.id} tx={tx} onDismiss={removeTx} />
                ))}
              </div>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
