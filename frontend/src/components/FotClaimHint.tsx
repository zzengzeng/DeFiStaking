"use client";

import { bpToPercent, formatToken } from "@/lib/format";
import { walletReceiveAfterFee } from "@/lib/fot";

type Props = {
  grossRewards: bigint;
  maxTransferFeeBP: bigint;
  tokenSymbol?: string;
};

/** 当 maxTransferFeeBP > 0 时展示合约 gross 与钱包净到账估算。 */
export function FotClaimHint({ grossRewards, maxTransferFeeBP, tokenSymbol = "TokenB" }: Props) {
  if (maxTransferFeeBP <= 0n || grossRewards <= 0n) return null;
  const walletEst = walletReceiveAfterFee(grossRewards, maxTransferFeeBP);
  return (
    <p className="mt-2 rounded-lg border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200/90">
      FOT：合约将转出 <span className="font-mono">{formatToken(grossRewards)}</span> {tokenSymbol}；预估钱包到账{" "}
      <span className="font-mono text-emerald-300/90">{formatToken(walletEst)}</span>（税费最高 {bpToPercent(maxTransferFeeBP)}，由用户承担）。
    </p>
  );
}
