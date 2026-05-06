"use client";

import { useEffect, useMemo, useState } from "react";
import { keccak256 } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";

import { ConfirmActionModal } from "@/components/ConfirmActionModal";
import { TimelockStatus } from "@/components/TimelockStatus";
import { timelockControllerAbi } from "@/contracts/abis/timelockController";
import { governanceAddresses } from "@/contracts/addresses";
import type { TimelockIndexedOp } from "@/hooks/useTimelockOps";
import { useWriteWithStatus } from "@/hooks/useWriteWithStatus";

const ZERO_PREDECESSOR = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/** OZ TimelockController.OperationState */
const OZ_UNSET = 0;
const OZ_WAITING = 1;
const OZ_READY = 2;
const OZ_DONE = 3;

type Props = {
  title: string;
  hint: string;
  /** `DualPoolStakingAdmin` 上 `encodeFunctionData` 得到的 calldata */
  payload: `0x${string}`;
  minDelay: bigint;
  canPropose: boolean;
  canExecute: boolean;
  canCancel: boolean;
  /** Execute 前展示的摘要行 */
  executeRows?: () => { label: string; value: React.ReactNode }[];
  children: React.ReactNode;
  onAfterTx?: () => Promise<void>;
};

function mapOzToIndexedOp(
  state: number | undefined,
  ts: bigint | undefined,
  now: number,
): TimelockIndexedOp | undefined {
  if (state === undefined) return undefined;
  if (state === OZ_DONE) {
    return {
      opId: "0x",
      paramsHash: "0x",
      executeAfter: "0",
      state: "EXECUTED",
      createdBlock: "0",
      executedAt: String(now),
    };
  }
  if (ts === undefined) return undefined;
  if (state === OZ_UNSET) return undefined;
  const executeAfter = Number(ts);
  if (!Number.isFinite(executeAfter)) return undefined;
  const ready = state === OZ_READY || (state === OZ_WAITING && now >= executeAfter);
  return {
    opId: "0x",
    paramsHash: "0x",
    executeAfter: String(executeAfter),
    state: ready ? "READY" : "CREATED",
    createdBlock: "0",
  };
}

