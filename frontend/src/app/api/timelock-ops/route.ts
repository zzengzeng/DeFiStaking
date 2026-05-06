import { NextResponse } from "next/server";

import { contractAddresses } from "@/contracts/addresses";
import { resolveTimelockOpLabel } from "@/lib/timelockOpIds";
import { indexTimelockOps } from "@/server/timelockIndexer";

/** Timelock 操作索引 API：基于链上事件生成操作面板数据。 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const chainId = Number(searchParams.get("chainId") ?? "11155111");
    const raw = await indexTimelockOps(contractAddresses.staking, chainId);
    const ops = raw.map((op) => ({
      opId: op.opId,
      paramsHash: op.paramsHash,
      executeAfter: op.executeAfter.toString(),
      executedAt: op.executedAt?.toString(),
      cancelledAt: op.cancelledAt?.toString(),
      state: op.state,
      createdBlock: op.createdBlock.toString(),
      functionLabel: resolveTimelockOpLabel(op.opId),
      paramsDisplay: `${op.paramsHash.slice(0, 10)}…${op.paramsHash.slice(-6)}`,
    }));
    return NextResponse.json({ ops });
  } catch (error) {
    return NextResponse.json({ ops: [], error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
