"use client";

import { TxCenterPanel } from "@/components/TxCenterPanel";
import { TxToastManager } from "@/components/TxToastManager";

export function TxFlowRoot() {
  return (
    <>
      <TxToastManager />
      <TxCenterPanel />
    </>
  );
}
