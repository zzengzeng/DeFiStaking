"use client";

import clsx from "clsx";

type Tone = "empty" | "loading" | "error" | "warning";

type Props = {
  tone?: Tone;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
};

const toneClass: Record<Tone, string> = {
  empty: "border-[var(--dp-border)] bg-[var(--dp-surface-raised)]/55 text-zinc-400",
  loading: "border-sky-400/20 bg-sky-400/5 text-sky-100",
  error: "border-red-400/25 bg-red-400/8 text-red-100",
  warning: "border-amber-400/25 bg-amber-400/8 text-amber-100",
};

const dotClass: Record<Tone, string> = {
  empty: "bg-zinc-500",
  loading: "bg-[var(--dp-accent)]",
  error: "bg-red-300",
  warning: "bg-amber-300",
};

/** 产品端统一空态 / 加载态 / 错误态卡片。 */
export function ProductStateCard({ tone = "empty", title, description, action, compact = false }: Props) {
  return (
    <div
      className={clsx(
        "rounded-xl border",
        toneClass[tone],
        compact ? "px-4 py-4" : "px-5 py-6 sm:px-6",
      )}
      aria-busy={tone === "loading"}
    >
      <div className="flex items-start gap-3">
        <span className={clsx("mt-1.5 size-2.5 shrink-0 rounded-full", dotClass[tone], tone === "loading" && "animate-pulse")} />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-100">{title}</div>
          {description ? <div className="mt-1 text-sm leading-relaxed text-zinc-500">{description}</div> : null}
          {action ? <div className="mt-3">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function ProductSkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] px-4 py-3">
          <div className="h-3 w-24 animate-pulse rounded bg-zinc-800" />
          <div className="mt-2 h-5 w-36 animate-pulse rounded bg-zinc-700" />
        </div>
      ))}
    </div>
  );
}
