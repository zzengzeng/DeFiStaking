"use client";

import { useCallback } from "react";
import type { Hash } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { dualPoolStakingAbi } from "@/contracts/abis/dualPoolStaking";
import { contractAddresses } from "@/contracts/addresses";
import { CatchUpBlockedError } from "@/hooks/catchUpErrors";
import { useStaking } from "@/hooks/useStaking";
import { useTxCenter } from "@/hooks/useTxCenter";
import { useI18n } from "@/lib/i18n";
import {
  buildCrankBatchCalls,
  canPermissionlessCrank,
  CatchUpIncompleteError,
  multicall3Abi,
  MULTICALL3_ADDRESS,
  type PoolSide,
  poolSideToIndex,
  poolsNeedingCatchUp,
  runCatchUpUntilComplete,
  uniquePools,
} from "@/lib/poolCatchUp";

export { CatchUpBlockedError } from "@/hooks/catchUpErrors";
export { CatchUpIncompleteError };

type CrankSend = (pool: PoolSide) => Promise<Hash>;
type CrankBatchSend = (pools: readonly PoolSide[]) => Promise<Hash>;

function catchUpTxTitle(pools: readonly PoolSide[], t: ReturnType<typeof useI18n>["t"]): string {
  const ordered = uniquePools(pools);
  if (ordered.length >= 2) return t("txCenter.crankCatchUpBoth");
  const pool = ordered[0];
  const poolLabel = pool === "A" ? t("txCenter.poolFlexible") : t("txCenter.poolLocked");
  return t("txCenter.crankCatchUp", { pool: poolLabel });
}

/**
 * Runs permissionless `crankCatchUpPool` txs until requested pools reach `pool*CatchUpComplete`.
 * Batches A+B into one Multicall3 tx per round to avoid wallet-confirm drift between pools.
 */
export function usePoolCatchUpEnsurer() {
  const { t } = useI18n();
  const publicClient = usePublicClient();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { startTransaction } = useTxCenter();
  const staking = useStaking();

  const writeCrank = useCallback(
    async (pool: PoolSide): Promise<Hash> => {
      if (!address) throw new CatchUpBlockedError(t("errors.walletNotConnected"));
      return writeContractAsync({
        abi: dualPoolStakingAbi,
        address: contractAddresses.staking,
        functionName: "crankCatchUpPool",
        args: [poolSideToIndex(pool)],
        account: address,
      });
    },
    [address, t, writeContractAsync],
  );

  const writeCrankBatch = useCallback(
    async (pools: readonly PoolSide[]): Promise<Hash> => {
      if (!address) throw new CatchUpBlockedError(t("errors.walletNotConnected"));
      const calls = buildCrankBatchCalls(pools);
      if (calls.length === 0) throw new CatchUpBlockedError(t("errors.catchUpIncomplete"));
      if (calls.length === 1) {
        return writeCrank(uniquePools(pools)[0]!);
      }
      return writeContractAsync({
        abi: multicall3Abi,
        address: MULTICALL3_ADDRESS,
        functionName: "aggregate3",
        args: [calls],
        account: address,
      });
    },
    [address, t, writeContractAsync, writeCrank],
  );

  const ensureCatchUp = useCallback(
    async (
      pools: readonly PoolSide[],
      sendCrank: CrankSend = writeCrank,
      sendCrankBatch: CrankBatchSend = writeCrankBatch,
    ) => {
      if (!publicClient || pools.length === 0) return;

      const paused = staking.status === "PAUSED";
      const shutdown = staking.status === "SHUTDOWN";
      if (!canPermissionlessCrank(paused, shutdown)) {
        throw new CatchUpBlockedError(t("errors.catchUpBlockedByPause"));
      }

      const targets = uniquePools(pools);
      try {
        await runCatchUpUntilComplete({
          pools: targets,
          listPending: (scope) => poolsNeedingCatchUp(publicClient, scope),
          crankBatch: async (pending) => {
            const title = catchUpTxTitle(pending, t);
            const batch = uniquePools(pending).length > 1;
            await startTransaction({
              type: "crank_catch_up",
              title,
              description: batch ? t("txCenter.crankCatchUpBatchDesc") : t("txCenter.crankCatchUpDesc"),
              metadata: { pools: pending.join(",") },
              execute: () => sendCrankBatch(pending),
              onConfirmed: () => staking.refetchAll(),
            });
          },
          crank: async (pool) => {
            await startTransaction({
              type: "crank_catch_up",
              title: catchUpTxTitle([pool], t),
              description: t("txCenter.crankCatchUpDesc"),
              metadata: { pool },
              execute: () => sendCrank(pool),
              onConfirmed: () => staking.refetchAll(),
            });
          },
        });
      } catch (e) {
        if (e instanceof CatchUpIncompleteError) {
          throw new CatchUpIncompleteError(t("errors.catchUpIncomplete"));
        }
        throw e;
      }
    },
    [publicClient, staking, startTransaction, t, writeCrank, writeCrankBatch],
  );

  return {
    poolACatchUpComplete: staking.poolACatchUpComplete,
    poolBCatchUpComplete: staking.poolBCatchUpComplete,
    catchUpIncomplete: !staking.poolACatchUpComplete || !staking.poolBCatchUpComplete,
    ensureCatchUp,
  };
}
