"use client";

import clsx from "clsx";
import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useI18n } from "@/lib/i18n";

type Align = "start" | "end";
type Side = "top" | "bottom";

type Props = {
  text: string;
  "aria-label"?: string;
  className?: string;
  /** 气泡相对图标的水平对齐；靠左的按钮用 start（默认） */
  align?: Align;
  /** 优先显示在图标上方或下方；空间不足时自动翻转 */
  side?: Side;
};

function InfoIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width={12}
      height={12}
      aria-hidden
      className="shrink-0"
    >
      <circle
        cx="8"
        cy="8"
        r="7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        fill="currentColor"
        d="M8 7.1a.85.85 0 1 1 0-1.7.85.85 0 0 1 0 1.7ZM7.15 8.35h1.7v3.5h-1.7v-3.5Z"
      />
    </svg>
  );
}

const VIEWPORT_MARGIN = 12;
const GAP = 8;

/** 内联说明：悬停 / 聚焦 / 点击显示完整文案（Portal + 视口边界检测）。 */
export function InfoTip({
  text,
  "aria-label": ariaLabel,
  className,
  align = "start",
  side = "bottom",
}: Props) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    const tooltip = tooltipRef.current;
    if (!button || !tooltip) return;

    const buttonRect = button.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const maxLeft = window.innerWidth - tooltipRect.width - VIEWPORT_MARGIN;
    const maxTop = window.innerHeight - tooltipRect.height - VIEWPORT_MARGIN;

    let left =
      align === "start"
        ? buttonRect.left
        : buttonRect.right - tooltipRect.width;
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, maxLeft));

    const preferBottom = side === "bottom";
    let top = preferBottom
      ? buttonRect.bottom + GAP
      : buttonRect.top - tooltipRect.height - GAP;

    if (preferBottom && top + tooltipRect.height > window.innerHeight - VIEWPORT_MARGIN) {
      top = buttonRect.top - tooltipRect.height - GAP;
    } else if (!preferBottom && top < VIEWPORT_MARGIN) {
      top = buttonRect.bottom + GAP;
    }

    top = Math.max(VIEWPORT_MARGIN, Math.min(top, maxTop));
    setCoords({ top, left });
  }, [align, side]);

  useLayoutEffect(() => {
    if (!visible) {
      setCoords(null);
      return;
    }

    updatePosition();

    const onReflow = () => updatePosition();
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [visible, text, updatePosition]);

  const show = () => setVisible(true);
  const hide = () => {
    if (!pinned) setVisible(false);
  };

  const handleClick = () => {
    setPinned((value) => {
      const next = !value;
      setVisible(next);
      return next;
    });
  };

  const handleBlur = () => {
    setPinned(false);
    setVisible(false);
  };

  const tooltip =
    visible && typeof document !== "undefined"
      ? createPortal(
          <span
            id={tooltipId}
            ref={tooltipRef}
            role="tooltip"
            style={{
              position: "fixed",
              top: coords?.top ?? -9999,
              left: coords?.left ?? -9999,
              visibility: coords ? "visible" : "hidden",
            }}
            className="z-[9999] box-border w-max max-w-[min(22rem,calc(100vw-1.5rem))] whitespace-normal rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2.5 text-left text-xs leading-relaxed text-zinc-200 shadow-2xl"
          >
            {text}
          </span>,
          document.body,
        )
      : null;

  return (
    <>
      <span className={clsx("relative inline-flex shrink-0", className)}>
        <button
          ref={buttonRef}
          type="button"
          aria-label={ariaLabel ?? t("common.moreInfo")}
          aria-describedby={visible ? tooltipId : undefined}
          aria-expanded={visible}
          onMouseEnter={show}
          onMouseLeave={hide}
          onFocus={show}
          onBlur={handleBlur}
          onClick={handleClick}
          className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-zinc-600 bg-zinc-800/90 text-zinc-400 transition hover:border-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400/80"
        >
          <InfoIcon />
        </button>
      </span>
      {tooltip}
    </>
  );
}
