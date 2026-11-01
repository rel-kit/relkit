"use client";

import { ArrowUpRight, Plug, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FailedState, LoadingRows } from "../components/blocks/block-state";
import { PageHeader } from "../components/blocks/page-header";
import { EmptyState } from "../components/neon/empty-state";
import { StatusBadge, statusTone } from "../components/neon/status-badge";
import { Button } from "../components/ui/button";
import { Field } from "../components/ui/field";
import { Pagination } from "../components/ui/pagination";
import type { InspectorObject, InspectorQuery } from "../lib/api-types";
import { createInspectorClient, INSPECTOR_BACKEND_CONNECTED_EVENT } from "../lib/client";

interface ProviderItem {
  readonly id: string;
  readonly capability: string;
  readonly profile: string;
  readonly adapter: string;
  readonly integration: string;
  readonly source: string;
  readonly features: readonly string[];
  readonly references: number;
  readonly sensitive: number;
  readonly roles: number;
  readonly local: boolean;
}

/** Provider bindings as a grid of health cards: one card per capability binding. */
export function ProviderList() {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<readonly ProviderItem[]>([]);
  const [cursors, setCursors] = useState<readonly (string | undefined)[]>([undefined]);
  const [page, setPage] = useState(0);
  const [nextCursor, setNextCursor] = useState<string>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refresh, setRefresh] = useState(0);
  const request = useRef(0);
  const query = useMemo<InspectorQuery>(
    () => ({
      limit: 48,
      ...(cursors[page] ? { cursor: cursors[page] } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
    }),
    [cursors, page, search],
  );

  useEffect(() => {
    const reload = (): void => setRefresh((value) => value + 1);
    window.addEventListener(INSPECTOR_BACKEND_CONNECTED_EVENT, reload);
    return () => window.removeEventListener(INSPECTOR_BACKEND_CONNECTED_EVENT, reload);
  }, []);

  useEffect(() => {
    const current = ++request.current;
    setState("loading");
    void createInspectorClient()
      .list<InspectorObject>("providers", query)
      .then((result) => {
        if (current !== request.current) return;
        setItems(result.items.map(providerItem));
        setNextCursor(result.nextCursor);
        setState("ready");
      })
      .catch(() => current === request.current && setState("error"));
  }, [query, refresh]);

  const connected = items.filter((item) => statusTone(item.source) === "success").length;
  return (
    <div className="route-page resource-table-page">
      <PageHeader
        title="Providers"
        description="Capability bindings from the active graph, without connection values or secrets."
        badges={
          <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
            {state === "loading" && items.length === 0
              ? "…"
              : `${connected}/${items.length} connected`}
          </span>
        }
        actions={
          <Button
            variant="ghost"
            size="sm"
            aria-label="Refresh providers"
            onPress={() => setRefresh((value) => value + 1)}
          >
            <RefreshCw aria-hidden="true" />
            Refresh
          </Button>
        }
      />
      <div role="search" aria-label="Providers filters" className="flex items-center gap-2">
        <Field
          compact
          className="max-w-md min-w-56 flex-1"
          icon={<Search />}
          label="Search providers"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setCursors([undefined]);
            setPage(0);
          }}
          placeholder="Search by capability, adapter or profile…"
        />
      </div>
      {state === "error" ? (
        <FailedState
          title="The providers API is unavailable. The active generation remains unchanged."
          description="The inspector keeps retrying as the backend reconnects."
          onRetry={() => setRefresh((value) => value + 1)}
        />
      ) : state === "loading" && items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <LoadingRows label="Loading providers" rows={6} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Plug />}
          title={search ? "No providers match this search." : "No provider bindings"}
          description={
            search
              ? "Clear the search to see every capability binding."
              : "Capabilities the application uses are bound to providers in relkit.config.ts."
          }
        />
      ) : (
        <ul
          aria-label="Provider bindings"
          className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3"
        >
          {items.map((item) => (
            <ProviderCard key={item.id} item={item} />
          ))}
        </ul>
      )}
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
    </div>
  );
}

function ProviderCard({ item }: { readonly item: ProviderItem }) {
  const href = `/providers/${encodeURIComponent(item.id)}`;
  return (
    <li className="group relative flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-3.5 transition-colors hover:border-foreground/25 focus-within:border-ring">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-muted text-muted-foreground"
          >
            <Plug className="size-3.5" />
          </span>
          <div className="min-w-0">
            <h2 className="m-0 truncate text-[13px] font-semibold">
              <Link
                href={href}
                className="text-foreground no-underline outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:underline"
              >
                {item.capability}
              </Link>
            </h2>
            <p className="m-0 truncate font-mono text-[11px] text-muted-foreground" title={item.id}>
              {item.id}
            </p>
          </div>
        </div>
        <StatusBadge tone={statusTone(item.source)} label={item.source} />
      </div>
      <div className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
        <Row label="Adapter" value={item.adapter} />
        <Row label="Integration" value={item.integration} />
        <Row label="Profile" value={item.profile} />
      </div>
      <div className="mt-auto flex min-w-0 flex-wrap items-center gap-1 border-t border-border/70 pt-2.5">
        {item.features.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">No optional features</span>
        ) : (
          item.features.map((feature) => (
            <span
              key={feature}
              className="rounded-sm bg-muted px-1.5 py-px font-mono text-[10.5px] text-foreground/80"
            >
              {feature}
            </span>
          ))
        )}
        <span className="ml-auto flex items-center gap-2 font-mono text-[10.5px] text-muted-foreground tabular-nums">
          {item.local ? <span title="Declares a local service recipe">local</span> : null}
          <span title="Required binding values">
            {item.references} value{item.references === 1 ? "" : "s"}
            {item.sensitive > 0 ? ` · ${item.sensitive} secret` : ""}
          </span>
          <ArrowUpRight
            aria-hidden="true"
            className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100"
          />
        </span>
      </div>
    </li>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span
        className="m-0 min-w-0 truncate text-right font-mono text-[11px] text-foreground/90"
        title={value}
      >
        {value}
      </span>
    </>
  );
}

function providerItem(value: InspectorObject): ProviderItem {
  const adapter = record(value.adapter);
  const source = record(value.providerSource);
  const named = Array.isArray(value.namedValues) ? value.namedValues : [];
  return {
    id: text(value.id),
    capability: text(value.capability),
    profile: text(value.profile),
    adapter: text(adapter?.adapterId),
    integration: text(adapter?.integrationId),
    source: text(source?.kind),
    features: Array.isArray(adapter?.features)
      ? adapter.features.filter((item): item is string => typeof item === "string")
      : [],
    references: named.length,
    sensitive: named.filter((item) => record(item)?.sensitive === true).length,
    roles: Array.isArray(value.deploymentRoles) ? value.deploymentRoles.length : 0,
    local: record(value.local) !== undefined,
  };
}

function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "Unavailable";
}
