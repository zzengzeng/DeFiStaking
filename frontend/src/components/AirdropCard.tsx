"use client";

import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { parseUnits } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";

import { erc20Abi } from "@/contracts/abis/erc20";
import { contractAddresses } from "@/contracts/addresses";
import { useWriteWithStatus } from "@/hooks/useWriteWithStatus";

const AIRDROP_AMOUNT_WEI = parseUnits("1000", 18);
const AIRDROP_MAX_USERS = 1000n;
const AIRDROP_MAX_SUPPLY_WEI = AIRDROP_AMOUNT_WEI * AIRDROP_MAX_USERS;
const AIRDROP_STORAGE_KEY = "dualpool-airdrop-claimed-v4-zztka";

type Props = {
  onClaimed?: () => Promise<void> | void;
};

function readClaimedLocal(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(AIRDROP_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) ? new Set(arr.map((v) => v.toLowerCase())) : new Set();
  } catch {
    return new Set();
  }
}

function useAirdropEligibility(tokenAddress: Address) {
  const { address } = useAccount();
  const [claimedLocal, setClaimedLocal] = useState(false);

  useEffect(() => {
    if (!address) {
      setClaimedLocal(false);
      return;
    }
    setClaimedLocal(readClaimedLocal().has(address.toLowerCase()));
  }, [address]);

  const { data: balance = 0n } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const done = Boolean(address && (claimedLocal || balance >= AIRDROP_AMOUNT_WEI));

  return { done, markClaimed: () => setClaimedLocal(true) };
}

/** 测试网 TokenA 新用户空投（灵活池体验用；TokenB 无空投） */
export function AirdropCard({ onClaimed }: Props) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const flow = useWriteWithStatus();
  const eligibility = useAirdropEligibility(contractAddresses.tokenA);

  const { data: totalSupply = 0n, refetch: refetchTotalSupply } = useReadContract({
    address: contractAddresses.tokenA,
    abi: erc20Abi,
    functionName: "totalSupply",
  });

  const { refetch: refetchBalance } = useReadContract({
    address: contractAddresses.tokenA,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const reachedCap = totalSupply >= AIRDROP_MAX_SUPPLY_WEI;
  const busy = flow.state !== "idle";

  const disabledReason = useMemo(() => {
    if (!address) return "请先连接钱包";
    if (busy) return "交易处理中";
    if (reachedCap) return "空投名额已满（1000/1000）";
    return null;
  }, [address, busy, reachedCap]);

  if (address && eligibility.done) return null;

  const persistClaimed = (addr: string) => {
    const prev = readClaimedLocal();
    prev.add(addr.toLowerCase());
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AIRDROP_STORAGE_KEY, JSON.stringify([...prev]));
    }
    eligibility.markClaimed();
  };

  const onClaim = async () => {
    if (!address || disabledReason) return;
    try {
      await flow.executeWrite(
        {
          actionLabel: "领取 TokenA 空投",
          txType: "airdrop",
          metadata: { token: "TokenA", amount: "1000" },
          onConfirmed: async () => {
            persistClaimed(address);
            await Promise.all([refetchTotalSupply(), refetchBalance()]);
            await onClaimed?.();
          },
        },
        () =>
          writeContractAsync({
            address: contractAddresses.tokenA,
            abi: erc20Abi,
            functionName: "mint",
            args: [address, AIRDROP_AMOUNT_WEI],
            account: address,
          }),
      );
      flow.reset({ closeGlobal: true });
    } catch {
      flow.reset({ closeGlobal: true });
    }
  };

  const claimedApprox = totalSupply / AIRDROP_AMOUNT_WEI;
  const remaining = claimedApprox >= AIRDROP_MAX_USERS ? 0n : AIRDROP_MAX_USERS - claimedApprox;

  return (
    <div className="dp-card overflow-hidden border-dp-accent/20 p-4 sm:p-5">
      <div className="text-center sm:text-left">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
          <h2 className="text-sm font-semibold text-zinc-100 sm:text-base">新用户空投</h2>
          <span className="rounded-full border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] px-2 py-0.5 text-xs text-zinc-400">
            限前 1000 地址
          </span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
          领取 1000 TokenA，体验灵活池质押。TokenB 需通过质押奖励或自行获取，不提供空投。
        </p>
      </div>
      <div className="mt-3 flex flex-col gap-3 rounded-xl border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-zinc-100">TokenA</span>
            <span className="text-xs text-zinc-500">灵活池质押</span>
            <span className="rounded-full border border-[var(--dp-border)] px-2 py-0.5 text-[11px] text-zinc-500">
              剩余 {remaining.toString()}
            </span>
          </div>
          <div className="mt-1 text-xs text-zinc-500">数量 1000 · 测试网体验用</div>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
          <button
            type="button"
            onClick={() => void onClaim()}
            disabled={Boolean(disabledReason)}
            className="dp-button min-h-[40px] w-full rounded-lg px-4 text-sm font-medium disabled:cursor-not-allowed sm:w-auto"
          >
            {busy ? "处理中…" : "领取 1000 TokenA"}
          </button>
          {disabledReason ? (
            <span className="text-center text-[11px] text-zinc-500 sm:text-right">{disabledReason}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
