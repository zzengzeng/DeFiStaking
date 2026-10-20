"use client";

import { useState } from "react";
import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";

import { ConfirmActionModal } from "@/components/ConfirmActionModal";
import { ConsoleButton } from "@/components/console/ConsoleButton";
import { ConsoleStatusBadge } from "@/components/console/ConsoleStatusBadge";
import { GovernanceTimelockCards } from "@/components/GovernanceTimelockCards";
import { InfoTip } from "@/components/InfoTip";
import { OperatorNotifyRewardsSection } from "@/components/OperatorNotifyRewardsSection";
import { TimelockQueue } from "@/components/TimelockQueue";
import { dualPoolStakingAbi } from "@/contracts/abis/dualPoolStaking";
import { timelockControllerAbi } from "@/contracts/abis/timelockController";
import { contractAddresses, governanceAddresses, sepoliaAuxAddresses, sepoliaDeploymentMeta } from "@/contracts/addresses";
import { useProtocolRoles } from "@/hooks/useProtocolRoles";
import { useStaking } from "@/hooks/useStaking";
import { useTimelockOps } from "@/hooks/useTimelockOps";
import { useTimelockGovernanceRoles } from "@/hooks/useTimelockGovernanceRoles";
import { useWriteWithStatus } from "@/hooks/useWriteWithStatus";
import { getAddressExplorerUrl } from "@/lib/explorerLink";
import { useI18n } from "@/lib/i18n";
import { isTxBusy } from "@/lib/txFlowTypes";
import { useUiCopy } from "@/lib/uiCopy";

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

function QueueSummaryTile({ label, value, tone }: { label: string; value: number; tone: "muted" | "warn" | "good" }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-zinc-500">{label}</div>
        <ConsoleStatusBadge tone={tone} className="min-w-0 px-2">
          {value}
        </ConsoleStatusBadge>
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold text-zinc-100">{value}</div>
    </div>
  );
}

