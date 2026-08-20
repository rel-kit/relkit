"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { OverlayDialog } from "../components/ui/dialog";
import { Field } from "../components/ui/field";
import { Pagination } from "../components/ui/pagination";
import { type Choice, SelectField } from "../components/ui/select";
import { ContentTabs } from "../components/ui/tabs";
import type { InspectorPage, InspectorQuery } from "../lib/api-types";
import { ResourceTableBody } from "./resource-table-body";
export interface ResourceTableItem {
  readonly id: string;
  readonly [key: string]: unknown;
}
export interface ResourceTableColumn<Item extends ResourceTableItem> {
  readonly key: string;
  readonly label: string;
  readonly render: (item: Item) => ReactNode;
}
interface ResourceTableProps<Item extends ResourceTableItem> {
  readonly title: string;
  readonly description: string;
  readonly noun: string;
  readonly load: (query: InspectorQuery) => Promise<InspectorPage<Item>>;
  readonly columns: readonly ResourceTableColumn<Item>[];
  readonly href?: (item: Item) => string;
  readonly openLabel?: string;
  readonly kindOptions?: readonly Choice[];
  readonly statusOptions?: readonly Choice[];
  readonly details?: (item: Item) => ReactNode;
}
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
  }, [load, query]);

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
        <Button variant="ghost" size="sm" onPress={clear}>
          <RotateCcw aria-hidden="true" className="size-3.5" /> Reset
        </Button>
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
