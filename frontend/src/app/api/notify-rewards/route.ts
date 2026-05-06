import { NextResponse } from "next/server";

import { contractAddresses } from "@/contracts/addresses";
import { indexNotifyRewardLogs } from "@/server/notifyRewardIndexer";

/** 运营注资记录：基于 `RewardNotified` 链上事件。 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const chainId = Number(searchParams.get("chainId") ?? "11155111");
    const entries = await indexNotifyRewardLogs(contractAddresses.staking, chainId);
    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json(
      { entries: [], error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
