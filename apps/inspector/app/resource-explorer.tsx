"use client";

/*
 * Object / key browser shaped after Neon UI SchemaExplorer (MIT, see public/THIRD_PARTY_NOTICES.txt):
 * prefix groups → objects (or value type → keys), right-aligned mono detail, bounded pages.
 * It stays a real table so every key is a cell for keyboard and screen-reader navigation.
 */
import {
  ChevronLeft,
  ChevronRight,
  Database,
  FileText,
  Folder,
  HardDrive,
  KeyRound,
  RefreshCw,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  InspectorBucketObject,
  InspectorCacheKey,
  InspectorResourcePage,
} from "../lib/api-types";
import { createInspectorClient } from "../lib/client";
import { Button } from "../components/ui/button";
import { FailedState, LoadingRows } from "../components/blocks/block-state";
import { EmptyState } from "../components/neon/empty-state";
import { cn } from "../lib/utils";
import { BucketPreview, CachePreview } from "./resource-preview";

type Kind = "bucket" | "cache";
type Item = InspectorBucketObject | InspectorCacheKey;
type Page = InspectorResourcePage<Item>;

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

  const submit = (event: FormEvent) => {
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
  const title = kind === "bucket" ? "Bucket objects" : "Cache keys";
  const count = state === "ready" && page?.supported ? page.items.length : undefined;

  return (
    <section
      className="@container min-w-0 overflow-hidden rounded-lg border border-border bg-card"
      aria-labelledby="resource-explorer-heading"
      data-slot="tree-explorer"
    >
      <header className="flex min-h-11 items-center gap-2 border-b border-border px-3">
        <span
          aria-hidden="true"
          className="grid size-6 shrink-0 place-items-center rounded-md bg-live/10 text-live [&_svg]:size-3.5"
        >
          {kind === "bucket" ? <HardDrive /> : <Database />}
        </span>
        <div className="min-w-0">
          <h2 id="resource-explorer-heading" className="m-0 truncate text-[13px] font-semibold">
            {title}
          </h2>
          <p className="m-0 text-[11px] text-muted-foreground">
            Read-only explorer
            {count === undefined
              ? ""
              : ` · ${count} ${count === 1 ? label.slice(0, -1) : label} on page ${pageIndex + 1}`}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="ml-auto" onPress={reload}>
          <RefreshCw aria-hidden="true" />
          Refresh
        </Button>
      </header>
      <form
        className="flex h-10 items-center gap-2 border-b border-border px-3 focus-within:ring-2 focus-within:ring-ring/40 focus-within:ring-inset"
        role="search"
        onSubmit={submit}
      >
        <Search aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <label htmlFor="resource-search" className="sr-only">
          {kind === "bucket" ? "Object key prefix" : "Cache key search"}
        </label>
        <input
          id="resource-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            kind === "bucket" ? "Filter by key prefix, e.g. images/" : "Search keys, e.g. customer"
          }
          className="min-w-0 flex-1 bg-transparent font-mono text-xs text-foreground outline-none placeholder:font-sans placeholder:text-muted-foreground/70"
        />
        {filter !== "" ? (
          <span className="shrink-0 rounded-sm bg-muted px-1.5 py-px font-mono text-[10.5px] text-muted-foreground">
            {filter}
          </span>
        ) : null}
        <Button type="submit" variant="secondary" size="sm">
          Search
        </Button>
      </form>
      {state === "loading" ? (
        <LoadingRows label={`Loading ${label}…`} rows={5} />
      ) : state === "error" ? (
        <div className="p-3">
          <FailedState
            title="Provider explorer failed."
            description="The provider did not answer the bounded listing request."
            onRetry={reload}
          />
        </div>
      ) : !page?.supported ? (
        <EmptyState
          variant="bare"
          size="sm"
          icon={kind === "bucket" ? <HardDrive /> : <Database />}
          title={<span role="status">This provider does not support inspection.</span>}
          description="Its metadata and declared policy are still shown on this page."
        />
      ) : page.items.length === 0 ? (
        <EmptyState
          variant="bare"
          size="sm"
          icon={kind === "bucket" ? <Folder /> : <KeyRound />}
          title={`No ${label} found.`}
          description={
            filter === ""
              ? `The ${kind} is empty.`
              : `Nothing ${kind === "bucket" ? "starts with" : "matches"} “${filter}”.`
          }
        />
      ) : (
        <ResourceRows kind={kind} id={id} items={page.items} />
      )}
      <nav
        className="flex items-center justify-between gap-3 border-t border-border px-3 py-2"
        aria-label={`${label} pagination`}
      >
        <Button
          variant="ghost"
          size="sm"
          isDisabled={pageIndex === 0}
          onPress={() => setPageIndex((value) => value - 1)}
        >
          <ChevronLeft aria-hidden="true" /> Previous
        </Button>
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          Page {pageIndex + 1}
        </span>
        <Button
          variant="ghost"
          size="sm"
          isDisabled={page?.nextCursor === undefined}
          onPress={next}
        >
          Next <ChevronRight aria-hidden="true" />
        </Button>
      </nav>
    </section>
  );
}

