import { parseUnits } from "viem";

export const BASIS_POINTS = 10_000n;
export const MAX_WITHDRAW_BP = 500n;
export const MAX_MIDTERM_BP = 500n;
export const MAX_EARLY_EXIT_PENALTY_BP = 2_000n;
export const MAX_LOCK_DURATION = 90n * 24n * 60n * 60n;
export const MAX_TRANSFER_FEE_BP = BASIS_POINTS;
export const MIN_REWARD_RATE_DURATION = 86_400n;
export const MAX_REWARD_DURATION = 31_536_000n;
/** 链上 `MAX_MIN_CLAIM_AMOUNT`（0.1 TokenB） */
export const MAX_MIN_CLAIM_AMOUNT_WEI = 100_000_000_000_000_000n;

export function parseUintInput(raw: string): bigint | null {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;
  return BigInt(t);
}

export function parseTokenAmountInput(raw: string): bigint | null {
  const t = raw.trim();
  if (!/^\d*\.?\d+$/.test(t)) return null;
  try {
    return parseUnits(t, 18);
  } catch {
    return null;
  }
}

export function parseAddressInput(raw: string): `0x${string}` | null {
  let s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(s)) return null;
  return s as `0x${string}`;
}

export function minEarlyExitRequired(penaltyBp: bigint | null): bigint {
  if (!penaltyBp || penaltyBp === 0n) return 0n;
  return (BASIS_POINTS + penaltyBp - 1n) / penaltyBp;
}
