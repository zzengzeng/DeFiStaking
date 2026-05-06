"use client";

type Props = {
  text: string;
  "aria-label"?: string;
};

/** 内联说明：悬停显示完整文案（与原生 title 一致，无额外依赖）。 */
export function InfoTip({ text, "aria-label": ariaLabel }: Props) {
  return (
    <span
      role="img"
      aria-label={ariaLabel ?? "More information"}
      title={text}
      className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-zinc-600 bg-zinc-800 text-[10px] font-bold leading-none text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
    >
      i
    </span>
  );
}
