"use client";

import { DeploymentMismatchAlert } from "@/components/DeploymentMismatchAlert";

type Props = {
  children: React.ReactNode;
  poolAStakingToken?: `0x${string}`;
  poolBStakingToken?: `0x${string}`;
};

/** 产品页统一外壳：背景、间距、部署告警 */
export function ProductPageShell({ children, poolAStakingToken, poolBStakingToken }: Props) {
  return (
    <div className="dp-hero-glow min-w-0 overflow-x-clip pb-6 sm:pb-8">
      {poolAStakingToken !== undefined || poolBStakingToken !== undefined ? (
        <DeploymentMismatchAlert poolAStakingToken={poolAStakingToken} poolBStakingToken={poolBStakingToken} />
      ) : null}
      <div className="min-w-0 space-y-6 pt-8 sm:space-y-8 sm:pt-10">{children}</div>
    </div>
  );
}
