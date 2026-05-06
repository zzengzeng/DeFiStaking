"use client";

import type { Address } from "viem";

import { useApproveIfNeeded } from "@/hooks/useApproveIfNeeded";
import { formatToken } from "@/lib/format";

type Props = {
  token: Address;
  spender: Address;
  requiredAmountWei: bigint | null;
  tokenDecimals?: number;
  symbol?: string;
};

/** 展示 allowance 与是否需要 approve（配合 Stake 主按钮逻辑） */
export function ApprovalGate({ token, spender, requiredAmountWei, tokenDecimals = 18, symbol = "Token" }: Props) {
  const { allowanceWei, needsApproval } = useApproveIfNeeded({ token, spender });
  if (!requiredAmountWei || requiredAmountWei <= 0n) return null;
  const need = needsApproval(requiredAmountWei);
  return (
    <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-[11px] text-zinc-400">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>Allowance</span>
        <span className="font-mono text-zinc-200">
          {formatToken(allowanceWei, tokenDecimals, 6)} {symbol}
        </span>
      </div>
      {need ? <div className="mt-1 text-amber-200/90">Approval required before staking this amount.</div> : <div className="mt-1 text-emerald-200/85">Allowance sufficient for this amount.</div>}
    </div>
  );
}
