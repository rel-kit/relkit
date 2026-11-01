/*
 * Adapted from Neon UI EmptyState (https://ui.neon.com/base-components/empty-state), MIT.
 * See public/THIRD_PARTY_NOTICES.txt. The Neon brand mark is replaced by a neutral icon slot.
 */
import type { ComponentProps, ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export type EmptyStateProps = Omit<ComponentProps<"div">, "title"> & {
  /** One line naming what's missing, e.g. "No requests yet". */
  readonly title: ReactNode;
  /** Optional line explaining how the space fills. */
  readonly description?: ReactNode;
  readonly icon?: ReactNode;
  readonly action?: ReactNode;
  readonly size?: "sm" | "md" | "lg";
  /** "panel" draws the dashed frame and stripe wash; "bare" embeds in a bordered surface. */
  readonly variant?: "panel" | "bare";
};

const PADDING: Record<NonNullable<EmptyStateProps["size"]>, string> = {
  lg: "px-8 py-20",
  md: "px-6 py-14",
  sm: "px-4 py-8",
};

export function EmptyState({
  action,
  className,
  description,
  icon,
  size = "md",
  title,
  variant = "panel",
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "relative isolate flex flex-col items-center justify-center text-center",
        variant === "panel" && "rounded-lg border border-dashed border-border",
        PADDING[size],
        className,
      )}
      data-slot="empty-state"
      data-variant={variant}
      {...props}
    >
      {variant === "panel" ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 rounded-[inherit] bg-[repeating-linear-gradient(-45deg,var(--color-border)_0_1px,transparent_1px_7px)] opacity-40"
        />
      ) : null}
      <span
        aria-hidden="true"
        className="mb-3 text-muted-foreground/70 [&_svg:not([class*='size-'])]:size-5"
      >
        {icon ?? <Inbox />}
      </span>
      <p className="text-balance text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-pretty text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
