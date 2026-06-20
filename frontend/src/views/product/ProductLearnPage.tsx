"use client";

import Link from "next/link";

import { HowItWorks } from "@/components/product/widgets/HowItWorks";
import { LearnPoolPicker } from "@/components/product/LearnPoolPicker";
import { ProductDocPageLayout } from "@/components/product/ProductDocPageLayout";
import { ProductInfoCard } from "@/components/product/ProductInfoCard";
import { ProductPageShell } from "@/components/product/ProductPageShell";
import { ProductPageTitle } from "@/components/product/ProductPageTitle";

const HIGHLIGHTS = ["非托管", "链上可验证", "双池策略", "TokenB 奖励"] as const;
const TRUST_ITEMS = [
  { label: "资产控制", value: "钱包授权", detail: "协议不接触私钥" },
  { label: "价格依赖", value: "无预言机", detail: "收益按链上余额和排放速率计算" },
  { label: "出账假设", value: "FOT 自担", detail: "钱包实际到账可能低于 gross" },
] as const;

/** 协议说明页 — 单栏文档 / 落地页 */
export function ProductLearnPage() {
  return (
    <ProductPageShell>
      <ProductDocPageLayout>
        <ProductPageTitle
          centered
          variant="hero"
          title="为什么选择 DualPool"
          subtitle="像主流 DeFi 一样简单：选池、质押、查看收益。资产始终由你的钱包授权，协议不托管私钥。"
        />
        <ul className="flex flex-wrap justify-center gap-2">
          {HIGHLIGHTS.map((label) => (
            <li
              key={label}
              className="rounded-full border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] px-3 py-1 text-xs font-medium text-zinc-400"
            >
              {label}
            </li>
          ))}
        </ul>

        <section className="dp-card grid grid-cols-1 gap-px overflow-hidden sm:grid-cols-3">
          {TRUST_ITEMS.map((item) => (
            <div key={item.label} className="bg-[var(--dp-surface-raised)] px-4 py-4">
              <div className="text-xs text-zinc-500">{item.label}</div>
              <div className="mt-1 text-lg font-semibold text-zinc-100">{item.value}</div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">{item.detail}</p>
            </div>
          ))}
        </section>

        <HowItWorks align="center" layout="stack" />

        <LearnPoolPicker />

        <ProductInfoCard title="风险说明" variant="compact">
          <ul className="list-inside list-disc space-y-1">
            <li>智能合约风险：请自行评估审计与链上参数。</li>
            <li>收益率非固定：APR 随池内奖励与 TVL 动态变化。</li>
            <li>Token 转账税（FOT）：领取/赎回到账可能略低于合约账面金额。</li>
          </ul>
          <p className="mt-2">
            协议运维请使用{" "}
            <Link href="/console" className="text-dp-accent hover:underline">
              合约控制台
            </Link>
            。
          </p>
        </ProductInfoCard>
      </ProductDocPageLayout>
    </ProductPageShell>
  );
}
