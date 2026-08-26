"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { OverlayDialog } from "../components/ui/dialog";
import { Field } from "../components/ui/field";
import { Pagination } from "../components/ui/pagination";
import { SelectField } from "../components/ui/select";
import { ContentTabs } from "../components/ui/tabs";
import type { InspectorQuery } from "../lib/api-types";
import { INSPECTOR_BACKEND_CONNECTED_EVENT } from "../lib/client";
import { ResourceTableBody } from "./resource-table-body";
import type { ResourceTableItem, ResourceTableProps } from "./resource-table-types";
export type { ResourceTableColumn, ResourceTableItem } from "./resource-table-types";
export function ResourceTable<Item extends ResourceTableItem>({
  title,
  description,
  noun,
  load,
  columns,
  href,
  openLabel,
  kindOptions = [],
  statusOptions = [],
  details,
}: ResourceTableProps<Item>) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [items, setItems] = useState<readonly Item[]>([]);
  const [cursors, setCursors] = useState<readonly (string | undefined)[]>([undefined]);
  const [page, setPage] = useState(0);
  const [nextCursor, setNextCursor] = useState<string>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<Item>();
  const request = useRef(0);
  const query = useMemo<InspectorQuery>(
    () => ({
      limit: 20,
      ...(cursors[page] ? { cursor: cursors[page] } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(kind !== "all" ? { kind } : {}),
      ...(status !== "all" ? { status } : {}),
    }),
    [cursors, kind, page, search, status],
  );

  useEffect(() => {
    const refreshOnConnection = (): void => setRefresh((value) => value + 1);
    window.addEventListener(INSPECTOR_BACKEND_CONNECTED_EVENT, refreshOnConnection);
    return () => window.removeEventListener(INSPECTOR_BACKEND_CONNECTED_EVENT, refreshOnConnection);
  }, []);

  useEffect(() => {
    const current = ++request.current;
    setState("loading");
    void load(query)
      .then((result) => {
        if (current !== request.current) return;
        setItems(result.items);
        setNextCursor(result.nextCursor);
        setState("ready");
      })
      .catch(() => current === request.current && setState("error"));
  }, [load, query, refresh]);

  const resetPage = (): void => {
    setCursors([undefined]);
    setPage(0);
  };
  const clear = (): void => {
    setSearch("");
    setKind("all");
    setStatus("all");
    resetPage();
  };

  return (
    <div className="route-page resource-table-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ACTIVE WORKSPACE</p>
          <h1>{title}</h1>
          <p className="lede">{description}</p>
        </div>
        <Badge>{items.length} visible</Badge>
      </header>
      <Card className="resource-toolbar" aria-label={`${title} filters`}>
        <div className="resource-filter-heading">
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          <strong>Filters</strong>
          <span>Search and narrow the active collection.</span>
        </div>
        <Field
          label={`Search ${noun}`}
          value={search}
          onChange={(value) => {
            setSearch(value);
            resetPage();
          }}
          placeholder={`Search ${noun} IDs and metadata`}
        />
        {kindOptions.length > 0 && (
          <SelectField
            label="Kind"
            items={[allChoice, ...kindOptions]}
            value={kind}
            onChange={(value) => {
              setKind(value);
              resetPage();
            }}
          />
        )}
        {statusOptions.length > 0 && (
          <SelectField
            label="Status"
            items={[allChoice, ...statusOptions]}
            value={status}
            onChange={(value) => {
              setStatus(value);
              resetPage();
            }}
          />
        )}
        <div className="resource-filter-footer">
          <Button variant="ghost" size="sm" onPress={clear}>
            <RotateCcw aria-hidden="true" className="size-3.5" /> Reset filters
          </Button>
        </div>
      </Card>
      <ResourceTableBody
        state={state}
        noun={noun}
        items={items}
        columns={columns}
        {...(href === undefined ? {} : { href })}
        {...(openLabel === undefined ? {} : { openLabel })}
        onSelect={setSelected}
      />
      <Pagination
        page={page + 1}
        hasPrevious={page > 0}
        hasNext={nextCursor !== undefined}
        disabled={state === "loading"}
        onPrevious={() => {
          setPage((value) => Math.max(0, value - 1));
          setNextCursor(undefined);
        }}
        onNext={() => {
          if (nextCursor) {
            setCursors((value) => [...value.slice(0, page + 1), nextCursor]);
            setPage((value) => value + 1);
          }
        }}
      />
      <OverlayDialog
        placement="right"
        title={selected?.id ?? noun}
        description={`Quick ${noun} inspection; the canonical URL remains shareable.`}
        isOpen={selected !== undefined}
        onOpenChange={(open) => !open && setSelected(undefined)}
        trigger={
          <Button className="sr-only" tabIndex={-1}>
            Open quick view
          </Button>
        }
      >
        {selected && (
          <ContentTabs
            label={`${noun} details`}
            items={[
              {
                id: "summary",
                label: "Summary",
                content: details?.(selected) ?? (
                  <p className="supporting-copy">No additional summary is available.</p>
                ),
              },
              {
                id: "raw",
                label: "Safe metadata",
                content: <pre className="safe-json">{JSON.stringify(selected, null, 2)}</pre>,
              },
            ]}
          />
        )}
      </OverlayDialog>
    </div>
  );
}
const allChoice = { id: "all", label: "All" } as const;
