"use client";

import clsx from "clsx";

import { useI18n } from "@/lib/i18n";

type Tone = "neutral" | "good" | "warn" | "danger";

export type TransactionPreviewRow = {
  label: string;
  value: React.ReactNode;
  subvalue?: React.ReactNode;
  tone?: Tone;
};

type Props = {
  title?: string;
  rows: TransactionPreviewRow[];
  footnote?: React.ReactNode;
  compact?: boolean;
};

const toneClass: Record<Tone, string> = {
  neutral: "text-zinc-200",
  good: "text-emerald-200",
  warn: "text-amber-200",
  danger: "text-red-200",
};

/** 标准交易预览：提交前统一展示入账、扣费、税费和风险提示。 */
export function TransactionPreview({ title, rows, footnote, compact = false }: Props) {
  const { t } = useI18n();
  const resolvedTitle = title ?? t("txPreview.title");

  if (rows.length === 0) return null;

  return (
    <section className={clsx("rounded-xl border border-[var(--dp-border)] bg-zinc-950/70", compact ? "p-3" : "p-4")}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{resolvedTitle}</h3>
        <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-500">{t("txPreview.badge")}</span>
      </div>
      <div className="divide-y divide-zinc-800/80">
        {rows.map((row) => (
          <div key={row.label} className="flex min-w-0 items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
            <div className="min-w-0 text-xs text-zinc-500">{row.label}</div>
            <div className="min-w-0 text-right">
              <div className={clsx("break-words text-sm font-semibold", toneClass[row.tone ?? "neutral"])}>{row.value}</div>
              {row.subvalue ? <div className="mt-0.5 text-[11px] text-zinc-600">{row.subvalue}</div> : null}
            </div>
          </div>
        ))}
      </div>
      {footnote ? (
        <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-100/90">
          {footnote}
        </div>
      ) : null}
    </section>
  );
}
