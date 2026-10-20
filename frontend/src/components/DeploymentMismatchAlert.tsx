"use client";

import { getDeploymentMismatchKinds } from "@/lib/deploymentMismatch";
import { useStaking } from "@/hooks/useStaking";
import { useI18n } from "@/lib/i18n";

type Props = {
  poolAStakingToken?: `0x${string}`;
  poolBStakingToken?: `0x${string}`;
};

/** 链上 pool / 模块指针与 env 不一致时提示，避免误报 Invariant / gas 类错误。 */
export function DeploymentMismatchAlert({ poolAStakingToken, poolBStakingToken }: Props) {
  const { t } = useI18n();
  const staking = useStaking();

  const kinds = getDeploymentMismatchKinds(
    poolAStakingToken,
    poolBStakingToken,
    staking.onChainUserModule,
    staking.onChainAdminModule,
  );

  if (kinds.length === 0) return null;

  return (
    <div className="space-y-2">
      {kinds.includes("token") ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-sm text-amber-100/95">
          {t("deployment.tokenMismatch")}
        </div>
      ) : null}
      {kinds.includes("module") ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-sm text-amber-100/95">
          {t("deployment.moduleMismatch")}
        </div>
      ) : null}
    </div>
  );
}
