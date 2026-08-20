"use client";

import { Eye, ExternalLink } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { DataTable, DataTableCell, DataTableEmpty, DataTableHead } from "../components/ui/table";
import type { ResourceTableColumn, ResourceTableItem } from "./resource-table";

export function ResourceTableBody<Item extends ResourceTableItem>({
  state,
  noun,
  items,
  columns,
  href,
  openLabel = "Open details",
  onSelect,
}: {
  readonly state: "loading" | "ready" | "error";
  readonly noun: string;
  readonly items: readonly Item[];
  readonly columns: readonly ResourceTableColumn<Item>[];
  readonly href?: (item: Item) => string;
  readonly openLabel?: string;
  readonly onSelect: (item: Item) => void;
}) {
  if (state === "error") {
    return (
      <Card role="alert">
        The {noun} API is unavailable. The active generation remains unchanged.
      </Card>
    );
  }
  if (state === "loading" && items.length === 0) {
    return (
      <Card role="status" aria-label={`Loading ${noun}`}>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="mt-3 h-8 w-4/5" />
      </Card>
    );
  }
  return (
    <DataTable>
      <thead>
        <tr>
          <DataTableHead>ID</DataTableHead>
          {columns.map((column) => (
            <DataTableHead key={column.key}>{column.label}</DataTableHead>
          ))}
          <DataTableHead>Actions</DataTableHead>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr>
            <DataTableEmpty>No {noun} match the active filters.</DataTableEmpty>
          </tr>
        ) : (
          items.map((item) => (
            <tr key={item.id}>
              <DataTableCell>
                <strong>{item.id}</strong>
              </DataTableCell>
              {columns.map((column) => (
                <DataTableCell key={column.key}>{column.render(item)}</DataTableCell>
              ))}
              <DataTableCell>
                <div className="table-actions">
                  <Button variant="ghost" size="sm" onPress={() => onSelect(item)}>
                    <Eye aria-hidden="true" className="size-3.5" /> Quick view
                  </Button>
                  {href && (
                    <a className="text-link" href={href(item)}>
                      {openLabel} <ExternalLink aria-hidden="true" className="size-3" />
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
