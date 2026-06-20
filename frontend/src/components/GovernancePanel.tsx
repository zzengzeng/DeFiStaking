"use client";

import { useState } from "react";
import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";

import { ConfirmActionModal } from "@/components/ConfirmActionModal";
import { ConsoleButton } from "@/components/console/ConsoleButton";
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
import { isTxBusy } from "@/lib/txFlowTypes";
import { UI_COPY } from "@/lib/uiCopy";

const GOV_TIMELOCK_HELPER =
  "参数类变更走 48h TimelockController；模块/角色超级路径走 72h Timelock。流程均为 PROPOSER schedule → 等待 minDelay → EXECUTOR execute → DualPoolStakingAdmin → 核心。";

const TOOLTIP_PAUSE =
  "暂停会阻止用户侧状态变更（质押、领取、复利、普通赎回等）。本金与已累积奖励仍留在合约中，不会自动清算，但用户在恢复前无法操作资金。";

const TOOLTIP_EMERGENCY =
  "紧急模式会收窄退出路径：锁仓池仅可紧急退出（放弃奖励，本金走紧急路径）；灵活池在同一全局标志下按合约规则处理。资金仍在链上，但经济敞口会变化——启用前请仔细评估。";

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
  const tlGov = useTimelockGovernanceRoles(governanceAddresses.timelock);
  const tlSuper = useTimelockGovernanceRoles(governanceAddresses.timelockSuper);
  const flow = useWriteWithStatus();

  const [confirm, setConfirm] = useState<{ kind: "pause" | "emergency" | null }>({ kind: null });

  const { data: minDelayGovOnChain } = useReadContract({
    address: governanceAddresses.timelock,
    abi: timelockControllerAbi,
    functionName: "getMinDelay",
    query: { staleTime: 60_000, refetchOnWindowFocus: false },
  });
  const { data: minDelaySuperOnChain } = useReadContract({
    address: governanceAddresses.timelockSuper,
    abi: timelockControllerAbi,
    functionName: "getMinDelay",
    query: {
      enabled: governanceAddresses.timelockSuper !== "0x0000000000000000000000000000000000000000",
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  });

  const minDelayGovernance = minDelayGovOnChain ?? BigInt(sepoliaDeploymentMeta.timelockMinDelaySeconds);
  const minDelaySuper = minDelaySuperOnChain ?? BigInt(sepoliaDeploymentMeta.timelockSuperMinDelaySeconds);
  const govBusy = isTxBusy(flow.state);
  const canTimelockPanel =
    tlGov.canPropose ||
    tlGov.canExecute ||
    tlGov.canCancel ||
    tlSuper.canPropose ||
    tlSuper.canExecute ||
    tlSuper.canCancel;

  const afterTx = async () => {
    await Promise.all([staking.refetchAll(), refetchRoles(), tlGov.refetchTimelockRoles(), tlSuper.refetchTimelockRoles()]);
  };

  const callCore = async (label: string, functionName: string, args: readonly unknown[] = []) => {
    try {
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
    } finally {
      flow.reset();
    }
  };

  return (
    <div className="min-w-0 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 sm:p-5">
      <h3 className="text-lg font-semibold text-zinc-100">治理</h3>
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
        <section className="space-y-3 overflow-visible rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 sm:p-4">
          <h4 className="text-sm font-semibold text-amber-100/95">运营（OPERATOR_ROLE · 直连核心）</h4>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            热路径（0h）：<span className="font-mono text-zinc-400">pause</span>、<span className="font-mono text-zinc-400">enableEmergencyMode</span>、
            <span className="font-mono text-zinc-400">notifyRewardAmountA/B</span>。奖励注入见下方；参数变更走 Timelock（≥48h）。
          </p>
          <div className="flex flex-col gap-3 overflow-visible sm:flex-row sm:flex-wrap sm:items-stretch">
            <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:max-w-[min(100%,280px)]">
              <ConsoleButton
                fullWidth
                variant="danger"
                onClick={() => setConfirm({ kind: "pause" })}
                className="sm:flex-none"
              >
                暂停
              </ConsoleButton>
              <InfoTip text={TOOLTIP_PAUSE} aria-label="暂停影响说明" side="bottom" />
            </div>
            <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:max-w-[min(100%,320px)]">
              <ConsoleButton
                fullWidth
                variant="danger"
                onClick={() => setConfirm({ kind: "emergency" })}
                className="bg-gradient-to-r from-orange-300 to-amber-300 hover:from-orange-200 hover:to-amber-200 sm:flex-none"
              >
                开启紧急模式
              </ConsoleButton>
              <InfoTip text={TOOLTIP_EMERGENCY} aria-label="紧急模式影响说明" side="bottom" />
            </div>
          </div>
          <OperatorNotifyRewardsSection onRefresh={afterTx} />
        </section>
      ) : null}

      {canTimelockPanel ? (
        <>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400">
            <div>{UI_COPY.timelock.roleSchedule}</div>
            <div>{UI_COPY.timelock.roleExecute}</div>
            <div>{UI_COPY.timelock.roleCancel}</div>
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
                  治理 Timelock minDelay: {minDelayGovernance.toString()}s · 超级 Timelock: {minDelaySuper.toString()}s
                </p>
                <AddrRow chainId={chainId} label="DualPoolStaking（当前）" addr={contractAddresses.staking} />
                <AddrRow chainId={chainId} label="TokenA" addr={contractAddresses.tokenA} />
                <AddrRow chainId={chainId} label="TokenB" addr={contractAddresses.tokenB} />
                <AddrRow chainId={chainId} label="DualPoolStakingAdmin（门面）" addr={governanceAddresses.adminFacade} />
                <AddrRow chainId={chainId} label="Timelock（参数 48h）" addr={governanceAddresses.timelock} />
                <AddrRow chainId={chainId} label="Timelock（超级 72h）" addr={governanceAddresses.timelockSuper} />
                <AddrRow chainId={chainId} label="DualPoolUserModule" addr={sepoliaAuxAddresses.dualPoolUserModule} />
                <AddrRow chainId={chainId} label="DualPoolAdminModule" addr={sepoliaAuxAddresses.dualPoolAdminModule} />
                <AddrRow chainId={chainId} label="OPERATOR_ROLE（参考）" addr={sepoliaAuxAddresses.operatorRoleHolder} />
              </div>
            </details>
          ) : null}

          <GovernanceTimelockCards
            minDelayGovernance={minDelayGovernance}
            minDelaySuper={minDelaySuper}
            tlGovernance={{ canPropose: tlGov.canPropose, canExecute: tlGov.canExecute, canCancel: tlGov.canCancel }}
            tlSuper={{ canPropose: tlSuper.canPropose, canExecute: tlSuper.canExecute, canCancel: tlSuper.canCancel }}
            staking={staking}
            onAfterTx={afterTx}
          />
        </>
      ) : null}

      <ConfirmActionModal
        open={confirm.kind === "pause"}
        title="确认暂停？"
        rows={[
          { label: "操作", value: "pause()" },
          { label: "影响", value: "将暂停协议交互，直至治理恢复。" },
        ]}
        warning={TOOLTIP_PAUSE}
        confirmText="确认暂停"
        variant="danger"
        busy={govBusy}
        onClose={() => !govBusy && setConfirm({ kind: null })}
        onConfirm={async () => {
          try {
            await callCore("暂停协议", "pause", []);
            setConfirm({ kind: null });
          } catch {
            /* handled */
          }
        }}
      />
      <ConfirmActionModal
        open={confirm.kind === "emergency"}
        title="确认开启紧急模式？"
        rows={[{ label: "操作", value: "enableEmergencyMode()" }]}
        warning={TOOLTIP_EMERGENCY}
        confirmText="确认开启"
        variant="danger"
        busy={govBusy}
        onClose={() => !govBusy && setConfirm({ kind: null })}
        onConfirm={async () => {
          try {
            await callCore("开启紧急模式", "enableEmergencyMode", []);
            setConfirm({ kind: null });
          } catch {
            /* handled */
          }
        }}
      />
    </div>
  );
}
