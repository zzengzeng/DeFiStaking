"use client";

import { useI18n } from "@/lib/i18n";

/** Web3Provider 动态加载占位 */
export function Web3LoadingFallback() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-sm">{t("common.loadingWallet")}</div>
    </div>
  );
}
