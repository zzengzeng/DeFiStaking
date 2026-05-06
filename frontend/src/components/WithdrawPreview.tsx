"use client";

import { bpToPercent, formatToken } from "@/lib/format";

type Props = {
  netAmount: bigint;
  feeAmount: bigint;
  penaltyAmount: bigint;
  feeBp: bigint;
  penaltyBp: bigint;
};

export function WithdrawPreview({ netAmount, feeAmount, penaltyAmount, feeBp, penaltyBp }: Props) {
  const netDisplay = netAmount < 0n ? 0n : netAmount;
  return (
    <div className="grid min-w-0 gap-2 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm">
      <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="shrink-0 text-zinc-400">You Receive</span>
        <span className="min-w-0 break-words text-right font-medium text-emerald-300 sm:text-left">{formatToken(netDisplay)} TokenB</span>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-zinc-400">Fee</span>
        <span className="min-w-0 break-words text-right sm:text-left">
          {formatToken(feeAmount)} ({bpToPercent(feeBp)})
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-zinc-400">Penalty</span>
        <span className={`min-w-0 break-words text-right sm:text-left ${penaltyAmount > 0n ? "text-red-300" : ""}`}>
          {formatToken(penaltyAmount)} ({bpToPercent(penaltyBp)})
        </span>
      </div>
    </div>
  );
}
