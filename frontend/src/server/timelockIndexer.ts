import { createPublicClient, decodeFunctionData, getAddress, http, keccak256, parseAbiItem, type Hex } from "viem";
import { mainnet, sepolia } from "viem/chains";

import { governanceAddresses, sepoliaDeploymentMeta } from "@/contracts/addresses";
import { dualPoolStakingAdminAbi } from "@/contracts/abis/dualPoolStakingAdmin";

export type TimelockOpState = "CREATED" | "READY" | "EXECUTED" | "CANCELLED";

export type IndexedTimelockOp = {
  opId: `0x${string}`;
  paramsHash: `0x${string}`;
  executeAfter: bigint;
  executedAt?: bigint;
  cancelledAt?: bigint;
  state: TimelockOpState;
  createdBlock: bigint;
  functionLabel: string;
};

const callScheduledEvent = parseAbiItem(
  "event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, bytes32 salt, uint256 delay)",
);
const callExecutedEvent = parseAbiItem(
  "event CallExecuted(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data)",
);
const cancelledEvent = parseAbiItem("event Cancelled(bytes32 indexed id)");

function getChain(chainId: number) {
  return chainId === mainnet.id ? mainnet : sepolia;
}

function getRpcUrl(chainId: number) {
  return chainId === mainnet.id ? process.env.NEXT_PUBLIC_RPC_URL_MAINNET : process.env.NEXT_PUBLIC_RPC_URL_SEPOLIA;
}

function resolveFunctionLabel(target: `0x${string}`, data: Hex, adminFacade: `0x${string}`): string {
  if (getAddress(target) !== getAddress(adminFacade)) {
    return `external (${target.slice(0, 10)}…)`;
  }
  try {
    const decoded = decodeFunctionData({ abi: dualPoolStakingAdminAbi, data });
    return decoded.functionName;
  } catch {
    return "unknown admin call";
  }
}

async function indexTimelockController(
  client: ReturnType<typeof createPublicClient>,
  timelockAddress: `0x${string}`,
  adminFacade: `0x${string}`,
  fromBlock: bigint,
): Promise<IndexedTimelockOp[]> {
  const toBlock = "latest" as const;
  const [scheduledLogs, executedLogs, cancelledLogs] = await Promise.all([
    client.getLogs({ address: timelockAddress, event: callScheduledEvent, fromBlock, toBlock }),
    client.getLogs({ address: timelockAddress, event: callExecutedEvent, fromBlock, toBlock }),
    client.getLogs({ address: timelockAddress, event: cancelledEvent, fromBlock, toBlock }),
  ]);

  const executedMap = new Map<string, bigint>();
  for (const log of executedLogs) {
    if (log.blockNumber === null || log.blockNumber === undefined) continue;
    const block = await client.getBlock({ blockNumber: log.blockNumber });
    executedMap.set(log.args.id as string, block.timestamp);
  }
  const cancelledMap = new Map<string, bigint>();
  for (const log of cancelledLogs) {
    if (log.blockNumber === null || log.blockNumber === undefined) continue;
    const block = await client.getBlock({ blockNumber: log.blockNumber });
    cancelledMap.set(log.args.id as string, block.timestamp);
  }

  const scheduledBlocks = new Map<bigint, bigint>();
  for (const log of scheduledLogs) {
    if (log.blockNumber === null || log.blockNumber === undefined) continue;
    if (!scheduledBlocks.has(log.blockNumber)) {
      const block = await client.getBlock({ blockNumber: log.blockNumber });
      scheduledBlocks.set(log.blockNumber, block.timestamp);
    }
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  return scheduledLogs.map((log) => {
    const opId = log.args.id as `0x${string}`;
    const data = (log.args.data ?? "0x") as Hex;
    const paramsHash = keccak256(data);
    const delay = log.args.delay ?? 0n;
    const scheduledAt = log.blockNumber !== null && log.blockNumber !== undefined ? scheduledBlocks.get(log.blockNumber) ?? 0n : 0n;
    const executeAfter = scheduledAt + delay;
    const executedAt = executedMap.get(opId);
    const cancelledAt = cancelledMap.get(opId);
    const state: TimelockOpState =
      cancelledAt !== undefined ? "CANCELLED" : executedAt !== undefined ? "EXECUTED" : now >= executeAfter ? "READY" : "CREATED";

    return {
      opId,
      paramsHash,
      executeAfter,
      executedAt,
      cancelledAt,
      state,
      createdBlock: log.blockNumber ?? 0n,
      functionLabel: resolveFunctionLabel(log.args.target as `0x${string}`, data, adminFacade),
    };
  });
}

/** 从 OpenZeppelin TimelockController 事件索引治理操作（48h + 72h 双实例）。 */
export async function indexTimelockOps(chainId: number): Promise<IndexedTimelockOp[]> {
  const chain = getChain(chainId);
  const rpcUrl = getRpcUrl(chainId);
  if (!rpcUrl) return [];

  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  const defaultFromBlock =
    chainId === sepoliaDeploymentMeta.chainId ? String(sepoliaDeploymentMeta.stakingDeployBlock) : "0";
  const fromBlock = BigInt(process.env.NEXT_PUBLIC_STAKING_DEPLOY_BLOCK ?? defaultFromBlock);
  const adminFacade = governanceAddresses.adminFacade;

  const timelocks = [governanceAddresses.timelock, governanceAddresses.timelockSuper].filter(
    (addr) => addr !== "0x0000000000000000000000000000000000000000",
  );

  const batches = await Promise.all(
    timelocks.map((timelock) => indexTimelockController(client, timelock, adminFacade, fromBlock)),
  );

  return batches
    .flat()
    .sort((a, b) => Number(b.createdBlock - a.createdBlock));
}
