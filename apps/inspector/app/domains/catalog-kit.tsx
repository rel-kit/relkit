/** Small presentation pieces shared by the workspace catalog detail pages. */
import { GitFork } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { FailedState, LoadingRows } from "../../components/blocks/block-state";
import { Section } from "../../components/blocks/section";
import { CopyButton } from "../../components/blocks/copy-button";
import { Badge } from "../../components/ui/badge";
import { graphHref } from "../../lib/graph-url-state";
import { cn } from "../../lib/utils";

/** HTTP method chip; colour comes from the shared `.route-method[data-method]` rule. */
export function MethodChip({
  method,
  className,
}: {
  readonly method: string;
  readonly className?: string;
}) {
  return (
    <span className={cn("route-method", className)} data-method={method}>
      {method}
    </span>
  );
}

export function ExposureBadge({ exposure }: { readonly exposure: unknown }) {
  if (exposure !== "public" && exposure !== "internal") return null;
  return <Badge variant={exposure === "public" ? "info" : "default"}>{exposure}</Badge>;
}

/** A quiet mono count used in Section headers. */
export function Count({ value }: { readonly value: number }) {
  return (
    <span className="rounded-sm border border-border px-1.5 py-px font-mono text-[11px] text-muted-foreground tabular-nums">
      {value.toLocaleString("en-US")}
    </span>
  );
}

/** One labelled item on the mono header meta line. */
export function MetaItem({
  label,
  children,
  copy,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly copy?: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="text-muted-foreground/60">{label}</span>
      <span className="min-w-0 truncate text-foreground/80">{children}</span>
      {copy ? <CopyButton value={copy} label={`Copy ${label}`} /> : null}
    </span>
  );
}

export function GraphAction({ id }: { readonly id: string }) {
  return (
    <Link
      href={graphHref({ view: "flow", scope: id, node: id })}
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground no-underline transition-colors hover:bg-muted [&_svg]:size-3.5"
    >
      <GitFork aria-hidden="true" />
      Follow in graph
    </Link>
  );
}

/** Loading or failed placeholder shown while a detail payload resolves. */
export function DetailPending({
  failed,
  failedTitle,
  loadingLabel,
}: {
  readonly failed: boolean;
  readonly failedTitle: string;
  readonly loadingLabel: string;
}) {
  return (
    <div className="route-page">
      {failed ? (
        <FailedState
          title={failedTitle}
          description="The inspector keeps the last active generation; reload once the backend reconnects."
        />
      ) : (
        <Section>
          <LoadingRows label={loadingLabel} rows={6} />
        </Section>
      )}
    </div>
  );
}

export interface EntityRow {
  readonly key: string;
  readonly href?: string | undefined;
  /** Leading element, e.g. a method chip or an icon. */
  readonly lead?: ReactNode | undefined;
  /** Mono primary text. */
  readonly title: ReactNode;
  /** Muted secondary text after the title. */
  readonly detail?: ReactNode | undefined;
  /** Right-aligned badges or values. */
  readonly trailing?: ReactNode | undefined;
}

/** Dense linked rows for relationships inside a flush Section. */
export function EntityList({
  rows,
  empty,
  label,
}: {
  readonly rows: readonly EntityRow[];
  readonly empty: string;
  readonly label?: string | undefined;
}) {
  if (rows.length === 0)
    return <p className="m-0 px-4 py-3 text-xs text-muted-foreground">{empty}</p>;
  return (
    <ul aria-label={label} className="m-0 list-none p-0">
      {rows.map((row) => {
        const body = (
          <>
            {row.lead ? <span className="flex shrink-0 items-center">{row.lead}</span> : null}
            <span className="min-w-0 truncate font-mono text-xs text-foreground">{row.title}</span>
            {row.detail ? (
              <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                {row.detail}
              </span>
            ) : null}
            {row.trailing ? (
              <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
                {row.trailing}
              </span>
            ) : null}
          </>
        );
        const rowClass =
          "flex min-h-9 min-w-0 items-center gap-2 px-4 py-1.5 text-left no-underline outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40";
        return (
          <li key={row.key} className="border-b border-border/60 last:border-b-0">
            {row.href ? (
              <Link href={row.href} className={rowClass}>
                {body}
              </Link>
            ) : (
              <div className={rowClass}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Mono, muted, right-aligned value for list trailing slots. */
export function Quiet({ children }: { readonly children: ReactNode }) {
  return (
    <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{children}</span>
  );
}

export function plural(count: number, noun: string, many = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : many}`;
}
