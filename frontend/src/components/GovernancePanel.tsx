"use client";

import { useState } from "react";
import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";

import { ConfirmActionModal } from "@/components/ConfirmActionModal";
import { GovernanceTimelockCards } from "@/components/GovernanceTimelockCards";
import { InfoTip } from "@/components/InfoTip";
import { OperatorNotifyRewardsSection } from "@/components/OperatorNotifyRewardsSection";
import { dualPoolStakingAbi } from "@/contracts/abis/dualPoolStaking";
import { timelockControllerAbi } from "@/contracts/abis/timelockController";
import { contractAddresses, governanceAddresses, sepoliaAuxAddresses, sepoliaDeploymentMeta } from "@/contracts/addresses";
import { useProtocolRoles } from "@/hooks/useProtocolRoles";
import { useStaking } from "@/hooks/useStaking";
import { useTimelockGovernanceRoles } from "@/hooks/useTimelockGovernanceRoles";
import { useWriteWithStatus } from "@/hooks/useWriteWithStatus";
import { getAddressExplorerUrl } from "@/lib/explorerLink";

const GOV_TIMELOCK_HELPER =
  "参数类变更走 OpenZeppelin TimelockController：PROPOSER 提交 schedule → 等待 minDelay → EXECUTOR 执行 execute。目标合约为 DualPoolStakingAdmin（onlyOwner），由 Timelock 作为 owner 调用核心。";

const TOOLTIP_PAUSE =
  "Pause stops state-changing user flows (e.g. stake, claim, compound, normal withdrawals). Principal and accrued rewards stay in the contract — nothing is auto-liquidated — but users cannot move funds until governance unpauses.";

const TOOLTIP_EMERGENCY =
  "Emergency mode narrows exit options: Pool B moves to emergency-withdraw only (rewards are forfeited; principal exits via the emergency path). Pool A follows contract rules under the same global flag. User funds remain on-chain but economic exposure changes — review before enabling.";

function AddrRow({ chainId, label, addr }: { chainId: number; label: string; addr: string }) {
  const href = getAddressExplorerUrl(chainId, addr as `0x${string}`);
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-zinc-800/80 py-1.5 last:border-0">
      <span className="shrink-0 text-zinc-500">{label}</span>
      <a href={href} target="_blank" rel="noopener noreferrer" className="break-all font-mono text-sky-400/95 hover:underline">
        {addr}
      </a>
    </div>
  );
}

