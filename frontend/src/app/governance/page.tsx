"use client";

import { GovernancePanel } from "@/components/GovernancePanel";
import { useProtocolRoles } from "@/hooks/useProtocolRoles";
import { useTimelockGovernanceRoles } from "@/hooks/useTimelockGovernanceRoles";

export default function GovernancePage() {
  const { address, isOperator, isLoading: coreRolesLoading } = useProtocolRoles();
  const { canAccessTimelockGovernance, isLoading: tlRolesLoading } = useTimelockGovernanceRoles();

  const loading = coreRolesLoading || tlRolesLoading;
  const canEnter = Boolean(address && (isOperator || canAccessTimelockGovernance));

  if (!address) {
    return (
      <div className="min-w-0 space-y-4 sm:space-y-5">
        <h1 className="text-lg font-semibold text-zinc-100 sm:text-xl">Governance</h1>
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-6 text-sm text-zinc-400">
          请先连接钱包。该页包含两类能力：<span className="font-mono text-zinc-300">TimelockController</span> 的治理角色（PROPOSER / EXECUTOR / CANCELLER）与{" "}
          <span className="font-mono text-zinc-300">DualPoolStaking</span> 的 <span className="font-mono text-zinc-300">OPERATOR_ROLE</span>（热路径）。
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-w-0 space-y-4 sm:space-y-5">
        <h1 className="text-lg font-semibold text-zinc-100 sm:text-xl">Governance</h1>
        <p className="text-sm text-zinc-500">正在读取链上角色…</p>
      </div>
    );
  }

  if (!canEnter) {
    return (
      <div className="min-w-0 space-y-4 sm:space-y-5">
        <h1 className="text-lg font-semibold text-zinc-100 sm:text-xl">Governance</h1>
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-6 text-sm text-zinc-400">
          当前连接钱包不具备 <span className="font-mono text-zinc-300">TimelockController</span> 的治理角色（PROPOSER / EXECUTOR / CANCELLER），也不具备核心的{" "}
          <span className="font-mono text-zinc-300">OPERATOR_ROLE</span>。普通用户请使用 Dashboard 与 Pool 页面进行质押与赎回。
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4 sm:space-y-5">
      <h1 className="text-lg font-semibold text-zinc-100 sm:text-xl">Governance</h1>
      <GovernancePanel />
    </div>
  );
}
