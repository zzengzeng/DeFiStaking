"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { TimelockIndexedOp } from "@/hooks/useTimelockOps";
import { useI18n } from "@/lib/i18n";
import { formatCountdownHms } from "@/lib/timelockCountdown";
import { useUiCopy } from "@/lib/uiCopy";

type RowUi = "PENDING" | "READY_TO_EXECUTE" | "EXECUTED" | "CANCELLED";

function shortHash(value?: string): string {
  if (!value) return "—";
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

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

function statusLabel(ui: ReturnType<typeof useUiCopy>, uiState: RowUi): string {
  switch (uiState) {
    case "PENDING":
      return ui.timelock.queued;
    case "READY_TO_EXECUTE":
      return ui.timelock.ready;
    case "EXECUTED":
      return ui.timelock.executed;
    case "CANCELLED":
      return ui.timelock.cancelled;
    default:
      return uiState;
  }
}

function operationDomain(ui: ReturnType<typeof useUiCopy>, op: TimelockIndexedOp): { label: string; className: string } {
  const text = `${op.functionLabel ?? ""} ${op.paramsDisplay ?? ""}`.toLowerCase();
  if (text.includes("module") || text.includes("role") || text.includes("admin")) {
    return { label: ui.timelock.domainHighPrivilege, className: "border-red-400/40 bg-red-400/10 text-red-100" };
  }
  if (text.includes("pause") || text.includes("emergency") || text.includes("shutdown")) {
    return { label: ui.timelock.domainProtocolState, className: "border-amber-400/40 bg-amber-400/10 text-amber-100" };
  }
  if (text.includes("reward") || text.includes("budget") || text.includes("debt")) {
    return { label: ui.timelock.domainFundsAccounting, className: "border-sky-400/40 bg-sky-400/10 text-sky-100" };
  }
  return { label: ui.timelock.domainParamChange, className: "border-zinc-600 bg-zinc-900 text-zinc-300" };
}

function operationTimes(op: TimelockIndexedOp, now: number) {
  const exec = Number(op.executeAfter);
  const execDate = Number.isFinite(exec) ? new Date(exec * 1000).toLocaleString() : "—";
  const ui = rowUiState(op, now);
  const left = Number.isFinite(exec) ? Math.max(0, exec - now) : 0;
  const remaining = ui === "PENDING" ? formatCountdownHms(left) : "00:00:00";
  const settledAt =
    op.state === "EXECUTED"
      ? op.executedAt
      : op.state === "CANCELLED"
        ? op.cancelledAt
        : undefined;
  return {
    execDate,
    remaining,
    ui,
    settledLabel: settledAt ? new Date(Number(settledAt) * 1000).toLocaleString() : "—",
  };
}

function CopyHashButton({ value, label }: { value: string; label: string }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast.success(t("governanceCard.copySuccess", { label }));
        } catch {
          toast.error(t("governanceCard.copyFailed"));
        }
      }}
      className="rounded-md border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-100"
    >
      {t("governanceCard.copy")}
    </button>
  );
}

function TimelockOpCard({ op, now, settled = false }: { op: TimelockIndexedOp; now: number; settled?: boolean }) {
  const ui = useUiCopy();
  const { ui: uiState, execDate, remaining, settledLabel } = operationTimes(op, now);
  const domain = operationDomain(ui, op);

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 shadow-[0_20px_50px_-38px_rgba(0,0,0,0.9)]">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-sm font-semibold text-zinc-100">{op.functionLabel ?? ui.timelock.unknown}</div>
          <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-zinc-600">
            <span>op {shortHash(op.opId)}</span>
            <CopyHashButton value={op.opId} label={ui.timelock.copyOpId} />
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(uiState)}`}>
          {statusLabel(ui, uiState)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${domain.className}`}>{domain.label}</span>
        <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
          {ui.timelock.blockPrefix} {op.createdBlock}
        </span>
      </div>
      <dl className="mt-3 grid gap-2 text-xs">
        <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
          <dt className="text-[10px] uppercase tracking-wide text-zinc-600">{ui.timelock.params}</dt>
          <dd className="mt-1 truncate font-mono text-zinc-300" title={op.paramsDisplay ?? op.paramsHash}>
            {op.paramsDisplay ?? shortHash(op.paramsHash)}
          </dd>
          <div className="mt-2 flex justify-end">
            <CopyHashButton value={op.paramsHash} label={ui.timelock.copyParamsHash} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
            <dt className="text-[10px] uppercase tracking-wide text-zinc-600">{settled ? ui.timelock.completedAt : ui.timelock.colExecuteAt}</dt>
            <dd className="mt-1 text-zinc-300">{settled ? settledLabel : execDate}</dd>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
            <dt className="text-[10px] uppercase tracking-wide text-zinc-600">{ui.timelock.colRemaining}</dt>
            <dd className="mt-1 font-mono tabular-nums text-zinc-100">{uiState === "PENDING" ? remaining : "—"}</dd>
          </div>
        </div>
      </dl>
    </article>
  );
}

type Props = {
  ops: TimelockIndexedOp[];
  isLoading?: boolean;
};

