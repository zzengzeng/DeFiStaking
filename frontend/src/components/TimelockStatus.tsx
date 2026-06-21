"use client";

import { useEffect, useMemo, useState } from "react";

import type { TimelockIndexedOp } from "@/hooks/useTimelockOps";
import { formatCountdownHms } from "@/lib/timelockCountdown";
import { useUiCopy } from "@/lib/uiCopy";

export type TimelockUiState = "IDLE" | "PENDING" | "READY_TO_EXECUTE" | "EXECUTED" | "CANCELLED";

type Props = {
  op?: TimelockIndexedOp;
};

function resolveUiState(
  op: TimelockIndexedOp | undefined,
  now: number,
): { state: TimelockUiState; remainingSec: number; executeAtMs: number | null; settledAtLabel: string } {
  if (!op) {
    return { state: "IDLE", remainingSec: 0, executeAtMs: null, settledAtLabel: "—" };
  }
  const executeAfter = Number(op.executeAfter);
  if (!Number.isFinite(executeAfter)) {
    return { state: "IDLE", remainingSec: 0, executeAtMs: null, settledAtLabel: "—" };
  }
  const executeAtMs = executeAfter * 1000;
  const delta = executeAfter - now;

  if (op.state === "EXECUTED") {
    const settledAtLabel = op.executedAt
      ? new Date(Number(op.executedAt) * 1000).toLocaleString()
      : new Date(executeAtMs).toLocaleString();
    return { state: "EXECUTED", remainingSec: 0, executeAtMs, settledAtLabel };
  }
  if (op.state === "CANCELLED") {
    const settledAtLabel = op.cancelledAt
      ? new Date(Number(op.cancelledAt) * 1000).toLocaleString()
      : new Date(executeAtMs).toLocaleString();
    return { state: "CANCELLED", remainingSec: 0, executeAtMs, settledAtLabel };
  }
  if (op.state === "READY" || (op.state === "CREATED" && delta <= 0)) {
    return { state: "READY_TO_EXECUTE", remainingSec: 0, executeAtMs, settledAtLabel: "—" };
  }
  return {
    state: "PENDING",
    remainingSec: Math.max(0, delta),
    executeAtMs,
    settledAtLabel: "—",
  };
}

export function TimelockStatus({ op }: Props) {
  const ui = useUiCopy();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const data = useMemo(() => resolveUiState(op, now), [op, now]);

  const statusTitle = (() => {
    switch (data.state) {
      case "IDLE":
        return ui.timelock.notQueued;
      case "PENDING":
        return ui.timelock.queued;
      case "READY_TO_EXECUTE":
        return ui.timelock.ready;
      case "EXECUTED":
        return ui.timelock.executed;
      case "CANCELLED":
        return ui.timelock.cancelled;
      default:
        return data.state;
    }
  })();

  const toneClass =
    data.state === "READY_TO_EXECUTE"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-50"
      : data.state === "PENDING"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-50"
        : data.state === "EXECUTED"
          ? "border-sky-500/40 bg-sky-500/10 text-sky-50"
          : data.state === "CANCELLED"
            ? "border-red-500/40 bg-red-500/10 text-red-50"
            : "border-zinc-700/60 bg-zinc-950 text-zinc-400";

  const countdown =
    data.state === "PENDING" ? formatCountdownHms(data.remainingSec) : data.state === "READY_TO_EXECUTE" ? "00:00:00" : "—";

  const executeAtStr = data.executeAtMs !== null ? new Date(data.executeAtMs).toLocaleString() : "—";

  return (
    <div className={`min-w-0 rounded-xl border p-3 text-xs ${toneClass}`}>
      <div className="font-semibold tracking-wide">{statusTitle}</div>
      {data.state === "PENDING" && (
        <div className="mt-1 font-mono text-[11px] tabular-nums text-amber-200/95">
          {ui.timelock.remaining} {countdown}
        </div>
      )}
      {data.state === "READY_TO_EXECUTE" && (
        <div className="mt-1 font-mono text-[11px] tabular-nums text-emerald-200/95">
          {ui.timelock.remaining} {countdown}
        </div>
      )}

      <div className="mt-2 space-y-1 border-t border-white/10 pt-2 font-mono text-[11px] leading-relaxed opacity-95">
        {(data.state === "PENDING" || data.state === "READY_TO_EXECUTE") && data.executeAtMs !== null && (
          <div>
            <span className="text-white/55">{ui.timelock.executeAt}: </span>
            <span>{executeAtStr}</span>
          </div>
        )}
        {(data.state === "PENDING" || data.state === "READY_TO_EXECUTE") && (
          <div>
            <span className="text-white/55">{ui.timelock.remainingHms}: </span>
            <span className="tabular-nums">{countdown}</span>
          </div>
        )}
        {(data.state === "EXECUTED" || data.state === "CANCELLED") && (
          <div>
            <span className="text-white/55">
              {data.state === "EXECUTED" ? `${ui.timelock.executedAt}: ` : `${ui.timelock.cancelledAt}: `}
            </span>
            <span>{data.settledAtLabel}</span>
          </div>
        )}
        {data.state === "IDLE" && <div className="text-white/50">{ui.timelock.idleHint}</div>}
      </div>
    </div>
  );
}
