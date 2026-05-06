"use client";

import clsx from "clsx";

import type { TxItem } from "@/store/useTxStore";

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function statusBadge(status: TxItem["status"]) {
  switch (status) {
    case "awaiting_signature":
    case "pending":
      return { label: status === "awaiting_signature" ? "Awaiting signature" : "Pending", className: "bg-amber-500/20 text-amber-200 ring-amber-500/40" };
    case "confirmed":
      return { label: "Confirmed", className: "bg-emerald-500/20 text-emerald-200 ring-emerald-500/40" };
    case "failed":
      return { label: "Failed", className: "bg-red-500/20 text-red-200 ring-red-500/40" };
    default:
      return { label: status, className: "bg-zinc-500/20 text-zinc-300 ring-zinc-500/30" };
  }
}

type Props = {
  tx: TxItem;
  onDismiss?: (id: string) => void;
};

export function TxItemCard({ tx, onDismiss }: Props) {
  const badge = statusBadge(tx.status);
  const meta = tx.metadata;
  const metaLine =
    meta && (meta.amount || meta.token || meta.pool)
      ? [meta.pool && `Pool ${meta.pool}`, meta.amount, meta.token].filter(Boolean).join(" · ")
      : null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-zinc-100">{tx.title}</div>
          <div className="mt-0.5 text-[11px] uppercase tracking-wide text-zinc-500">{tx.type}</div>
          {metaLine ? <div className="mt-1 text-xs text-zinc-400">{metaLine}</div> : null}
          {tx.description ? <div className="mt-1 text-xs text-red-300/90">{tx.description}</div> : null}
        </div>
        <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", badge.className)}>{badge.label}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
        <span>{timeAgo(tx.updatedAt)}</span>
        {tx.explorerUrl ? (
          <a href={tx.explorerUrl} target="_blank" rel="noreferrer noopener" className="text-sky-400 hover:underline">
            Explorer
          </a>
        ) : tx.txHash ? (
          <span className="font-mono text-[10px] text-zinc-600">{tx.txHash.slice(0, 10)}…</span>
        ) : null}
        {onDismiss && (tx.status === "confirmed" || tx.status === "failed") ? (
          <button type="button" onClick={() => onDismiss(tx.id)} className="text-zinc-500 hover:text-zinc-300">
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}
