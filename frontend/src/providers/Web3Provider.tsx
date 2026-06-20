"use client";

import "@rainbow-me/rainbowkit/styles.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { darkTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { useState } from "react";
import { Toaster } from "sonner";
import { WagmiProvider } from "wagmi";

import { wagmiConfig } from "@/config/wagmi";
import { TxFlowRoot } from "@/components/TxFlowRoot";

type Props = {
  children: React.ReactNode;
};

export function Web3Provider({ children }: Props) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          locale="zh-CN"
          theme={darkTheme({
            accentColor: "#7c9cff",
            accentColorForeground: "#0d0d0d",
            borderRadius: "medium",
          })}
          appInfo={{ appName: "DualPool Staking" }}
        >
          {children}
          <TxFlowRoot />
        </RainbowKitProvider>
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
