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
  canPermissionlessCrank,
  CatchUpIncompleteError,
  type PoolSide,
  poolSideToIndex,
  poolsNeedingCatchUp,
  runCatchUpUntilComplete,
  uniquePools,
} from "@/lib/poolCatchUp";

export { CatchUpBlockedError } from "@/hooks/catchUpErrors";
export { CatchUpIncompleteError };

type CrankSend = (pool: PoolSide) => Promise<Hash>;

/**
 * Runs permissionless `crankCatchUpPool` txs until requested pools reach `pool*CatchUpComplete`.
 * Used before user paths that call `_catchUpExpiredGlobal(..., requireComplete=true)` on-chain.
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

  const ensureCatchUp = useCallback(
    async (pools: readonly PoolSide[], sendCrank: CrankSend = writeCrank) => {
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
          crank: async (pool) => {
            const poolLabel = pool === "A" ? t("txCenter.poolFlexible") : t("txCenter.poolLocked");
            await startTransaction({
              type: "crank_catch_up",
              title: t("txCenter.crankCatchUp", { pool: poolLabel }),
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
    [publicClient, staking, startTransaction, t, writeCrank],
  );

  return {
    poolACatchUpComplete: staking.poolACatchUpComplete,
    poolBCatchUpComplete: staking.poolBCatchUpComplete,
    catchUpIncomplete: !staking.poolACatchUpComplete || !staking.poolBCatchUpComplete,
    ensureCatchUp,
  };
}
