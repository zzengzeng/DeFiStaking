"use client";

import { bpToPercent, formatToken } from "@/lib/format";
import { walletReceiveAfterFee } from "@/lib/fot";
import { useUiCopy } from "@/lib/uiCopy";

type Props = {
  netAmount: bigint;
  feeAmount: bigint;
  penaltyAmount: bigint;
  feeBp: bigint;
  penaltyBp: bigint;
  tokenSymbol?: string;
  /** When > 0, outbound FOT tax is borne by the user; show gross vs estimated wallet net. */
  maxTransferFeeBP?: bigint;
};

export function WithdrawPreview({
  netAmount,
  feeAmount,
  penaltyAmount,
  feeBp,
  penaltyBp,
  tokenSymbol = "TokenB",
  maxTransferFeeBP = 0n,
}: Props) {
  const ui = useUiCopy();
  const netDisplay = netAmount < 0n ? 0n : netAmount;
  const fotActive = maxTransferFeeBP > 0n;
  const walletEst = walletReceiveAfterFee(netDisplay, maxTransferFeeBP);
  return (
    <div className="grid min-w-0 gap-2 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm">
      {fotActive ? (
        <>
          <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="shrink-0 text-zinc-400">{ui.withdrawPreview.contractGross}</span>
            <span className="min-w-0 break-words text-right font-medium text-zinc-200 sm:text-left">
              {formatToken(netDisplay)} {tokenSymbol}
            </span>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="shrink-0 text-zinc-400">{ui.withdrawPreview.walletReceive}</span>
            <span className="min-w-0 break-words text-right font-medium text-emerald-300 sm:text-left">
              {formatToken(walletEst)} {tokenSymbol}
            </span>
          </div>
          <p className="text-xs text-amber-200/80">
            {ui.withdrawPreview.fotHint(bpToPercent(maxTransferFeeBP))}
          </p>
        </>
      ) : (
        <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
          <span className="shrink-0 text-zinc-400">{ui.withdrawPreview.youReceive}</span>
          <span className="min-w-0 break-words text-right font-medium text-emerald-300 sm:text-left">
            {formatToken(netDisplay)} {tokenSymbol}
          </span>
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-zinc-400">{ui.withdrawPreview.fee}</span>
        <span className="min-w-0 break-words text-right sm:text-left">
          {formatToken(feeAmount)} ({bpToPercent(feeBp)})
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-zinc-400">{ui.withdrawPreview.penalty}</span>
        <span className={`min-w-0 break-words text-right sm:text-left ${penaltyAmount > 0n ? "text-red-300" : ""}`}>
          {formatToken(penaltyAmount)} ({bpToPercent(penaltyBp)})
        </span>
      </div>
    </div>
  );
}
