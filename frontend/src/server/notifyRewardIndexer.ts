import { createPublicClient, http } from "viem";
import { mainnet, sepolia } from "viem/chains";

import { sepoliaDeploymentMeta } from "@/contracts/addresses";
import { fetchNotifyRewardLogs } from "@/lib/notifyRewardLogQuery";
import type { IndexedNotifyReward } from "@/types/notifyRewardLog";

function getChain(chainId: number) {
  return chainId === mainnet.id ? mainnet : sepolia;
}

/** 与 `wagmi.ts` 一致：未配置环境变量时使用公共 RPC，避免 API 返回空列表。 */
function getRpcUrl(chainId: number) {
  if (chainId === mainnet.id) {
    return process.env.NEXT_PUBLIC_RPC_URL_MAINNET ?? "https://ethereum-rpc.publicnode.com";
  }
  return process.env.NEXT_PUBLIC_RPC_URL_SEPOLIA ?? "https://ethereum-sepolia-rpc.publicnode.com";
}

/** 从链上 `RewardNotified` 日志拉取运营注资（notify）记录，按区块从新到旧排序。 */
export async function indexNotifyRewardLogs(
  stakingAddress: `0x${string}`,
  chainId: number,
): Promise<IndexedNotifyReward[]> {
  const chain = getChain(chainId);
  const rpcUrl = getRpcUrl(chainId);
  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  const defaultFromBlock =
    chainId === sepoliaDeploymentMeta.chainId ? String(sepoliaDeploymentMeta.stakingDeployBlock) : "0";
  const fromBlock = BigInt(process.env.NEXT_PUBLIC_STAKING_DEPLOY_BLOCK ?? defaultFromBlock);
  return fetchNotifyRewardLogs(client, stakingAddress, fromBlock);
}