export function GovernancePanel() {
  const { t } = useI18n();
  const ui = useUiCopy();
  const { address } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();
  const staking = useStaking();
  const { isOperator, refetchRoles } = useProtocolRoles();
  const tlGov = useTimelockGovernanceRoles(governanceAddresses.timelock);
  const tlSuper = useTimelockGovernanceRoles(governanceAddresses.timelockSuper);
  const timelockOps = useTimelockOps();
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
  const ops = timelockOps.data ?? [];
  const queueStats = ops.reduce(
    (acc, op) => {
      if (op.state === "READY") acc.ready += 1;
      else if (op.state === "CREATED") acc.pending += 1;
      else if (op.state === "EXECUTED") acc.executed += 1;
      else if (op.state === "CANCELLED") acc.cancelled += 1;
      return acc;
    },
    { pending: 0, ready: 0, executed: 0, cancelled: 0 },
  );

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

  const desc =
    isOperator && canTimelockPanel
      ? t("governance.descBoth")
      : isOperator
        ? t("governance.descOperator")
        : canTimelockPanel
          ? t("governance.descTimelock")
          : t("governance.descNone");

  return (
    <div className="min-w-0 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 sm:p-5">
      <h3 className="text-lg font-semibold text-zinc-100">{t("governance.title")}</h3>
      <p className="text-xs leading-relaxed text-zinc-500">{desc}</p>

      {isOperator ? (
        <section className="space-y-3 overflow-visible rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 sm:p-4">
          <h4 className="text-sm font-semibold text-amber-100/95">{t("governance.operatorSectionTitle")}</h4>
          <p className="text-[11px] leading-relaxed text-zinc-500">{t("governance.operatorSectionDesc")}</p>
          <div className="flex flex-col gap-3 overflow-visible sm:flex-row sm:flex-wrap sm:items-stretch">
            <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:max-w-[min(100%,280px)]">
              <ConsoleButton
                fullWidth
                variant="danger"
                onClick={() => setConfirm({ kind: "pause" })}
                className="sm:flex-none"
              >
                {t("governance.pause")}
              </ConsoleButton>
              <InfoTip text={t("governance.pauseTooltip")} aria-label={t("governance.pauseAriaLabel")} side="bottom" />
            </div>
            <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:max-w-[min(100%,320px)]">
              <ConsoleButton
                fullWidth
                variant="danger"
                onClick={() => setConfirm({ kind: "emergency" })}
                className="bg-gradient-to-r from-orange-300 to-amber-300 hover:from-orange-200 hover:to-amber-200 sm:flex-none"
              >
                {t("governance.enableEmergency")}
              </ConsoleButton>
              <InfoTip text={t("governance.emergencyTooltip")} aria-label={t("governance.emergencyAriaLabel")} side="bottom" />
            </div>
          </div>
          <OperatorNotifyRewardsSection onRefresh={afterTx} />
        </section>
      ) : null}

      {canTimelockPanel ? (
        <>
          <section className="space-y-3 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h4 className="font-mono text-sm font-semibold text-zinc-100">{t("governance.queueTitle")}</h4>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">{t("governance.queueDesc")}</p>
              </div>
              <button
                type="button"
                onClick={() => void timelockOps.refetch()}
                disabled={timelockOps.isFetching}
                className="min-h-[34px] rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-amber-400/40 disabled:opacity-50"
              >
                {timelockOps.isFetching ? t("governance.refreshingQueue") : t("governance.refreshQueue")}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <QueueSummaryTile label={t("governance.queuePending")} value={queueStats.pending} tone={queueStats.pending > 0 ? "warn" : "muted"} />
              <QueueSummaryTile label={t("governance.queueReady")} value={queueStats.ready} tone={queueStats.ready > 0 ? "good" : "muted"} />
              <QueueSummaryTile label={t("governance.queueExecuted")} value={queueStats.executed} tone="muted" />
              <QueueSummaryTile label={t("governance.queueCancelled")} value={queueStats.cancelled} tone={queueStats.cancelled > 0 ? "warn" : "muted"} />
            </div>
            {timelockOps.isError ? (
              <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                {t("governance.queueIndexError")}
              </div>
            ) : null}
            <TimelockQueue ops={ops} isLoading={timelockOps.isLoading} />
          </section>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400">
            <div>{ui.timelock.roleSchedule}</div>
            <div>{ui.timelock.roleExecute}</div>
            <div>{ui.timelock.roleCancel}</div>
          </div>

          <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 px-3 py-2.5 text-xs leading-relaxed text-sky-100/95">{t("governance.timelockHelper")}</div>

          <p className="text-xs text-zinc-500">{t("governance.fullConfigHint")}</p>

          {chainId === sepolia.id ? (
            <details className="rounded-lg border border-zinc-800 bg-zinc-950/80 text-xs text-zinc-300">
              <summary className="cursor-pointer select-none px-3 py-2 font-medium text-zinc-200 hover:bg-zinc-900/80">
                {t("governance.sepoliaAddressesTitle")}
              </summary>
              <div className="border-t border-zinc-800 px-3 pb-3 pt-2">
                <p className="mb-2 text-[11px] text-zinc-500">
                  {t("governance.sepoliaMinDelay", {
                    govDelay: minDelayGovernance.toString(),
                    superDelay: minDelaySuper.toString(),
                  })}
                </p>
                <AddrRow chainId={chainId} label={t("governance.addrDualPoolStaking")} addr={contractAddresses.staking} />
                <AddrRow chainId={chainId} label={t("governance.addrTokenA")} addr={contractAddresses.tokenA} />
                <AddrRow chainId={chainId} label={t("governance.addrTokenB")} addr={contractAddresses.tokenB} />
                <AddrRow chainId={chainId} label={t("governance.addrAdminFacade")} addr={governanceAddresses.adminFacade} />
                <AddrRow chainId={chainId} label={t("governance.addrTimelock48h")} addr={governanceAddresses.timelock} />
                <AddrRow chainId={chainId} label={t("governance.addrTimelock72h")} addr={governanceAddresses.timelockSuper} />
                <AddrRow chainId={chainId} label={t("governance.addrUserModule")} addr={sepoliaAuxAddresses.dualPoolUserModule} />
                <AddrRow chainId={chainId} label={t("governance.addrAdminModule")} addr={sepoliaAuxAddresses.dualPoolAdminModule} />
                <AddrRow chainId={chainId} label={t("governance.addrOperatorRole")} addr={sepoliaAuxAddresses.operatorRoleHolder} />
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
        title={t("governance.confirmPauseTitle")}
        rows={[
          { label: t("governance.rowAction"), value: t("governance.confirmPauseAction") },
          { label: t("governance.rowImpact"), value: t("governance.confirmPauseImpact") },
        ]}
        warning={t("governance.pauseTooltip")}
        confirmText={t("governance.confirmPauseBtn")}
        variant="danger"
        busy={govBusy}
        onClose={() => !govBusy && setConfirm({ kind: null })}
        onConfirm={async () => {
          try {
            await callCore(t("governance.confirmPauseTxLabel"), "pause", []);
            setConfirm({ kind: null });
          } catch {
            /* handled */
          }
        }}
      />
      <ConfirmActionModal
        open={confirm.kind === "emergency"}
        title={t("governance.confirmEmergencyTitle")}
        rows={[{ label: t("governance.rowAction"), value: t("governance.confirmEmergencyAction") }]}
        warning={t("governance.emergencyTooltip")}
        confirmText={t("governance.confirmEmergencyBtn")}
        variant="danger"
        busy={govBusy}
        onClose={() => !govBusy && setConfirm({ kind: null })}
        onConfirm={async () => {
          try {
            await callCore(t("governance.confirmEmergencyTxLabel"), "enableEmergencyMode", []);
            setConfirm({ kind: null });
          } catch {
            /* handled */
          }
        }}
      />
    </div>
  );
}
