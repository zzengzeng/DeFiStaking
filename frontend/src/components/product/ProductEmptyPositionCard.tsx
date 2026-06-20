"use client";

import { ProductStateCard } from "@/components/product/ProductStateCard";

type Props = {
  connected: boolean;
  emptyHint?: string;
};

/** 未连接 / 无仓位时的占位卡 */
export function ProductEmptyPositionCard({ connected, emptyHint = "可在右侧开始操作" }: Props) {
  return (
    <div className="dp-card p-5 sm:p-6">
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">我的仓位</h2>
      <div className="mt-3">
        <ProductStateCard
          compact
          title={connected ? "暂无仓位" : "钱包未连接"}
          description={connected ? emptyHint : "连接钱包后查看本金、奖励、冷却时间与可执行操作。"}
        />
      </div>
    </div>
  );
}
