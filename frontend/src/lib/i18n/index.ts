"use client";

/**
 * 客户端 i18n 入口。
 *
 * - 组件内：`useI18n()` 返回 `t` / `locale` / `setLocale`
 * - 非 React（toast、pipeline）：`translate(locale, key)` 或读 `useLocaleStore.getState().locale`
 * - 回退：当前语言缺失键时回退到 zh，仍缺失则返回 key 本身
 * - 插值：文案中使用 `{name}`，调用 `t("key", { name: "..." })`
 *
 * 语言包结构说明见 `messages/zh.ts` 文件头注释。
 */

import { useMemo } from "react";

import { en } from "@/lib/i18n/messages/en";
import { zh } from "@/lib/i18n/messages/zh";
import type { Locale, MessageTree } from "@/lib/i18n/types";
import { useLocaleStore } from "@/store/useLocaleStore";

const MESSAGES: Record<Locale, MessageTree> = { zh, en };

function lookup(tree: MessageTree, key: string): string | undefined {
  const parts = key.split(".");
  let node: string | MessageTree = tree;
  for (const part of parts) {
    if (typeof node !== "object" || node === null || !(part in node)) return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

/** 纯函数翻译；可在 store / 工具模块中调用 */
export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const raw = lookup(MESSAGES[locale], key) ?? lookup(MESSAGES.zh, key) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

export function useI18n() {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  const t = useMemo(() => {
    return (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
  }, [locale]);

  return { locale, setLocale, t };
}

/** RainbowKit 内置文案 locale */
export function rainbowKitLocale(locale: Locale): "zh-CN" | "en-US" {
  return locale === "zh" ? "zh-CN" : "en-US";
}

/** 同步到 `<html lang>`，见 LocaleSync */
export function htmlLang(locale: Locale): string {
  return locale === "zh" ? "zh-CN" : "en";
}

/** `Date#toLocaleString` 等区域格式 */
export function dateLocale(locale: Locale): string {
  return locale === "zh" ? "zh-CN" : "en-US";
}

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

export type { Locale };
