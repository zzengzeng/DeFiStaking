"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

import { counterpartPath, modeFromPath } from "@/lib/appMode";

type Props = {
  className?: string;
  compact?: boolean;
};

/** 在产品端与合约控制台之间切换 */
export function ModeSwitcher({ className, compact = false }: Props) {
  const pathname = usePathname();
  const mode = modeFromPath(pathname);
  const otherHref = counterpartPath(pathname);
  const productLabel = compact ? "产品" : "产品界面";
  const consoleLabel = compact ? "控制台" : "合约控制台";

  return (
    <div
      className={clsx(
        "inline-flex items-center rounded-full border border-zinc-700 bg-zinc-950 p-0.5",
        className,
      )}
      role="group"
      aria-label="界面模式"
    >
      {mode === "product" ? (
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-black sm:px-3 sm:text-xs">
          {productLabel}
        </span>
      ) : (
        <Link
          href={otherHref}
          className="rounded-full px-2.5 py-1 text-[11px] font-medium text-zinc-500 transition hover:text-zinc-200 sm:px-3 sm:text-xs"
        >
          {productLabel}
        </Link>
      )}
      {mode === "console" ? (
        <span className="rounded-full bg-amber-200 px-2.5 py-1 text-[11px] font-medium text-black sm:px-3 sm:text-xs">
          {consoleLabel}
        </span>
      ) : (
        <Link
          href={otherHref}
          className="rounded-full px-2.5 py-1 text-[11px] font-medium text-zinc-500 transition hover:text-amber-200 sm:px-3 sm:text-xs"
          title="运维、治理与合约调试"
        >
          {consoleLabel}
        </Link>
      )}
    </div>
  );
}