/** 链上 timelock：待执行队列 + 近期已结算记录（透明度）。 */
export function TimelockQueue({ ops, isLoading }: Props) {
  const ui = useUiCopy();
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
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
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
      <div className="min-w-0 rounded-xl border border-zinc-800 bg-gradient-to-b from-zinc-950 to-zinc-900/50 p-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-1 font-semibold text-zinc-100">{ui.timelock.queueTitle}</div>
            <p className="text-xs text-zinc-500">{ui.timelock.queueDesc}</p>
          </div>
          <div className="flex shrink-0 gap-2 text-[10px] uppercase tracking-wide text-zinc-500">
            <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-1">{ui.timelock.pendingBadge(pendingRows.length)}</span>
            <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-1">{ui.timelock.historyBadge(settledRows.length)}</span>
          </div>
        </div>
        {pendingRows.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-zinc-700/80 bg-zinc-950/60 px-3 py-6 text-center">
            <div className="text-sm font-medium text-zinc-300">{ui.timelock.queueEmpty}</div>
            <div className="mt-1 text-xs text-zinc-600">{ui.timelock.queueEmptyHint}</div>
          </div>
        ) : (
          <>
            <div className="mt-3 grid gap-2 md:hidden">
              {pendingRows.map((op) => (
                <TimelockOpCard key={`${op.opId}-${op.paramsHash}-card`} op={op} now={now} />
              ))}
            </div>
            <div className="mt-3 hidden overflow-x-auto overscroll-x-contain md:block">
              <table className="w-full min-w-[720px] text-left text-xs text-zinc-300">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-2">{ui.timelock.colFunction}</th>
                  <th className="py-2 pr-2">{ui.timelock.colParams}</th>
                  <th className="py-2 pr-2">{ui.timelock.colDomain}</th>
                  <th className="py-2 pr-2">{ui.timelock.colExecuteAt}</th>
                  <th className="py-2 pr-2">{ui.timelock.colRemaining}</th>
                  <th className="py-2">{ui.timelock.colStatus}</th>
                </tr>
              </thead>
              <tbody>
                {pendingRows.map((op) => {
                  const { ui: uiState, execDate, remaining } = operationTimes(op, now);
                  const domain = operationDomain(ui, op);
                  return (
                    <tr key={`${op.opId}-${op.paramsHash}`} className="border-b border-zinc-800/80 last:border-0">
                      <td className="py-2.5 pr-2">
                        <div className="font-mono text-[11px] text-zinc-100">{op.functionLabel ?? ui.timelock.unknown}</div>
                        <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-zinc-600">
                          <span>{shortHash(op.opId)}</span>
                          <CopyHashButton value={op.opId} label={ui.timelock.copyOpId} />
                        </div>
                      </td>
                      <td className="max-w-[220px] truncate py-2.5 pr-2 font-mono text-[11px] text-zinc-400" title={op.paramsDisplay ?? op.paramsHash}>
                        <span>{op.paramsDisplay ?? op.paramsHash}</span>
                        <span className="ml-2 inline-flex align-middle">
                          <CopyHashButton value={op.paramsHash} label={ui.timelock.copyParamsHash} />
                        </span>
                      </td>
                      <td className="py-2.5 pr-2">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${domain.className}`}>{domain.label}</span>
                      </td>
                      <td className="py-2.5 pr-2 text-zinc-400">{execDate}</td>
                      <td className="py-2.5 pr-2 font-mono tabular-nums text-zinc-200">{uiState === "PENDING" ? remaining : "—"}</td>
                      <td className="py-2.5">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(uiState)}`}>{statusLabel(ui, uiState)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>

      {settledRows.length > 0 && (
        <div className="min-w-0 rounded-xl border border-zinc-800/90 bg-zinc-950/60 p-3 sm:p-4">
          <div className="mb-1 font-semibold text-zinc-200">{ui.timelock.recentTitle}</div>
          <p className="mb-3 text-xs text-zinc-500">{ui.timelock.recentDesc}</p>
          <div className="grid gap-2 md:hidden">
            {settledRows.slice(0, 6).map((op) => (
              <TimelockOpCard key={`${op.opId}-${op.paramsHash}-settled-card`} op={op} now={now} settled />
            ))}
          </div>
          <div className="hidden overflow-x-auto overscroll-x-contain md:block">
            <table className="w-full min-w-[640px] text-left text-xs text-zinc-300">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-2">{ui.timelock.colFunction}</th>
                  <th className="py-2 pr-2">{ui.timelock.colParams}</th>
                  <th className="py-2 pr-2">{ui.timelock.colStatus}</th>
                  <th className="py-2">{ui.timelock.colSettledAt}</th>
                </tr>
              </thead>
              <tbody>
                {settledRows.map((op) => {
                  const rowUi: RowUi = op.state === "EXECUTED" ? "EXECUTED" : "CANCELLED";
                  const { settledLabel } = operationTimes(op, now);
                  return (
                    <tr key={`${op.opId}-${op.paramsHash}-settled`} className="border-b border-zinc-800/80 last:border-0">
                      <td className="py-2 pr-2">
                        <div className="font-mono text-[11px] text-zinc-200">{op.functionLabel ?? ui.timelock.unknown}</div>
                        <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-zinc-600">
                          <span>{shortHash(op.opId)}</span>
                          <CopyHashButton value={op.opId} label={ui.timelock.copyOpId} />
                        </div>
                      </td>
                      <td className="max-w-[220px] truncate py-2 pr-2 font-mono text-[11px] text-zinc-500" title={op.paramsDisplay ?? op.paramsHash}>
                        <span>{op.paramsDisplay ?? op.paramsHash}</span>
                        <span className="ml-2 inline-flex align-middle">
                          <CopyHashButton value={op.paramsHash} label={ui.timelock.copyParamsHash} />
                        </span>
                      </td>
                      <td className="py-2 pr-2">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(rowUi)}`}>{statusLabel(ui, rowUi)}</span>
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
