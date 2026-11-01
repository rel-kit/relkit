"use client";

import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import { cn } from "../../lib/utils";

export interface ButtonProps extends AriaButtonProps {
  readonly variant?: "default" | "secondary" | "ghost" | "danger";
  readonly size?: "default" | "icon" | "sm";
}

const variants = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "border border-border bg-card text-foreground hover:bg-muted",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  danger: "bg-danger text-white hover:bg-danger/90",
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
        cn(
          "inline-flex cursor-default items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors outline-none disabled:pointer-events-none disabled:opacity-50 data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring/60 [&_svg]:size-3.5 [&_svg]:shrink-0",
          size === "icon"
            ? "size-8 p-0"
            : size === "sm"
              ? "h-7 px-2.5 text-xs"
              : "h-8 px-3 text-[13px]",
          variants[variant],
          state.isPressed && "translate-y-px",
          typeof className === "function" ? className(state) : className,
        )
      }
    />
  );
}
