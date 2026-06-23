import { describe, expect, it, vi } from "vitest";

import {
  buildCrankBatchCalls,
  canPermissionlessCrank,
  CatchUpIncompleteError,
  CATCH_UP_BOTH,
  encodeCrankPoolCalldata,
  poolSideToIndex,
  runCatchUpUntilComplete,
  uniquePools,
} from "./poolCatchUp";

describe("poolCatchUp helpers", () => {
  it("maps pool side to crank enum index", () => {
    expect(poolSideToIndex("A")).toBe(0);
    expect(poolSideToIndex("B")).toBe(1);
  });

  it("deduplicates catch-up pool list", () => {
    expect(uniquePools(["A", "B", "A", "B"])).toEqual(["A", "B"]);
    expect(uniquePools(CATCH_UP_BOTH)).toEqual(["A", "B"]);
  });

  it("allows crank when not paused or when shutdown", () => {
    expect(canPermissionlessCrank(false, false)).toBe(true);
    expect(canPermissionlessCrank(true, true)).toBe(true);
    expect(canPermissionlessCrank(true, false)).toBe(false);
  });
});

describe("runCatchUpUntilComplete (M-2)", () => {
  it("skips crank when pools already complete", async () => {
    const crank = vi.fn();
    await runCatchUpUntilComplete({
      pools: ["A"],
      listPending: async () => [],
      crank,
    });
    expect(crank).not.toHaveBeenCalled();
  });

  it("cranks once per incomplete pool then stops", async () => {
    const crank = vi.fn();
    let reads = 0;
    await runCatchUpUntilComplete({
      pools: CATCH_UP_BOTH,
      listPending: async () => {
        reads += 1;
        return reads === 1 ? ["A", "B"] : [];
      },
      crank,
    });
    expect(crank).toHaveBeenCalledTimes(2);
    expect(crank.mock.calls.map(([p]) => p)).toEqual(["A", "B"]);
  });

  it("batches pending pools in one crankBatch call per round", async () => {
    const crankBatch = vi.fn();
    const crank = vi.fn();
    let reads = 0;
    await runCatchUpUntilComplete({
      pools: CATCH_UP_BOTH,
      listPending: async () => {
        reads += 1;
        return reads === 1 ? ["A", "B"] : [];
      },
      crankBatch,
      crank,
    });
    expect(crankBatch).toHaveBeenCalledTimes(1);
    expect(crankBatch.mock.calls[0]?.[0]).toEqual(["A", "B"]);
    expect(crank).not.toHaveBeenCalled();
  });

  it("buildCrankBatchCalls encodes both pool cranks", () => {
    const calls = buildCrankBatchCalls(["A", "B"]);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.callData).toBe(encodeCrankPoolCalldata("A"));
    expect(calls[1]?.callData).toBe(encodeCrankPoolCalldata("B"));
  });

  it("simulates multi-round catch-up when one crank cannot finish (e.g. >1500d idle)", async () => {
    const crank = vi.fn();
    let poolAComplete = false;
    await runCatchUpUntilComplete({
      pools: ["A"],
      listPending: async () => (poolAComplete ? [] : ["A"]),
      crank: async () => {
        crank();
        poolAComplete = true;
      },
      maxRounds: 5,
    });
    expect(crank).toHaveBeenCalledTimes(1);
  });

  it("throws CatchUpIncompleteError when maxRounds exhausted", async () => {
    await expect(
      runCatchUpUntilComplete({
        pools: ["A"],
        listPending: async () => ["A"],
        crank: async () => undefined,
        maxRounds: 2,
      }),
    ).rejects.toBeInstanceOf(CatchUpIncompleteError);
  });
});
