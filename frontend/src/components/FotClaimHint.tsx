"use client";

import { bpToPercent, formatToken } from "@/lib/format";
import { walletReceiveAfterFee } from "@/lib/fot";
import { useI18n } from "@/lib/i18n";

type Props = {
  grossRewards: bigint;
  maxTransferFeeBP: bigint;
  tokenSymbol?: string;
};

/** 当 maxTransferFeeBP > 0 时展示合约 gross 与钱包净到账估算。 */
export function FotClaimHint({ grossRewards, maxTransferFeeBP, tokenSymbol = "TokenB" }: Props) {
  const { t } = useI18n();

  if (maxTransferFeeBP <= 0n || grossRewards <= 0n) return null;
  const walletEst = walletReceiveAfterFee(grossRewards, maxTransferFeeBP);
  return (
    <p className="mt-2 rounded-lg border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200/90">
      {t("fot.hint", {
        gross: formatToken(grossRewards),
        token: tokenSymbol,
        net: formatToken(walletEst),
        pct: bpToPercent(maxTransferFeeBP),
      })}
    </p>
  );
}
