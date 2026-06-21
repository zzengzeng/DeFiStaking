"use client";

import { hasDeploymentTokenMismatch } from "@/lib/deploymentMismatch";
import { useI18n } from "@/lib/i18n";

type Props = {
  poolAStakingToken?: `0x${string}`;
  poolBStakingToken?: `0x${string}`;
};

/** 链上 pool 代币与 env 不一致时提示，避免误报 Invariant / gas 类错误。 */
export function DeploymentMismatchAlert({ poolAStakingToken, poolBStakingToken }: Props) {
  const { t } = useI18n();

  if (!hasDeploymentTokenMismatch(poolAStakingToken, poolBStakingToken)) return null;
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-sm text-amber-100/95">
      {t("deployment.tokenMismatch")}
    </div>
  );
}
