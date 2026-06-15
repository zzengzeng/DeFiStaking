const BASIS_POINTS = 10_000n;

/** Mirrors `FOTTransferLib.walletReceiveAfterFee` for UI previews. */
export function walletReceiveAfterFee(grossAmount: bigint, maxTransferFeeBP: bigint): bigint {
  if (grossAmount <= 0n || maxTransferFeeBP <= 0n) return grossAmount;
  return (grossAmount * (BASIS_POINTS - maxTransferFeeBP)) / BASIS_POINTS;
}