interface Group {
  readonly id: string;
  readonly label: string;
  readonly items: readonly Item[];
}

function ResourceRows({
  kind,
  id,
  items,
}: {
  readonly kind: Kind;
  readonly id: string;
  readonly items: readonly Item[];
}) {
  const groups = useMemo(() => groupItems(kind, items), [items, kind]);
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (group: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  return (
    <div className="neon-scroll-fade max-h-[60vh] overflow-y-auto p-1.5">
      <table className="w-full border-separate border-spacing-0 text-xs">
        <caption className="sr-only">{kind === "bucket" ? "Bucket objects" : "Cache keys"}</caption>
        {groups.map((group) => {
          const open = !closed.has(group.id);
          return (
            <tbody key={group.id}>
              <tr>
                <th scope="rowgroup" colSpan={3} className="p-0 text-left font-normal">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggle(group.id)}
                    className="flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <ChevronRight
                      aria-hidden="true"
                      className={cn(
                        "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
                        open && "rotate-90",
                      )}
                    />
                    <span
                      aria-hidden="true"
                      className="grid size-5 shrink-0 place-items-center rounded-sm border border-border bg-background text-muted-foreground [&_svg]:size-3"
                    >
                      {kind === "bucket" ? <Folder /> : <KeyRound />}
                    </span>
                    <span className="min-w-0 truncate font-mono text-xs font-medium text-foreground">
                      {group.label}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">
                      {group.items.length} {kind === "bucket" ? "objects" : "keys"}
                    </span>
                  </button>
                </th>
              </tr>
              {open
                ? group.items.map((item) => (
                    <tr className="group/row" key={item.key}>
                      <td className="h-8 rounded-l-md py-0 pr-2 pl-7 group-hover/row:bg-muted/50">
                        <span className="flex min-w-0 items-center gap-2 border-l border-border/70 pl-2.5">
                          {kind === "bucket" ? (
                            <FileText
                              aria-hidden="true"
                              className="size-3 shrink-0 text-muted-foreground/70"
                            />
                          ) : (
                            <KeyRound
                              aria-hidden="true"
                              className="size-3 shrink-0 text-muted-foreground/70"
                            />
                          )}
                          <code className="min-w-0 truncate bg-transparent p-0 font-mono text-xs text-foreground/90">
                            {kind === "bucket" &&
                            item.key.startsWith(group.id) &&
                            group.id !== "" ? (
                              <>
                                <span className="text-muted-foreground/70">{group.id}</span>
                                {item.key.slice(group.id.length)}
                              </>
                            ) : (
                              item.key
                            )}
                          </code>
                        </span>
                      </td>
                      <td className="h-8 py-0 pr-3 text-right font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular-nums group-hover/row:bg-muted/50">
                        {kind === "cache"
                          ? cacheMeta(item as InspectorCacheKey)
                          : bucketMeta(item as InspectorBucketObject)}
                      </td>
                      <td className="h-8 w-0 rounded-r-md py-0 pr-1 text-right group-hover/row:bg-muted/50">
                        {kind === "bucket" ? (
                          <BucketPreview bucketId={id} objectKey={item.key} />
                        ) : (
                          <CachePreview cacheId={id} cacheKey={item.key} />
                        )}
                      </td>
                    </tr>
                  ))
                : null}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

/** Buckets group by key prefix (up to the last "/"); caches group by value type. */
function groupItems(kind: Kind, items: readonly Item[]): readonly Group[] {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key =
      kind === "bucket"
        ? item.key.includes("/")
          ? item.key.slice(0, item.key.lastIndexOf("/") + 1)
          : ""
        : (item as InspectorCacheKey).type || "value";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([group, members]) => ({
    id: group,
    label: kind === "bucket" ? group || "/" : group,
    items: members,
  }));
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
