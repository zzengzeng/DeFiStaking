import type { PublicClient } from "viem";

/** 为日志条目批量补充 block timestamp（去重后并行 getBlock）。 */
export async function enrichWithBlockTimestamps<T extends { blockNumber: string }>(
  client: PublicClient,
  rows: T[],
): Promise<(T & { blockTimestamp: string })[]> {
  if (rows.length === 0) return [];

  const unique = [...new Set(rows.map((r) => r.blockNumber))];
  const tsByBlock = new Map<string, string>();

  await Promise.all(
    unique.map(async (blockNumber) => {
      try {
        const block = await client.getBlock({ blockNumber: BigInt(blockNumber) });
        tsByBlock.set(blockNumber, block.timestamp.toString());
      } catch {
        tsByBlock.set(blockNumber, "0");
      }
    }),
  );

  return rows.map((r) => ({
    ...r,
    blockTimestamp: tsByBlock.get(r.blockNumber) ?? "0",
  }));
}

export function formatBlockDate(tsSec: string | undefined, locale = "zh-CN"): string {
  const n = Number(tsSec ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return new Date(n * 1000).toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
