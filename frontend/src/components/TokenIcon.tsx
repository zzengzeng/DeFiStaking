"use client";

import clsx from "clsx";

import { normalizeTokenSymbol, TOKEN_META, type TokenSymbol } from "@/lib/tokens";

const SIZE_MAP = {
  xs: "size-4 text-[8px]",
  sm: "size-5 text-[9px]",
  md: "size-6 text-[10px]",
  lg: "size-8 text-xs",
  xl: "size-10 text-sm",
} as const;

type Props = {
  symbol: string;
  size?: keyof typeof SIZE_MAP;
  className?: string;
};

/** 协议 Token 图标（TokenA 天蓝 / TokenB 紫色） */
export function TokenIcon({ symbol, size = "md", className }: Props) {
  const normalized = normalizeTokenSymbol(symbol);
  if (!normalized) {
    return (
      <span
        className={clsx(
          "inline-grid shrink-0 place-items-center rounded-full border border-zinc-700 bg-zinc-800 font-bold text-zinc-300",
          SIZE_MAP[size],
          className,
        )}
        aria-hidden
      >
        ?
      </span>
    );
  }

  const meta = TOKEN_META[normalized];
  return (
    <span
      className={clsx(
        "inline-grid shrink-0 place-items-center rounded-full font-bold text-white",
        SIZE_MAP[size],
        className,
      )}
      style={{
        background: `linear-gradient(135deg, ${meta.from}, ${meta.to})`,
        boxShadow: `0 0 0 1px rgba(255,255,255,0.08), 0 4px 12px -4px ${meta.shadow}`,
      }}
      title={meta.label}
      aria-hidden
    >
      {meta.short}
    </span>
  );
}

export function tokenSymbolLabel(symbol: string): string {
  const normalized = normalizeTokenSymbol(symbol);
  return normalized ? TOKEN_META[normalized].label : symbol;
}

export type { TokenSymbol };
