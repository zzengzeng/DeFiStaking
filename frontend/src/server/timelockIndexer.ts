import { createPublicClient, getAddress, http, parseAbiItem } from "viem";
import { mainnet, sepolia } from "viem/chains";

import { sepoliaDeploymentMeta } from "@/contracts/addresses";

export type TimelockOpState = "CREATED" | "READY" | "EXECUTED" | "CANCELLED";

export type IndexedTimelockOp = {
  opId: `0x${string}`;
  paramsHash: `0x${string}`;
  executeAfter: bigint;
  executedAt?: bigint;
  cancelledAt?: bigint;
  state: TimelockOpState;
  createdBlock: bigint;
};

const scheduledEvent = parseAbiItem("event TimelockScheduled(bytes32 indexed opId, bytes32 indexed paramsHash, uint256 executeAfter)");
const consumedEvent = parseAbiItem("event TimelockConsumed(bytes32 indexed opId, bytes32 indexed paramsHash, uint256 executedAt)");
const cancelledEvent = parseAbiItem("event TimelockCancelled(bytes32 indexed opId, bytes32 indexed paramsHash, uint256 cancelledAt)");

function getChain(chainId: number) {
  return chainId === mainnet.id ? mainnet : sepolia;
}

function getRpcUrl(chainId: number) {
  return chainId === mainnet.id ? process.env.NEXT_PUBLIC_RPC_URL_MAINNET : process.env.NEXT_PUBLIC_RPC_URL_SEPOLIA;
}

/** 从链上日志索引 timelock 操作，产出完整 pending/executed 列表。 */
export async function indexTimelockOps(stakingAddress: `0x${string}`, chainId: number): Promise<IndexedTimelockOp[]> {
  const chain = getChain(chainId);
  const rpcUrl = getRpcUrl(chainId);
  if (!rpcUrl) return [];

  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  const defaultFromBlock =
    chainId === sepoliaDeploymentMeta.chainId ? String(sepoliaDeploymentMeta.stakingDeployBlock) : "0";
  const fromBlock = BigInt(process.env.NEXT_PUBLIC_STAKING_DEPLOY_BLOCK ?? defaultFromBlock);
  const toBlock = "latest";
  const address = getAddress(stakingAddress);

  const [scheduledLogs, consumedLogs, cancelledLogs] = await Promise.all([
    client.getLogs({ address, event: scheduledEvent, fromBlock, toBlock }),
    client.getLogs({ address, event: consumedEvent, fromBlock, toBlock }),
    client.getLogs({ address, event: cancelledEvent, fromBlock, toBlock }),
  ]);

  const consumedMap = new Map<string, bigint>();
  for (const log of consumedLogs) {
    const key = `${log.args.opId}-${log.args.paramsHash}`;
    consumedMap.set(key, log.args.executedAt ?? 0n);
  }
  const cancelledMap = new Map<string, bigint>();
  for (const log of cancelledLogs) {
    const key = `${log.args.opId}-${log.args.paramsHash}`;
    cancelledMap.set(key, log.args.cancelledAt ?? 0n);
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  const ops: IndexedTimelockOp[] = scheduledLogs.map((log) => {
    const key = `${log.args.opId}-${log.args.paramsHash}`;
    const executedAt = consumedMap.get(key);
    const cancelledAt = cancelledMap.get(key);
    const executeAfter = log.args.executeAfter ?? 0n;
    const state: TimelockOpState =
      cancelledAt ? "CANCELLED" : executedAt ? "EXECUTED" : now >= executeAfter ? "READY" : "CREATED";

    return {
      opId: log.args.opId as `0x${string}`,
      paramsHash: log.args.paramsHash as `0x${string}`,
      executeAfter,
      executedAt,
      cancelledAt,
      state,
      createdBlock: log.blockNumber ?? 0n,
    };
  });

  return ops.sort((a, b) => Number(b.createdBlock - a.createdBlock));
}
