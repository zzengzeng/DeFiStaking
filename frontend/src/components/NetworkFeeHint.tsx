"use client";

import clsx from "clsx";
import { formatUnits } from "viem";
import { useAccount, useGasPrice } from "wagmi";

import { useI18n } from "@/lib/i18n";

type Props = {
  className?: string;
};

/** 连接钱包后展示当前网络 Gas 参考价 */
export function NetworkFeeHint({ className }: Props) {
  const { isConnected } = useAccount();
  const { data: gasPrice } = useGasPrice({ query: { enabled: isConnected, staleTime: 30_000 } });
  const { t } = useI18n();

  if (!isConnected) {
    return (
      <p className={clsx("text-[11px] leading-relaxed text-zinc-600", className)}>
        {t("gas.disconnected")}
      </p>
    );
  }

  const gwei = gasPrice ? Number(formatUnits(gasPrice, 9)) : null;

  return (
    <p className={clsx("text-[11px] leading-relaxed text-zinc-600", className)}>
      {gwei !== null && Number.isFinite(gwei) ? (
        <>
          {t("gas.current", { gwei: gwei.toFixed(1) })}
          {" · "}
        </>
      ) : null}
      {t("gas.walletQuote")}
    </p>
  );
}
