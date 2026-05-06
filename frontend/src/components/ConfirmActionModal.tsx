"use client";

import clsx from "clsx";

export type ConfirmRow = { label: string; value: React.ReactNode };

type Props = {
  open: boolean;
  title: string;
  rows?: ConfirmRow[];
  warning?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

export function ConfirmActionModal({
  open,
  title,
  rows,
  warning,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  busy,
  onConfirm,
  onClose,
}: Props) {
  if (!open) return null;
  const danger = variant === "danger";
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="max-h-[min(90vh,100dvh)] w-full max-w-md overflow-y-auto rounded-t-2xl border border-zinc-800 bg-zinc-950 p-4 sm:rounded-2xl">
        <div className="text-base font-semibold text-zinc-100">{title}</div>
        {rows && rows.length > 0 ? (
          <dl className="mt-3 space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-sm">
            {rows.map((r) => (
              <div key={r.label} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
                <dt className="text-zinc-500">{r.label}</dt>
                <dd className="min-w-0 break-all text-right font-mono text-zinc-100 sm:text-left">{r.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {warning ? (
          <div
            className={clsx(
              "mt-3 rounded-lg border px-3 py-2 text-xs leading-relaxed",
              danger ? "border-red-500/40 bg-red-500/10 text-red-100" : "border-amber-500/35 bg-amber-500/10 text-amber-100",
            )}
          >
            {warning}
          </div>
        ) : null}
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:flex-nowrap sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-[44px] w-full rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:opacity-40 sm:w-auto"
          >
            {cancelText}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm()}
            className={clsx(
              "min-h-[44px] w-full rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40 sm:w-auto",
              danger ? "bg-red-400 text-black hover:bg-red-300" : "bg-emerald-400 text-black hover:bg-emerald-300",
            )}
          >
            {busy ? "Working…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
