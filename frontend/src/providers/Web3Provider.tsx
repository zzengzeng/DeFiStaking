"use client";

/**
 * Wagmi + React Query + RainbowKit 根 Provider。
 * LocaleSync 负责 `<html lang>`；TxFlowRoot 挂载 Tx Center 全局 UI。
 */
import "@rainbow-me/rainbowkit/styles.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { darkTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { useState } from "react";
import { Toaster } from "sonner";
import { WagmiProvider } from "wagmi";

import { LocaleSync } from "@/components/LocaleSync";
import { TxFlowRoot } from "@/components/TxFlowRoot";
import { getWagmiConfig } from "@/config/wagmi";
import { rainbowKitLocale } from "@/lib/i18n";
import { useLocaleStore } from "@/store/useLocaleStore";

type Props = {
  children: React.ReactNode;
};

function RainbowShell({ children }: Props) {
  const locale = useLocaleStore((s) => s.locale);

  return (
    <RainbowKitProvider
      locale={rainbowKitLocale(locale)}
      theme={darkTheme({
        accentColor: "#00a3ff",
        accentColorForeground: "#000000",
        borderRadius: "medium",
      })}
      appInfo={{ appName: "DualPool Staking" }}
    >
      {children}
      <TxFlowRoot />
    </RainbowKitProvider>
  );
}

export function Web3Provider({ children }: Props) {
  const [queryClient] = useState(() => new QueryClient());
  const [wagmiConfig] = useState(() => getWagmiConfig());

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <RainbowShell>
          <LocaleSync />
          {children}
        </RainbowShell>
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
