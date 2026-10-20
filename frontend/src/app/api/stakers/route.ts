import { NextResponse } from "next/server";

import { contractAddresses } from "@/contracts/addresses";
import { indexStakerStats } from "@/server/stakerIndexer";

/** staker 统计：基于 `Staked` 链上事件（近似独立地址数）。 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const chainId = Number(searchParams.get("chainId") ?? "11155111");
    const stats = await indexStakerStats(contractAddresses.staking, chainId);
    return NextResponse.json({ stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ stats: { total: 0, poolA: 0, poolB: 0 }, error: message });
  }
}

