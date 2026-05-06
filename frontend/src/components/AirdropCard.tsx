"use client";

import { useEffect, useMemo, useState } from "react";
import { parseUnits } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";

import { erc20Abi } from "@/contracts/abis/erc20";
import { contractAddresses } from "@/contracts/addresses";
import { useWriteWithStatus } from "@/hooks/useWriteWithStatus";

const TOKEN_A = contractAddresses.tokenA;
const AIRDROP_AMOUNT_WEI = parseUnits("1000", 18);
const AIRDROP_MAX_USERS = 1000n;
const AIRDROP_MAX_SUPPLY_WEI = AIRDROP_AMOUNT_WEI * AIRDROP_MAX_USERS;
const STORAGE_KEY = "dualpool-airdrop-claimed-v1";

type Props = {
  onClaimed?: () => Promise<void> | void;
};

export function AirdropCard({ onClaimed }: Props) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const flow = useWriteWithStatus();
  const [claimedSet, setClaimedSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw) as string[];
      if (!Array.isArray(arr)) return;
      setClaimedSet(new Set(arr.map((v) => v.toLowerCase())));
    } catch {
      setClaimedSet(new Set());
    }
  }, []);

  const { data: totalSupply = 0n, refetch: refetchTotalSupply } = useReadContract({
    address: TOKEN_A,
    abi: erc20Abi,
    functionName: "totalSupply",
  });

  const { data: tokenABalance = 0n, refetch: refetchBalance } = useReadContract({
    address: TOKEN_A,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const lowerAddr = address?.toLowerCase();
  const isClaimedLocal = Boolean(lowerAddr && claimedSet.has(lowerAddr));
  const reachedCap = totalSupply >= AIRDROP_MAX_SUPPLY_WEI;
  const canClaimByBalance = tokenABalance < AIRDROP_AMOUNT_WEI;
  const busy = flow.state !== "idle";

  const disabledReason = useMemo(() => {
    if (!address) return "请先连接钱包";
    if (busy) return "交易处理中";
    if (reachedCap) return "空投名额已满（1000/1000）";
    if (isClaimedLocal) return "该地址已领取过空投";
    if (!canClaimByBalance) return "该地址已持有空投额度（>= 1000 TokenA）";
    return null;
  }, [address, busy, reachedCap, isClaimedLocal, canClaimByBalance]);

  const persistClaimed = (addr: string) => {
    const next = new Set(claimedSet);
    next.add(addr.toLowerCase());
    setClaimedSet(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    }
  };

  const onClaim = async () => {
    if (!address || disabledReason) return;
    try {
      await flow.executeWrite(
        {
          actionLabel: "Claim TokenA Airdrop",
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
            address: TOKEN_A,
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

  // 已领取用户不再展示空投模块（本地记录或余额达到空投额度均视为已领）。
  if (address && (isClaimedLocal || !canClaimByBalance)) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-sky-200 sm:text-base">新用户空投（TokenA）</h2>
        <span className="rounded-full border border-sky-500/30 bg-zinc-950 px-2 py-0.5 text-xs text-sky-200">
          限前 1000 地址
        </span>
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        首次连接钱包可领取 <span className="font-mono text-zinc-200">1000 TokenA</span>。当前剩余额度（按链上总量估算）：
        <span className="ml-1 font-mono text-zinc-200">{remaining.toString()}</span>
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => void onClaim()}
          disabled={Boolean(disabledReason)}
          className="min-h-[44px] w-full rounded-lg bg-sky-400 px-3 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          {busy ? "Pending…" : "领取 1000 TokenA"}
        </button>
        {disabledReason ? <span className="text-xs text-zinc-500">{disabledReason}</span> : null}
      </div>
    </div>
  );
}

