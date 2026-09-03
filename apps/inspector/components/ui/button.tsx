"use client";

import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import { cx } from "../../lib/cx";

export interface ButtonProps extends AriaButtonProps {
  readonly variant?: "default" | "secondary" | "ghost" | "danger";
  readonly size?: "default" | "icon" | "sm";
}

const variants = {
  default: "bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent-strong)]",
  secondary:
    "border border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] hover:bg-[var(--panel-muted)]",
  ghost: "text-[var(--muted)] hover:bg-[var(--panel-muted)] hover:text-[var(--ink)]",
  danger: "bg-[var(--danger)] text-white hover:opacity-90",
} as const;

export function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonProps) {
  return (
    <AriaButton
      {...props}
      className={(state) =>
        cx(
          "inline-flex cursor-default items-center justify-center gap-2 rounded-lg font-medium transition disabled:pointer-events-none disabled:opacity-50",
          size === "icon"
            ? "size-9 p-0"
            : size === "sm"
              ? "h-8 px-3 text-xs"
              : "h-9 px-3.5 text-sm",
          variants[variant],
          state.isPressed && "translate-y-px",
          typeof className === "function" ? className(state) : className,
        )
      }
    />
  );
}
