"use client";

import { useEffect, useMemo, useState } from "react";
import type { InspectorObject } from "../lib/api-types";
import { createInspectorBackendStream, createInspectorClient } from "../lib/client";
import {
  eventRecord,
  matchesQuery,
  mergeLiveItems,
  queryFromFilters,
  type SignalFilters,
  type SignalKind,
} from "../lib/observability-model";
import { defaultSignalFilters } from "../lib/signal-defaults";
import { SignalsFilters } from "./signals-filters";
import { SignalRows } from "./signal-rows";

export function SignalsClient({ kind }: { readonly kind: SignalKind }) {
  const [draft, setDraft] = useState<SignalFilters>(() => defaultSignalFilters(kind));
  const [filters, setFilters] = useState<SignalFilters>(() => defaultSignalFilters(kind));
  const [limit, setLimit] = useState(50);
  const [cursors, setCursors] = useState<readonly (string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [items, setItems] = useState<readonly InspectorObject[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [liveState, setLiveState] = useState("connecting");
  const [announcement, setAnnouncement] = useState("Loading telemetry…");
  const cursor = cursors[pageIndex];
  const query = useMemo(() => queryFromFilters(filters, limit, cursor), [filters, limit, cursor]);
  const title = kind === "requests" ? "Requests" : kind === "logs" ? "Logs" : "Traces";

  useEffect(() => {
    let mounted = true;
    let requestNumber = 0;
    const client = createInspectorClient();
    const refresh = async (showLoading: boolean): Promise<void> => {
      const current = ++requestNumber;
      if (showLoading) setState("loading");
      try {
        const page = await client.query<InspectorObject>(kind, query);
        if (!mounted || current !== requestNumber) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setState("ready");
        setAnnouncement(`${title} loaded. ${page.items.length} result(s) visible.`);
      } catch {
        if (mounted && current === requestNumber) {
          setState("error");
          setAnnouncement(`${title} could not be loaded.`);
        }
      }
    };
    void refresh(true);
    const stream = createInspectorBackendStream({
      onStateChange: (snapshot) => mounted && setLiveState(snapshot.state),
      onEvent: (event) => {
        if (!eventTypes(kind).includes(event.type)) return;
        client.invalidate([kind, "signals"]);
        const record = eventRecord(event);
        if (cursor === undefined && record !== undefined && matchesQuery(record, query)) {
          setItems((current) => mergeLiveItems(current, event));
          setState("ready");
          return;
        }
        void refresh(false);
      },
    });
    stream.start();
    return () => {
      mounted = false;
      stream.stop();
    };
  }, [kind, query, cursor, title]);

  const resetPage = (): void => {
    setCursors([undefined]);
    setPageIndex(0);
  };
  const apply = (): void => {
    setFilters(draft);
    resetPage();
    setAnnouncement("Filters applied. Loading results…");
  };
  const reset = (): void => {
    const defaults = defaultSignalFilters(kind);
    setDraft(defaults);
    setFilters(defaults);
    setLimit(50);
    resetPage();
    setAnnouncement("Filters reset. Loading results…");
  };

  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ACTIVE WORKSPACE</p>
          <h1>{title}</h1>
          <p className="lede">Bounded, correlated telemetry from the active generation.</p>
        </div>
        <div className="signal-status" role="status" aria-live="polite">
          <span className="badge">{items.length} visible</span>
          <span>Live: {liveState}</span>
          <span className="sr-only">{announcement}</span>
        </div>
      </header>
      <SignalsFilters
        kind={kind}
        value={draft}
        limit={limit}
        onChange={setDraft}
        onLimitChange={(value) => {
          setLimit(value);
          resetPage();
        }}
        onSubmit={apply}
        onReset={reset}
      />
      {state === "loading" && (
        <p className="panel route-state" role="status">
          Loading {title.toLowerCase()}…
        </p>
      )}
      {state === "error" && (
        <p className="panel route-state" role="alert">
          The {title.toLowerCase()} API is unavailable.
        </p>
      )}
      {state === "ready" && <SignalRows kind={kind} items={items} />}
      <nav className="signal-pagination" aria-label={`${title} pagination`}>
        <button
          className="button-link"
          type="button"
          disabled={pageIndex === 0 || state === "loading"}
          onClick={() => {
            setPageIndex((value) => Math.max(0, value - 1));
            setNextCursor(undefined);
          }}
        >
          Previous
        </button>
        <span aria-live="polite">Page {pageIndex + 1}</span>
        <button
          className="button-link"
          type="button"
          disabled={nextCursor === undefined || state === "loading"}
          onClick={() => {
            if (nextCursor !== undefined) {
              setCursors((value) => [...value, nextCursor]);
              setPageIndex((value) => value + 1);
            }
          }}
        >
          Next
        </button>
      </nav>
    </div>
  );
}

function eventTypes(kind: SignalKind): readonly string[] {
  return kind === "requests"
    ? ["request.started", "request.completed"]
    : kind === "logs"
      ? ["log.emitted"]
      : ["span.started", "span.completed"];
}
