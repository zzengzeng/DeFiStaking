import type { PublicClient } from "viem";

import { dualPoolStakingAbi } from "@/contracts/abis/dualPoolStaking";
import { contractAddresses } from "@/contracts/addresses";

export type PoolSide = "A" | "B";

/** Thrown when `runCatchUpUntilComplete` exhausts `maxRounds` without reaching complete. */
export class CatchUpIncompleteError extends Error {
  constructor(message = "CATCH_UP_INCOMPLETE") {
    super(message);
    this.name = "CatchUpIncompleteError";
  }
}

/** Safety cap: each crank covers up to ~1500d; 32 rounds ≈ 48k days wall-clock span. */
export const MAX_CATCHUP_TX_ROUNDS = 32;

export const CATCH_UP_A = ["A"] as const satisfies readonly PoolSide[];
export const CATCH_UP_B = ["B"] as const satisfies readonly PoolSide[];
export const CATCH_UP_BOTH = ["A", "B"] as const satisfies readonly PoolSide[];

export function poolSideToIndex(pool: PoolSide): 0 | 1 {
  return pool === "A" ? 0 : 1;
}

export function uniquePools(pools: readonly PoolSide[]): PoolSide[] {
  const seen = new Set<PoolSide>();
  const out: PoolSide[] = [];
  for (const p of pools) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

/** Operational pause blocks crank (M-1); shutdown+pause still allows crank to `pausedAt` cap (L-2). */
export function canPermissionlessCrank(paused: boolean, shutdown: boolean): boolean {
  return !paused || shutdown;
}

export async function readPoolCatchUpComplete(publicClient: PublicClient, pool: PoolSide): Promise<boolean> {
  return publicClient.readContract({
    address: contractAddresses.staking,
    abi: dualPoolStakingAbi,
    functionName: pool === "A" ? "poolACatchUpComplete" : "poolBCatchUpComplete",
  });
}

export async function poolsNeedingCatchUp(publicClient: PublicClient, pools: readonly PoolSide[]): Promise<PoolSide[]> {
  const pending: PoolSide[] = [];
  for (const pool of uniquePools(pools)) {
    if (!(await readPoolCatchUpComplete(publicClient, pool))) pending.push(pool);
  }
  return pending;
}

export type RunCatchUpUntilCompleteOptions = {
  pools: readonly PoolSide[];
  listPending: (pools: readonly PoolSide[]) => Promise<PoolSide[]>;
  crank: (pool: PoolSide) => Promise<unknown>;
  maxRounds?: number;
};

/**
 * M-2: loop permissionless cranks until `listPending` is empty or `maxRounds` is hit.
 * Pure orchestration — callers supply chain reads / tx sends (UI tests mock these).
 */
export async function runCatchUpUntilComplete(options: RunCatchUpUntilCompleteOptions): Promise<void> {
  const targets = uniquePools(options.pools);
  if (targets.length === 0) return;

  const maxRounds = options.maxRounds ?? MAX_CATCHUP_TX_ROUNDS;
  let rounds = 0;
  while (rounds < maxRounds) {
    const pending = await options.listPending(targets);
    if (pending.length === 0) return;
    for (const pool of pending) {
      await options.crank(pool);
    }
    rounds += 1;
  }
  throw new CatchUpIncompleteError();
}
