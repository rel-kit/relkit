"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  InspectorBucketObject,
  InspectorCacheKey,
  InspectorResourcePage,
} from "../lib/api-types";
import { createInspectorClient } from "../lib/client";
import { Button } from "../components/ui/button";
import { BucketPreview, CachePreview } from "./resource-preview";

type Kind = "bucket" | "cache";
type Page = InspectorResourcePage<InspectorBucketObject | InspectorCacheKey>;

export function ResourceExplorer({ kind, id }: { readonly kind: Kind; readonly id: string }) {
  const api = useMemo(createInspectorClient, []);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [page, setPage] = useState<Page>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refresh, setRefresh] = useState(0);
  const cursor = cursors[pageIndex];

  useEffect(() => {
    setState("loading");
    const options = {
      limit: 50,
      ...(cursor === undefined ? {} : { cursor }),
      ...(filter === "" ? {} : kind === "bucket" ? { prefix: filter } : { search: filter }),
    };
    const request = kind === "bucket" ? api.bucketObjects(id, options) : api.cacheKeys(id, options);
    void request
      .then((value) => {
        setPage(value);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [api, cursor, filter, id, kind, refresh]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setCursors([undefined]);
    setPageIndex(0);
    setFilter(query.trim());
  };
  const next = () => {
    if (page?.nextCursor === undefined) return;
    setCursors((values) => [...values.slice(0, pageIndex + 1), page.nextCursor]);
    setPageIndex((value) => value + 1);
  };
  const reload = () => {
    api.clearCache();
    setRefresh((value) => value + 1);
  };
  const label = kind === "bucket" ? "objects" : "keys";

  return (
    <section className="panel resource-explorer" aria-labelledby="resource-explorer-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">READ-ONLY EXPLORER</p>
          <h2 id="resource-explorer-heading">
            {kind === "bucket" ? "Bucket objects" : "Cache keys"}
          </h2>
        </div>
        <Button variant="outline" size="sm" onPress={reload}>
          Refresh
        </Button>
      </div>
      <form className="resource-explorer-toolbar" role="search" onSubmit={submit}>
        <label htmlFor="resource-search">
          {kind === "bucket" ? "Object key prefix" : "Cache key search"}
        </label>
        <input
          id="resource-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={kind === "bucket" ? "images/" : "customer"}
        />
        <Button type="submit">Search</Button>
      </form>
      {state === "loading" ? (
        <p role="status">Loading {label}…</p>
      ) : state === "error" ? (
        <p role="alert">Provider explorer failed.</p>
      ) : !page?.supported ? (
        <p role="status">This provider does not support inspection.</p>
      ) : page.items.length === 0 ? (
        <p className="supporting-copy">No {label} found.</p>
      ) : (
        <ResourceRows kind={kind} id={id} items={page.items} />
      )}
      <nav className="resource-explorer-pagination" aria-label={`${label} pagination`}>
        <Button
          variant="outline"
          size="sm"
          isDisabled={pageIndex === 0}
          onPress={() => setPageIndex((value) => value - 1)}
        >
          Previous
        </Button>
        <span>Page {pageIndex + 1}</span>
        <Button
          variant="outline"
          size="sm"
          isDisabled={page?.nextCursor === undefined}
          onPress={next}
        >
          Next
        </Button>
      </nav>
    </section>
  );
}

function ResourceRows({
  kind,
  id,
  items,
}: {
  readonly kind: Kind;
  readonly id: string;
  readonly items: readonly (InspectorBucketObject | InspectorCacheKey)[];
}) {
  return (
    <table className="resource-explorer-table">
      <caption className="sr-only">{kind === "bucket" ? "Bucket objects" : "Cache keys"}</caption>
      <tbody>
        {items.map((item) => (
          <tr className="resource-explorer-row" key={item.key}>
            <td>
              <code>{item.key}</code>
            </td>
            <td>
              {kind === "cache"
                ? cacheMeta(item as InspectorCacheKey)
                : bucketMeta(item as InspectorBucketObject)}
            </td>
            <td>
              {kind === "bucket" ? (
                <BucketPreview bucketId={id} objectKey={item.key} />
              ) : (
                <CachePreview cacheId={id} cacheKey={item.key} />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function cacheMeta(item: InspectorCacheKey): string {
  return `${item.type} · ${item.bytes.toLocaleString("en-US")} B · ${item.ttlMs === null ? "no TTL" : `${item.ttlMs} ms TTL`}`;
}

function bucketMeta(item: InspectorBucketObject): string {
  const size =
    typeof item.size === "number"
      ? item.size
      : typeof item.metadata?.size === "number"
        ? item.metadata.size
        : undefined;
  return size === undefined ? "Metadata available" : `${size.toLocaleString("en-US")} B`;
}
