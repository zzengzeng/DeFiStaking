"use client";

import { TxActivityScopeSync } from "@/components/TxActivityScopeSync";
import { TxCenterPanel } from "@/components/TxCenterPanel";
import { TxToastManager } from "@/components/TxToastManager";

export function TxFlowRoot() {
  return (
    <>
      <TxActivityScopeSync />
      <TxToastManager />
      <TxCenterPanel />
    </>
  );
}
