"use client";

import { AppShell } from "@/components/AppShell";
import { Web3Provider } from "@/providers/Web3Provider";

type Props = {
  children: React.ReactNode;
};

export function Providers({ children }: Props) {
  return (
    <Web3Provider>
      <AppShell>{children}</AppShell>
    </Web3Provider>
  );
}
