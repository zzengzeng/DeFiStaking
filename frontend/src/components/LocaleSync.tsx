"use client";

import { useEffect } from "react";

import { htmlLang, useI18n } from "@/lib/i18n";

/** 同步 document lang 属性 */
export function LocaleSync() {
  const { locale } = useI18n();

  useEffect(() => {
    document.documentElement.lang = htmlLang(locale);
  }, [locale]);

  return null;
}
