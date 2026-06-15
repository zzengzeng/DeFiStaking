"use client";

import { bpToPercent, formatToken } from "@/lib/format";
import { walletReceiveAfterFee } from "@/lib/fot";

type Props = {
  grossRewards: bigint;
  maxTransferFeeBP: bigint;
  tokenSymbol?: string;
};

/** Shown when `maxTransferFeeBP > 0` so users see contract gross vs estimated wallet net on claim. */
export function FotClaimHint({ grossRewards, maxTransferFeeBP, tokenSymbol = "TokenB" }: Props) {
  if (maxTransferFeeBP <= 0n || grossRewards <= 0n) return null;
  const walletEst = walletReceiveAfterFee(grossRewards, maxTransferFeeBP);
  return (
    <p className="mt-2 rounded-lg border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200/90">
      FOT: contract will transfer <span className="font-mono">{formatToken(grossRewards)}</span> {tokenSymbol}; est.
      wallet receive <span className="font-mono text-emerald-300/90">{formatToken(walletEst)}</span> (tax up to{" "}
      {bpToPercent(maxTransferFeeBP)}, borne by you).
    </p>
  );
}
