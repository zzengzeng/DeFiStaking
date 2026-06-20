"use client";

import clsx from "clsx";

type PoolTab = {
  id: string;
  label: string;
  token: string;
};

type Props = {
  tabs: PoolTab[];
  activeId: string;
  onChange: (id: string) => void;
};

/** 池子切换 Tab */
export function PoolTabs({ tabs, activeId, onChange }: Props) {
  return (
    <div className="flex rounded-xl border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={clsx(
            "min-h-[36px] flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition",
            activeId === tab.id
              ? "bg-[var(--dp-accent)] text-black"
              : "text-zinc-400 hover:text-zinc-200",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
