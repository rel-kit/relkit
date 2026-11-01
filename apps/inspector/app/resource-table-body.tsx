"use client";

import { ArrowUpRight, Eye } from "lucide-react";
import { Button } from "../components/ui/button";
import { DataTable, DataTableCell, DataTableEmpty, DataTableHead } from "../components/ui/table";
import { FailedState, LoadingRows } from "../components/blocks/block-state";
import { EmptyState } from "../components/neon/empty-state";
import type { ResourceTableColumn, ResourceTableItem } from "./resource-table";

export function ResourceTableBody<Item extends ResourceTableItem>({
  state,
  noun,
  items,
  columns,
  href,
  openLabel = "Open details",
  emptyMessage,
  onSelect,
}: {
  readonly state: "loading" | "ready" | "error";
  readonly noun: string;
  readonly items: readonly Item[];
  readonly columns: readonly ResourceTableColumn<Item>[];
  readonly href?: (item: Item) => string;
  readonly openLabel?: string;
  readonly emptyMessage?: string;
  readonly onSelect: (item: Item) => void;
}) {
  if (state === "error") {
    return (
      <FailedState
        title={`The ${noun} API is unavailable. The active generation remains unchanged.`}
        description="The inspector keeps retrying as the backend reconnects."
      />
    );
  }
  if (state === "loading" && items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <LoadingRows label={`Loading ${noun}`} rows={8} />
      </div>
    );
  }
  if (state === "ready" && items.length === 0 && emptyMessage)
    return <EmptyState title={emptyMessage} />;
  return (
    <DataTable>
      <thead>
        <tr>
          <DataTableHead>ID</DataTableHead>
          {columns.map((column) => (
            <DataTableHead key={column.key}>{column.label}</DataTableHead>
          ))}
          <DataTableHead className="w-0 text-right">
            <span className="sr-only">Actions</span>
          </DataTableHead>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr>
            <DataTableEmpty>
              {emptyMessage ?? `No ${noun} match the active filters.`}
            </DataTableEmpty>
          </tr>
        ) : (
          items.map((item) => (
            <tr key={item.id} className="group transition-colors hover:bg-muted/40">
              <DataTableCell className="max-w-80">
                {href ? (
                  <a
                    href={href(item)}
                    className="block truncate font-mono text-xs font-medium text-foreground no-underline hover:underline"
                    title={item.id}
                  >
                    {item.id}
                  </a>
                ) : (
                  <span className="block truncate font-mono text-xs font-medium" title={item.id}>
                    {item.id}
                  </span>
                )}
              </DataTableCell>
              {columns.map((column) => (
                <DataTableCell key={column.key}>{column.render(item)}</DataTableCell>
              ))}
              <DataTableCell>
                <div className="table-actions flex items-center justify-end gap-0.5 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Quick view"
                    onPress={() => onSelect(item)}
                  >
                    <Eye aria-hidden="true" />
                  </Button>
                  {href && (
                    // A plain anchor, as before the redesign: detail pages load as full pages.
                    <a
                      className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground no-underline hover:bg-muted hover:text-foreground"
                      href={href(item)}
                      aria-label={openLabel}
                      title={openLabel}
                    >
                      <ArrowUpRight aria-hidden="true" className="size-3.5" />
                    </a>
                  )}
                </div>
              </DataTableCell>
            </tr>
          ))
        )}
      </tbody>
    </DataTable>
  );
}
