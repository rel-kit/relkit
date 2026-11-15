"use client";

import { Plug, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FailedState, LoadingRows } from "../components/blocks/block-state";
import { PageHeader } from "../components/blocks/page-header";
import { EmptyState } from "../components/neon/empty-state";
import { Button } from "../components/ui/button";
import { Field } from "../components/ui/field";
import { Pagination } from "../components/ui/pagination";
import type { InspectorObject, InspectorQuery } from "../lib/api-types";
import { createInspectorClient, INSPECTOR_BACKEND_CONNECTED_EVENT } from "../lib/client";
import { providerHealth, releaseSourceSummary } from "../lib/provider-provenance";
import { ProviderCard, providerItem, type ProviderItem } from "./provider-card";

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
    const api = createInspectorClient();
    const states = (collection: "buckets" | "cache") =>
      api
        .runtimeList<InspectorObject>(collection, { limit: 100 })
        .then((page) => page.items)
        .catch(() => [] as readonly InspectorObject[]);
    void Promise.all([
      api.list<InspectorObject>("providers", query),
      states("buckets"),
      states("cache"),
    ])
      .then(([result, bucket, cache]) => {
        if (current !== request.current) return;
        setItems(
          result.items.map((item) =>
            providerItem(item, (capability, profile) =>
              providerHealth(capability, profile, { bucket, cache }),
            ),
          ),
        );
        setNextCursor(result.nextCursor);
        setState("ready");
      })
      .catch(() => current === request.current && setState("error"));
  }, [query, refresh]);

  return (
    <div className="route-page resource-table-page">
      <PageHeader
        title="Providers"
        description="Capability bindings from the active graph, without connection values or secrets."
        badges={
          <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
            {state === "loading" && items.length === 0
              ? "…"
              : releaseSourceSummary(items.map((item) => item.source))}
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
