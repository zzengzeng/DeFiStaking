"use client";

import clsx from "clsx";

import { TokenIcon } from "@/components/TokenIcon";

type Props = {
  symbol: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  showSymbol?: boolean;
  className?: string;
  symbolClassName?: string;
};

/** Token 图标 + 符号标签 */
export function TokenLabel({ symbol, size = "sm", showSymbol = true, className, symbolClassName }: Props) {
  return (
    <span className={clsx("inline-flex min-w-0 items-center gap-1.5", className)}>
      <TokenIcon symbol={symbol} size={size} />
      {showSymbol ? (
        <span className={clsx("truncate font-semibold", symbolClassName ?? "text-zinc-100")}>{symbol}</span>
      ) : null}
    </span>
  );
}
