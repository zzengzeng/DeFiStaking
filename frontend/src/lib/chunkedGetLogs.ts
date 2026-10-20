import type { PublicClient } from "viem";

/** 公共 RPC 常见上限约 50k；保守分块避免 `exceed maximum block range`。 */
const DEFAULT_CHUNK_SIZE = 9_000n;

/**
 * 将 `fromBlock..toBlock` 拆成多段 `getLogs`，合并结果。
 */
export async function getLogsInChunks<T>(
  client: PublicClient,
  fromBlock: bigint,
  fetchRange: (from: bigint, to: bigint) => Promise<T[]>,
  chunkSize: bigint = DEFAULT_CHUNK_SIZE,
): Promise<T[]> {
  const head = await client.getBlockNumber();
  if (fromBlock > head) return [];

  const out: T[] = [];
  let start = fromBlock;

  while (start <= head) {
    const end = start + chunkSize - 1n > head ? head : start + chunkSize - 1n;
    const batch = await fetchRange(start, end);
    out.push(...batch);
    start = end + 1n;
  }

  return out;
}
