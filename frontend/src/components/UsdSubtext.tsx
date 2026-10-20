"use client";

import clsx from "clsx";

import { getTokenUsdPrice } from "@/lib/tokenPrices";
import { formatUsd, usdFromTokenAmount } from "@/lib/usd";

type Props = {
  amountWei: bigint;
  symbol: string;
  decimals?: number;
  fractionDigits?: number;
  className?: string;
};

/** 未配置 USD 参考价时不渲染 */
export function UsdSubtext({ amountWei, symbol, decimals = 18, fractionDigits = 2, className }: Props) {
  const price = getTokenUsdPrice(symbol);
  if (price === null || amountWei <= 0n) return null;

  const usd = usdFromTokenAmount(amountWei, decimals, price);
  return (
    <span className={clsx("text-xs tabular-nums text-zinc-500", className)}>
      ≈ {formatUsd(usd, fractionDigits)}
    </span>
  );
}
