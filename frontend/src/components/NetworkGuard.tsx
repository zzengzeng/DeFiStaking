"use client";

import { useAccount, useSwitchChain } from "wagmi";

import { appChain, appChainLabel } from "@/config/chains";

/** 钱包已连接但链不正确时提示切换 */
export function NetworkGuard() {
  const { isConnected, chain } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected || !chain || chain.id === appChain.id) return null;

  return (
    <div
      role="alert"
      className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between"
    >
      <p>
        当前钱包网络为 <span className="font-semibold">{chain.name}</span>，请切换到{" "}
        <span className="font-semibold">{appChainLabel}</span> 后再操作。
      </p>
      <button
        type="button"
        disabled={isPending}
        onClick={() => switchChain({ chainId: appChain.id })}
        className="shrink-0 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
      >
        {isPending ? "切换中…" : `切换到 ${appChainLabel}`}
      </button>
    </div>
  );
}
