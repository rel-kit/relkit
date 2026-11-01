import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  /** Drop body padding for edge-to-edge content such as tables and lists. */
  readonly flush?: boolean;
}

/** A bordered card with a slim header bar; the one container every page section uses. */
export function Section({
  actions,
  children,
  className,
  description,
  flush = false,
  title,
  ...props
}: SectionProps) {
  const titleId = props.id ? `${props.id}-title` : undefined;
  return (
    <section
      aria-labelledby={title && titleId ? titleId : undefined}
      className={cn(
        "min-w-0 overflow-hidden rounded-lg border border-border bg-card text-card-foreground",
        className,
      )}
      {...props}
    >
      {title || actions ? (
        <header className="flex min-h-10 items-center justify-between gap-3 border-b border-border px-4 py-2">
          <div className="min-w-0">
            {title ? (
              <h2 id={titleId} className="truncate text-[13px] font-semibold text-foreground">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="truncate text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
        </header>
      ) : null}
      <div className={flush ? undefined : "p-4"}>{children}</div>
    </section>
  );
}
