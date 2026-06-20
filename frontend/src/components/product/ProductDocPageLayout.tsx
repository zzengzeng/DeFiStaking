"use client";

/** 文档 / 落地页：单栏全宽 */
export function ProductDocPageLayout({ children }: { children: React.ReactNode }) {
  return <div className="w-full min-w-0 space-y-8 sm:space-y-10">{children}</div>;
}
