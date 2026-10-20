"use client";

import clsx from "clsx";
import { forwardRef } from "react";

export type ConsoleButtonVariant = "primary" | "danger" | "secondary" | "neutral";
export type ConsoleButtonSize = "md" | "sm";

const variantClass: Record<ConsoleButtonVariant, string> = {
  primary: "bg-amber-400 text-black hover:bg-amber-300",
  danger: "bg-red-400 text-black hover:bg-red-300",
  secondary:
    "border border-zinc-700 bg-transparent text-zinc-200 hover:border-zinc-600 hover:bg-zinc-900",
  neutral: "bg-zinc-200 text-black hover:bg-zinc-100",
};

const sizeClass: Record<ConsoleButtonSize, string> = {
  md: "min-h-[44px] px-3 py-2 text-sm font-medium",
  sm: "min-h-[40px] px-3 py-1.5 text-sm font-medium",
};

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ConsoleButtonVariant;
  size?: ConsoleButtonSize;
  fullWidth?: boolean;
};

/** 控制台统一操作按钮：琥珀主色 + 红危险 + 描边次要。 */
export const ConsoleButton = forwardRef<HTMLButtonElement, Props>(function ConsoleButton(
  { variant = "primary", size = "md", fullWidth = false, className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(
        "inline-flex items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40",
        variantClass[variant],
        sizeClass[size],
        fullWidth && "w-full sm:w-auto",
        className,
      )}
      {...props}
    />
  );
});
