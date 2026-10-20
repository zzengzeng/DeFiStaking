"use client";

import { usePathname } from "next/navigation";

import { ConsoleShell } from "@/components/ConsoleShell";
import { ProductShell } from "@/components/ProductShell";
import { isConsolePath } from "@/lib/appMode";

/** 按 URL 选择产品壳或控制台壳；子路由无需重复判断 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isConsolePath(pathname)) {
    return <ConsoleShell>{children}</ConsoleShell>;
  }
  return <ProductShell>{children}</ProductShell>;
}
