import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Locale } from "@/lib/i18n/types";

/** 用户语言偏好；与 Web3Provider 内 RainbowKit locale 联动 */
type LocaleState = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: "zh",
      setLocale: (locale) => set({ locale }),
    }),
    { name: "dualpool-locale-v1" },
  ),
);