export function GovernancePanel() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();
  const staking = useStaking();
  const { isOperator, refetchRoles } = useProtocolRoles();
  const tl = useTimelockGovernanceRoles();
  const flow = useWriteWithStatus();

  const [confirm, setConfirm] = useState<{ kind: "pause" | "emergency" | null }>({ kind: null });

  const { data: minDelayOnChain } = useReadContract({
    address: governanceAddresses.timelock,
    abi: timelockControllerAbi,
    functionName: "getMinDelay",
    query: { staleTime: 60_000, refetchOnWindowFocus: false },
  });

  const minDelay = minDelayOnChain ?? BigInt(sepoliaDeploymentMeta.timelockMinDelaySeconds);
  const govBusy = flow.state !== "idle";
  const canTimelockPanel = tl.canPropose || tl.canExecute || tl.canCancel;

  const afterTx = async () => {
    await Promise.all([staking.refetchAll(), refetchRoles(), tl.refetchTimelockRoles()]);
  };

  const callCore = async (label: string, functionName: string, args: readonly unknown[] = []) => {
    await flow.executeWrite(
      {
        actionLabel: label,
        txType: "governance",
        description: functionName,
        onConfirmed: afterTx,
      },
      () =>
        writeContractAsync({
          abi: dualPoolStakingAbi,
          address: contractAddresses.staking,
          functionName: functionName as never,
          args: args as never,
          account: address,
        }),
    );
    flow.reset({ closeGlobal: true });
  };

  return (
    <div className="min-w-0 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 sm:p-5">
      <h3 className="text-lg font-semibold text-zinc-100">Governance</h3>
      <p className="text-xs leading-relaxed text-zinc-500">
        {isOperator && canTimelockPanel
          ? "当前钱包同时具备 Timelock 治理角色与核心 OPERATOR_ROLE：下方分别展示运营热操作与 Timelock 调度。"
          : isOperator
            ? "当前钱包具备 OPERATOR_ROLE：仅可直连核心执行 pause / 紧急模式等热路径。"
            : canTimelockPanel
              ? "当前钱包具备 TimelockController 的 PROPOSER / EXECUTOR / CANCELLER 之一：可通过 schedule / execute 驱动 DualPoolStakingAdmin 调用核心。"
              : "当前钱包未检测到 Timelock 治理角色或 OPERATOR_ROLE。"}
      </p>

      {isOperator ? (
        <section className="space-y-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 sm:p-4">
          <h4 className="text-sm font-semibold text-amber-100/95">运营（OPERATOR_ROLE · 直连核心）</h4>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            热路径（0h）：<span className="font-mono text-zinc-400">pause</span>、<span className="font-mono text-zinc-400">enableEmergencyMode</span>、
            <span className="font-mono text-zinc-400">notifyRewardAmountA/B</span>。奖励注入见下方；参数变更走 Timelock（≥48h）。
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-stretch">
            <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:max-w-[min(100%,280px)]">
              <button
                type="button"
                title={TOOLTIP_PAUSE}
                onClick={() => setConfirm({ kind: "pause" })}
                className="min-h-[44px] flex-1 rounded-lg bg-gradient-to-r from-red-400 to-rose-400 px-3 py-2 text-sm font-semibold text-black transition hover:opacity-90 sm:flex-none"
              >
                Pause
              </button>
              <InfoTip text={TOOLTIP_PAUSE} aria-label="Pause impact" />
            </div>
            <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:max-w-[min(100%,320px)]">
              <button
                type="button"
                title={TOOLTIP_EMERGENCY}
                onClick={() => setConfirm({ kind: "emergency" })}
                className="min-h-[44px] flex-1 rounded-lg bg-gradient-to-r from-orange-300 to-amber-300 px-3 py-2 text-sm font-semibold text-black transition hover:opacity-90 sm:flex-none"
              >
                Enable Emergency
              </button>
              <InfoTip text={TOOLTIP_EMERGENCY} aria-label="Emergency mode impact" />
            </div>
          </div>
          <OperatorNotifyRewardsSection onRefresh={afterTx} />
        </section>
      ) : null}

      {canTimelockPanel ? (
        <>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400">
            <div>Schedule：需要 Timelock `PROPOSER_ROLE`。</div>
            <div>Execute：需要 Timelock `EXECUTOR_ROLE`（到达 minDelay 后）。</div>
            <div>Cancel：需要 Timelock `CANCELLER_ROLE`（操作仍在 pending 时）。</div>
          </div>

          <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 px-3 py-2.5 text-xs leading-relaxed text-sky-100/95">{GOV_TIMELOCK_HELPER}</div>

          <p className="text-xs text-zinc-500">
            下方为完整 Timelock 配置（23 项），按 Tab 分组展示。若你只看到 6 张卡片且无 Tab 栏，请确认访问的是当前{" "}
            <span className="font-mono text-zinc-400">yarn dev</span> 终端里打印的 Local 地址（端口被占用时会变成 3001/3002）。
          </p>

          {chainId === sepolia.id ? (
            <details className="rounded-lg border border-zinc-800 bg-zinc-950/80 text-xs text-zinc-300">
              <summary className="cursor-pointer select-none px-3 py-2 font-medium text-zinc-200 hover:bg-zinc-900/80">
                Sepolia 部署地址（与默认配置一致时可对照）
              </summary>
              <div className="border-t border-zinc-800 px-3 pb-3 pt-2">
                <p className="mb-2 text-[11px] text-zinc-500">
                  Timelock minDelay（链上）: {minDelay.toString()}s · 可用环境变量覆盖{" "}
                  <code className="text-zinc-400">NEXT_PUBLIC_TIMELOCK_CONTROLLER_ADDRESS</code> /{" "}
                  <code className="text-zinc-400">NEXT_PUBLIC_STAKING_ADMIN_FACADE_ADDRESS</code>
                </p>
                <AddrRow chainId={chainId} label="DualPoolStaking（当前）" addr={contractAddresses.staking} />
                <AddrRow chainId={chainId} label="TokenA" addr={contractAddresses.tokenA} />
                <AddrRow chainId={chainId} label="TokenB" addr={contractAddresses.tokenB} />
                <AddrRow chainId={chainId} label="DualPoolStakingAdmin（门面）" addr={governanceAddresses.adminFacade} />
                <AddrRow chainId={chainId} label="TimelockController" addr={governanceAddresses.timelock} />
                <AddrRow chainId={chainId} label="DualPoolUserModule" addr={sepoliaAuxAddresses.dualPoolUserModule} />
                <AddrRow chainId={chainId} label="DualPoolAdminModule" addr={sepoliaAuxAddresses.dualPoolAdminModule} />
                <AddrRow chainId={chainId} label="OPERATOR_ROLE（参考）" addr={sepoliaAuxAddresses.operatorRoleHolder} />
              </div>
            </details>
          ) : null}

          <GovernanceTimelockCards
            minDelay={minDelay}
            tl={{ canPropose: tl.canPropose, canExecute: tl.canExecute, canCancel: tl.canCancel }}
            staking={staking}
            onAfterTx={afterTx}
          />
        </>
      ) : null}

      <ConfirmActionModal
        open={confirm.kind === "pause"}
        title="Confirm Pause?"
        rows={[
          { label: "Action", value: "pause()" },
          { label: "Impact", value: "This will stop protocol interactions until resumed." },
        ]}
        warning={TOOLTIP_PAUSE}
        confirmText="Confirm Pause"
        variant="danger"
        busy={govBusy}
        onClose={() => !govBusy && setConfirm({ kind: null })}
        onConfirm={async () => {
          try {
            await callCore("pause", "pause", []);
            setConfirm({ kind: null });
          } catch {
            /* handled */
          }
        }}
      />
      <ConfirmActionModal
        open={confirm.kind === "emergency"}
        title="Confirm Emergency Mode?"
        rows={[{ label: "Action", value: "enableEmergencyMode()" }]}
        warning={TOOLTIP_EMERGENCY}
        confirmText="Confirm enable"
        variant="danger"
        busy={govBusy}
        onClose={() => !govBusy && setConfirm({ kind: null })}
        onConfirm={async () => {
          try {
            await callCore("enableEmergencyMode", "enableEmergencyMode", []);
            setConfirm({ kind: null });
          } catch {
            /* handled */
          }
        }}
      />
    </div>
  );
}
