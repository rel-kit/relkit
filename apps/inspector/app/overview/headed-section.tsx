import type { ReactNode } from "react";
import { Section } from "../../components/blocks/section";
import { cn } from "../../lib/utils";

/**
 * A `Section` whose heading keeps a fixed, caller-chosen id (contract tests and existing
 * `aria-labelledby` links depend on them) and carries an optional small uppercase kicker.
 */
export function HeadedSection({
  "aria-labelledby": headingId,
  kicker,
  title,
  description,
  actions,
  flush = false,
  className,
  children,
}: {
  readonly "aria-labelledby": string;
  readonly kicker?: ReactNode;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly flush?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
}) {
  return (
    <Section aria-labelledby={headingId} flush className={cn("flex flex-col", className)}>
      <header className="flex min-h-10 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="flex min-w-0 flex-col">
          {kicker ? (
            <p className="m-0 font-mono text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              {kicker}
            </p>
          ) : null}
          <h2 id={headingId} className="truncate text-[13px] font-semibold text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="m-0 truncate text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
      </header>
      {children === undefined || children === null ? null : (
        <div className={flush ? undefined : "p-4"}>{children}</div>
      )}
    </Section>
  );
}

/** Small uppercase label used inside dense cells. */
export function CellLabel({ children }: { readonly children: ReactNode }) {
  return (
    <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </span>
  );
}
