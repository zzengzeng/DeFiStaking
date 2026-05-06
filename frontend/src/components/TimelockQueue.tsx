"use client";

import { useEffect, useMemo, useState } from "react";

import type { TimelockIndexedOp } from "@/hooks/useTimelockOps";
import { formatCountdownHms } from "@/lib/timelockCountdown";

type RowUi = "PENDING" | "READY_TO_EXECUTE" | "EXECUTED" | "CANCELLED";

function rowUiState(op: TimelockIndexedOp, now: number): RowUi {
  if (op.state === "EXECUTED") return "EXECUTED";
  if (op.state === "CANCELLED") return "CANCELLED";
  const exec = Number(op.executeAfter);
  if (!Number.isFinite(exec)) return "PENDING";
  if (op.state === "READY" || now >= exec) return "READY_TO_EXECUTE";
  return "PENDING";
}

function statusBadgeClass(ui: RowUi): string {
  switch (ui) {
    case "PENDING":
      return "border-amber-500/50 bg-amber-500/15 text-amber-200";
    case "READY_TO_EXECUTE":
      return "border-emerald-500/50 bg-emerald-500/15 text-emerald-200";
    case "EXECUTED":
      return "border-sky-500/50 bg-sky-500/15 text-sky-200";
    case "CANCELLED":
      return "border-red-500/50 bg-red-500/15 text-red-200";
    default:
      return "border-zinc-600 bg-zinc-800 text-zinc-300";
  }
}

function statusLabel(ui: RowUi): string {
  switch (ui) {
    case "PENDING":
      return "Queued";
    case "READY_TO_EXECUTE":
      return "Ready to execute";
    case "EXECUTED":
      return "Executed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return ui;
  }
}

type Props = {
  ops: TimelockIndexedOp[];
  isLoading?: boolean;
};

/** 链上 timelock：待执行队列 + 近期已结算记录（透明度）。 */
export function TimelockQueue({ ops, isLoading }: Props) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const pendingRows = useMemo(() => ops.filter((o) => o.state === "CREATED" || o.state === "READY"), [ops]);

  const settledRows = useMemo(() => {
    return ops
      .filter((o) => o.state === "EXECUTED" || o.state === "CANCELLED")
      .sort((a, b) => {
        const ta = Math.max(Number(a.executedAt ?? 0), Number(a.cancelledAt ?? 0));
        const tb = Math.max(Number(b.executedAt ?? 0), Number(b.cancelledAt ?? 0));
        return tb - ta;
      })
      .slice(0, 12);
  }, [ops]);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
        <div className="h-4 w-48 animate-pulse rounded bg-zinc-800" />
        <div className="mt-3 space-y-2">
          <div className="h-10 animate-pulse rounded-lg bg-zinc-800" />
          <div className="h-10 animate-pulse rounded-lg bg-zinc-800" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="min-w-0 rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-950 to-zinc-900/50 p-3 sm:p-4">
        <div className="mb-1 font-semibold text-zinc-100">Queued operations</div>
        <p className="mb-3 text-xs text-zinc-500">
          Function, params summary, execute timestamp (local), remaining time (hh:mm:ss), and status. All governance writes go through timelock delay.
        </p>
        {pendingRows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-700/80 bg-zinc-950/60 px-3 py-6 text-center text-sm text-zinc-500">No pending timelock operations.</p>
        ) : (
          <div className="-mx-1 overflow-x-auto overscroll-x-contain px-1 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[640px] text-left text-xs text-zinc-300 sm:min-w-[720px]">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-2">Function</th>
                  <th className="py-2 pr-2">Params</th>
                  <th className="py-2 pr-2">Execute timestamp</th>
                  <th className="py-2 pr-2">Remaining (hh:mm:ss)</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {pendingRows.map((op) => {
                  const exec = Number(op.executeAfter);
                  const execDate = Number.isFinite(exec) ? new Date(exec * 1000).toLocaleString() : "—";
                  const ui = rowUiState(op, now);
                  const left = Number.isFinite(exec) ? Math.max(0, exec - now) : 0;
                  const remaining = ui === "PENDING" ? formatCountdownHms(left) : "00:00:00";
                  return (
                    <tr key={`${op.opId}-${op.paramsHash}`} className="border-b border-zinc-800/80 last:border-0">
                      <td className="py-2.5 pr-2 font-mono text-[11px] text-zinc-100">{op.functionLabel ?? "unknown"}</td>
                      <td className="max-w-[220px] truncate py-2.5 pr-2 font-mono text-[11px] text-zinc-400" title={op.paramsDisplay ?? op.paramsHash}>
                        {op.paramsDisplay ?? op.paramsHash}
                      </td>
                      <td className="py-2.5 pr-2 text-zinc-400">{execDate}</td>
                      <td className="py-2.5 pr-2 font-mono tabular-nums text-zinc-200">{ui === "PENDING" ? remaining : "—"}</td>
                      <td className="py-2.5">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(ui)}`}>{statusLabel(ui)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {settledRows.length > 0 && (
        <div className="min-w-0 rounded-2xl border border-zinc-800/90 bg-zinc-950/60 p-3 sm:p-4">
          <div className="mb-1 font-semibold text-zinc-200">Recent settlements</div>
          <p className="mb-3 text-xs text-zinc-500">Latest executed or cancelled timelock payloads (read-only).</p>
          <div className="-mx-1 overflow-x-auto overscroll-x-contain px-1 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[560px] text-left text-xs text-zinc-300 sm:min-w-[640px]">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-2">Function</th>
                  <th className="py-2 pr-2">Params</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2">Settled at (local)</th>
                </tr>
              </thead>
              <tbody>
                {settledRows.map((op) => {
                  const ui = op.state === "EXECUTED" ? "EXECUTED" : "CANCELLED";
                  const ts = ui === "EXECUTED" ? op.executedAt : op.cancelledAt;
                  const settledLabel = ts ? new Date(Number(ts) * 1000).toLocaleString() : "—";
                  return (
                    <tr key={`${op.opId}-${op.paramsHash}-settled`} className="border-b border-zinc-800/80 last:border-0">
                      <td className="py-2 pr-2 font-mono text-[11px] text-zinc-200">{op.functionLabel ?? "unknown"}</td>
                      <td className="max-w-[220px] truncate py-2 pr-2 font-mono text-[11px] text-zinc-500" title={op.paramsDisplay ?? op.paramsHash}>
                        {op.paramsDisplay ?? op.paramsHash}
                      </td>
                      <td className="py-2 pr-2">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(ui)}`}>{statusLabel(ui)}</span>
                      </td>
                      <td className="py-2 text-zinc-400">{settledLabel}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
