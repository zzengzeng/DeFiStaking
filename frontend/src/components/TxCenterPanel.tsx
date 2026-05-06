"use client";

import clsx from "clsx";

import { TxItemCard } from "@/components/TxItemCard";
import { useTxStore } from "@/store/useTxStore";

const FILTER_OPTIONS: { id: "all" | string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "stake", label: "Stake" },
  { id: "approve", label: "Approve" },
  { id: "withdraw", label: "Withdraw" },
  { id: "claim", label: "Claim" },
  { id: "compound", label: "Compound" },
  { id: "emergency", label: "Emergency" },
  { id: "governance", label: "Governance" },
];

export function TxCenterHeaderButton() {
  const txs = useTxStore((s) => s.txs);
  const togglePanel = useTxStore((s) => s.togglePanel);
  const pendingCount = txs.filter((t) => t.status === "awaiting_signature" || t.status === "pending").length;

  return (
    <button
      type="button"
      onClick={() => togglePanel()}
      className="relative flex size-10 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
      aria-label="Transaction center"
      title="Transactions"
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
  const txs = useTxStore((s) => s.txs);
  const filterType = useTxStore((s) => s.filterType);
  const setFilterType = useTxStore((s) => s.setFilterType);
  const clearFinishedTx = useTxStore((s) => s.clearFinishedTx);
  const removeTx = useTxStore((s) => s.removeTx);

  const filtered = filterType === "all" ? txs : txs.filter((t) => t.type === filterType);
  const pending = filtered.filter((t) => t.status === "awaiting_signature" || t.status === "pending");
  const done = filtered.filter((t) => t.status === "confirmed" || t.status === "failed");

  if (!panelOpen) return null;

  return (
    <>
      <button type="button" className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-[1px]" aria-label="Close transaction center" onClick={() => setPanelOpen(false)} />
      <aside className="fixed inset-y-0 right-0 z-[95] flex w-full max-w-md flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Activity</h2>
            <p className="text-[11px] text-zinc-500">Recent on-chain transactions</p>
          </div>
          <button type="button" onClick={() => setPanelOpen(false)} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" aria-label="Close">
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

        <div className="flex items-center justify-end gap-2 border-b border-zinc-800 px-3 py-2">
          <button type="button" onClick={() => clearFinishedTx()} className="text-xs text-zinc-500 hover:text-zinc-300">
            Clear finished
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {pending.length > 0 ? (
            <section className="mb-6">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-200/90">Pending</h3>
              <div className="space-y-2">
                {pending.map((tx) => (
                  <TxItemCard key={tx.id} tx={tx} />
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Completed</h3>
            {done.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-800 py-8 text-center text-sm text-zinc-500">No completed transactions in this filter.</p>
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
