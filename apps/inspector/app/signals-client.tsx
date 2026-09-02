"use client";

import { useEffect, useMemo, useState } from "react";
import type { InspectorObject } from "../lib/api-types";
import {
  createInspectorBackendStream,
  createInspectorClient,
  INSPECTOR_BACKEND_CONNECTED_EVENT,
} from "../lib/client";
import {
  eventRecord,
  matchesQuery,
  mergeLiveItems,
  queryFromFilters,
  type SignalFilters,
  type SignalKind,
} from "../lib/observability-model";
import { defaultSignalFilters } from "../lib/signal-defaults";
import { Pagination } from "../components/ui/pagination";
import { SignalsFilters } from "./signals-filters";
import { SignalRows } from "./signal-rows";
import { RuntimeStatus } from "./runtime-status";

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
    const refreshOnConnection = (): void => void refresh(true);
    window.addEventListener(INSPECTOR_BACKEND_CONNECTED_EVENT, refreshOnConnection);
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
      window.removeEventListener(INSPECTOR_BACKEND_CONNECTED_EVENT, refreshOnConnection);
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
          <p className="lede">
            Complete redacted local telemetry; external sampling happens afterward.
          </p>
        </div>
        <div className="signal-status" role="status" aria-live="polite">
          <span className="badge">{items.length} visible</span>
          <span>Live: {liveState}</span>
          <span className="sr-only">{announcement}</span>
        </div>
      </header>
      <RuntimeStatus telemetryOnly />
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
      <Pagination
        page={pageIndex + 1}
        hasPrevious={pageIndex > 0}
        hasNext={nextCursor !== undefined}
        disabled={state === "loading"}
        onPrevious={() => {
          setPageIndex((value) => Math.max(0, value - 1));
          setNextCursor(undefined);
        }}
        onNext={() => {
          if (nextCursor !== undefined) {
            setCursors((value) => [...value, nextCursor]);
            setPageIndex((value) => value + 1);
          }
        }}
      />
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