export function GovernanceCard({ title, hint, payload, minDelay, canPropose, canExecute, canCancel, executeRows, children, onAfterTx }: Props) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const flow = useWriteWithStatus();

  const timelock = governanceAddresses.timelock;
  const target = governanceAddresses.adminFacade;

  const salt = useMemo(() => keccak256(payload), [payload]);

  const idRead = useReadContract({
    address: timelock,
    abi: timelockControllerAbi,
    functionName: "hashOperation",
    args: [target, 0n, payload, ZERO_PREDECESSOR, salt],
    query: { enabled: Boolean(payload), staleTime: 5_000, refetchInterval: 5_000 },
  });

  const opId = idRead.data;

  const stateRead = useReadContract({
    address: timelock,
    abi: timelockControllerAbi,
    functionName: "getOperationState",
    args: opId ? [opId] : undefined,
    query: { enabled: Boolean(opId), staleTime: 3_000, refetchInterval: 3_000 },
  });

  const tsRead = useReadContract({
    address: timelock,
    abi: timelockControllerAbi,
    functionName: "getTimestamp",
    args: opId ? [opId] : undefined,
    query: { enabled: Boolean(opId), staleTime: 3_000, refetchInterval: 3_000 },
  });

  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const ozState = Number(stateRead.data ?? OZ_UNSET);

  const op = useMemo(() => mapOzToIndexedOp(ozState, tsRead.data, now), [ozState, tsRead.data, now]);

  const [executeOpen, setExecuteOpen] = useState(false);

  const status = useMemo(() => {
    if (ozState === OZ_UNSET) {
      return { canSchedule: canPropose && minDelay > 0n, canExecute: false, canCancel: false };
    }
    if (ozState === OZ_DONE) return { canSchedule: false, canExecute: false, canCancel: false };
    const tsNum = tsRead.data !== undefined ? Number(tsRead.data) : Number.NaN;
    const ready = ozState === OZ_READY || (ozState === OZ_WAITING && Number.isFinite(tsNum) && now >= tsNum);
    const pending = ozState === OZ_WAITING || ozState === OZ_READY;
    return { canSchedule: false, canExecute: ready && canExecute, canCancel: pending && canCancel };
  }, [canCancel, canExecute, canPropose, minDelay, now, ozState, tsRead.data]);

  const busy = flow.state !== "idle";

  const refresh = async () => {
    await Promise.all([idRead.refetch(), stateRead.refetch(), tsRead.refetch(), onAfterTx?.()]);
  };

  const schedule = async () => {
    if (!address) return;
    if (minDelay <= 0n) return;
    await flow.executeWrite(
      {
        actionLabel: `Timelock schedule: ${title}`,
        txType: "governance",
        description: "TimelockController.schedule",
        onConfirmed: refresh,
      },
      () =>
        writeContractAsync({
          address: timelock,
          abi: timelockControllerAbi,
          functionName: "schedule",
          args: [target, 0n, payload, ZERO_PREDECESSOR, salt, minDelay],
          account: address,
        }),
    );
    flow.reset({ closeGlobal: true });
  };

  const execute = async () => {
    if (!address) return;
    await flow.executeWrite(
      {
        actionLabel: `Timelock execute: ${title}`,
        txType: "governance",
        description: "TimelockController.execute",
        onConfirmed: refresh,
      },
      () =>
        writeContractAsync({
          address: timelock,
          abi: timelockControllerAbi,
          functionName: "execute",
          args: [target, 0n, payload, ZERO_PREDECESSOR, salt],
          account: address,
        }),
    );
    flow.reset({ closeGlobal: true });
  };

  const cancel = async () => {
    if (!address || !opId) return;
    await flow.executeWrite(
      {
        actionLabel: `Timelock cancel: ${title}`,
        txType: "governance",
        description: "TimelockController.cancel",
        onConfirmed: refresh,
      },
      () =>
        writeContractAsync({
          address: timelock,
          abi: timelockControllerAbi,
          functionName: "cancel",
          args: [opId],
          account: address,
        }),
    );
    flow.reset({ closeGlobal: true });
  };

  const formLocked = ozState === OZ_WAITING || ozState === OZ_READY;

  return (
    <div className="min-w-0 rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-950 to-zinc-950/60 p-3 text-sm shadow-[0_0_0_1px_rgba(255,255,255,0.02)] transition hover:border-zinc-700 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.05)] sm:p-4">
      <ConfirmActionModal
        open={executeOpen}
        title={`Execute: ${title}`}
        rows={executeRows?.()}
        warning="This executes the queued timelock action on-chain via TimelockController → DualPoolStakingAdmin → core."
        confirmText="Execute on-chain"
        busy={busy}
        onClose={() => !busy && setExecuteOpen(false)}
        onConfirm={async () => {
          try {
            await execute();
            setExecuteOpen(false);
          } catch {
            /* handled */
          }
        }}
      />
      <div className="mb-1 text-sm font-semibold text-zinc-100">{title}</div>
      <div className="mb-3 text-xs text-zinc-400">{hint}</div>
      <fieldset disabled={formLocked} className="mb-3 min-w-0 space-y-2 disabled:opacity-60">
        {children}
      </fieldset>
      {formLocked ? (
        <p className="mb-3 text-[11px] text-amber-200/90">该操作已排队或待执行：为避免 operationId 漂移，已暂时锁定表单输入。</p>
      ) : null}
      <div className="grid gap-2">
        <TimelockStatus op={op} />
        <div className="grid min-[420px]:grid-cols-3 grid-cols-1 gap-2">
          <button
            type="button"
            onClick={() => void schedule()}
            disabled={!status.canSchedule || busy}
            className="min-h-[40px] rounded-lg bg-zinc-200 px-3 py-1.5 text-black transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Pending…" : "Schedule"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!status.canExecute || busy) return;
              setExecuteOpen(true);
            }}
            disabled={!status.canExecute || busy}
            className="min-h-[40px] rounded-lg bg-emerald-300 px-3 py-1.5 text-black transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Execute
          </button>
          <button
            type="button"
            onClick={() => void cancel()}
            disabled={!status.canCancel || busy}
            className="min-h-[40px] rounded-lg border border-zinc-700 px-3 py-1.5 transition hover:border-zinc-600 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
