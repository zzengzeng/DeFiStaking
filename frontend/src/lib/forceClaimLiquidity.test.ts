import { describe, expect, it } from "vitest";

import {
  classifyForceClaimLiquidity,
  computeProportionalPay,
  estimateForceClaimSpendable,
} from "./forceClaimLiquidity";

describe("forceClaimLiquidity", () => {
  it("computes pro-rata payout when liquidity is short", () => {
    const { payA, payB } = computeProportionalPay(100n, 300n, 200n);
    expect(payA).toBe(50n);
    expect(payB).toBe(150n);
    expect(payA + payB).toBe(200n);
  });

  it("pays in full when solvent", () => {
    const { payA, payB } = computeProportionalPay(100n, 300n, 500n);
    expect(payA).toBe(100n);
    expect(payB).toBe(300n);
  });

  it("estimates spendable remain after Pool B principal and fees", () => {
    expect(estimateForceClaimSpendable(1000n, 700n, 50n)).toBe(250n);
    expect(estimateForceClaimSpendable(500n, 700n, 50n)).toBe(0n);
  });

  it("classifies zero and partial liquidity", () => {
    expect(classifyForceClaimLiquidity(400n, 0n, 0n)).toBe("zero");
    expect(classifyForceClaimLiquidity(400n, 200n, 200n)).toBe("partial");
    expect(classifyForceClaimLiquidity(400n, 400n, 500n)).toBe("full");
    expect(classifyForceClaimLiquidity(400n, 0n, null)).toBe("unknown");
  });
});
