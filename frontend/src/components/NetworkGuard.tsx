"use client";

import { useAccount, useSwitchChain } from "wagmi";

import { appChain, appChainLabel } from "@/config/chains";
import { useI18n } from "@/lib/i18n";

/** 钱包已连接但链不正确时提示切换 */
export function NetworkGuard() {
  const { isConnected, chain } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const { t } = useI18n();

  if (!isConnected || !chain || chain.id === appChain.id) return null;

  return (
    <div
      role="alert"
      className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between"
    >
      <p>
        {t("network.wrongChain", { chain: chain.name, target: appChainLabel })}
      </p>
      <button
        type="button"
        disabled={isPending}
        onClick={() => switchChain({ chainId: appChain.id })}
        className="shrink-0 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:opacity-50"
      >
        {isPending ? t("network.switching") : t("network.switch", { target: appChainLabel })}
      </button>
    </div>
  );
}
