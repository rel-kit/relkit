import type { ReactNode } from "react";
import { PageHeader, type PageHeaderProps } from "../components/blocks/page-header";
import { cn } from "../lib/utils";

/**
 * Detail page frame: identity header, a main column of Sections, and an optional right rail
 * for contract metadata. Every resource detail page uses it so they read the same way.
 */
export function DetailLayout({
  header,
  lead,
  children,
  aside,
  className,
}: {
  readonly header: PageHeaderProps;
  /** Full-width content between the header and the columns, e.g. a trace timeline. */
  readonly lead?: ReactNode;
  readonly children: ReactNode;
  readonly aside?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn("route-page detail-layout", className)}>
      <PageHeader {...header} />
      {lead}
      <div
        className={cn(
          "grid min-w-0 items-start gap-4",
          aside ? "xl:grid-cols-[minmax(0,1fr)_20rem]" : undefined,
        )}
      >
        <div className="grid min-w-0 gap-4">{children}</div>
        {aside ? <aside className="grid min-w-0 gap-4 xl:sticky xl:top-16">{aside}</aside> : null}
      </div>
    </div>
  );
}
