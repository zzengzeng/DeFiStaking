"use client";

/**
 * 根布局 Provider：动态加载 Web3（避免 SSR 访问 window），
 * 再经 AppShell 按路径切换 ProductShell / ConsoleShell。
 */
import dynamic from "next/dynamic";

import { AppShell } from "@/components/AppShell";
import { Web3LoadingFallback } from "@/components/Web3LoadingFallback";

type Props = {
  children: React.ReactNode;
};

const Web3Provider = dynamic(() => import("@/providers/Web3Provider").then((m) => m.Web3Provider), {
  ssr: false,
  loading: () => <Web3LoadingFallback />,
});

export function Providers({ children }: Props) {
  return (
    <Web3Provider>
      <AppShell>{children}</AppShell>
    </Web3Provider>
  );
}
