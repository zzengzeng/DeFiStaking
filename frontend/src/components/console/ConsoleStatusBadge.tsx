"use client";

import clsx from "clsx";

export type ConsoleBadgeTone = "good" | "warn" | "muted";

const toneClass: Record<ConsoleBadgeTone, string> = {
  good: "border-amber-500/35 bg-amber-500/10 text-amber-200",
  warn: "border-amber-400/30 bg-amber-400/10 text-amber-100",
  muted: "border-zinc-700 bg-zinc-900/80 text-zinc-400",
};

type Props = {
  tone?: ConsoleBadgeTone;
  children: React.ReactNode;
  className?: string;
};

/** 控制台只读状态徽章（非按钮）：与顶栏角色标签同款琥珀色系。 */
export function ConsoleStatusBadge({ tone = "muted", children, className }: Props) {
  return (
    <span
      className={clsx(
        "inline-flex min-w-[4.75rem] shrink-0 items-center justify-center rounded-lg border px-2.5 py-1 text-center font-mono text-[11px] font-semibold leading-none",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
