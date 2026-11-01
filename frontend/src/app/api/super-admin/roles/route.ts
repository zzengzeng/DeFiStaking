import { NextResponse } from "next/server";

import { indexSuperAdminRoles } from "@/server/superAdminRolesIndexer";

/** SuperAdmin 角色持有者快照：基于 `RoleGranted` / `RoleRevoked` 链上事件。 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const chainId = Number(searchParams.get("chainId") ?? "11155111");
    const snapshot = await indexSuperAdminRoles(chainId);
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        holders: [],
        counts: { superAdmin: 0, admin: 0, operator: 0 },
        headBlockNumber: "0",
        fromBlock: "0",
        error: message,
      },
    );
  }
}
