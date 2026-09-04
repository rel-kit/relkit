"use client";

import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import type { InspectorObject } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { traceDetail } from "../../lib/observability-api";
import { TraceWaterfall } from "../trace-waterfall";
import { attachLogs } from "../signal-detail-live";
import { TraceSummary } from "./log-trace-summary";

export function LogTrace({
  traceId,
  spanId,
}: {
  readonly traceId: string;
  readonly spanId: string;
}) {
  const [state, setState] = useState("loading");
  const [spans, setSpans] = useState<readonly InspectorObject[]>([]);
  const [requests, setRequests] = useState<readonly InspectorObject[]>([]);
  const [summary, setSummary] = useState<InspectorObject>();
  const [requestState, setRequestState] = useState("");
  const [missingSpans, setMissingSpans] = useState(false);
  const [cursor, setCursor] = useState<string>();
  const [expectedSpans, setExpectedSpans] = useState<number>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!traceId) return;
    let disposed = false;
    setState("loading");
    const client = createInspectorClient();
    void Promise.all([
      traceDetail(client, traceId).catch(() => undefined),
      client.query("requests", { traceId, limit: 100 }).catch(() => undefined),
      client.query("logs", { traceId, limit: 100 }).catch(() => undefined),
    ])
      .then(([detail, page, logs]) => {
        if (disposed) return;
        const requests = page?.items ?? [];
        setSpans(attachLogs(detail?.spans ?? [], logs?.items ?? []));
        setRequests(requests);
        setSummary(
          requests.find((item) => item.phase === "completed") ?? requests[0] ?? detail?.trace,
        );
        setMissingSpans(!detail);
        setRequestState(
          !page
            ? "Request lifecycle could not be loaded."
            : page.nextCursor
              ? "Partial lifecycle: more requests are retained. Open Requests to inspect them."
              : page.items.length === 0
                ? "No HTTP request is retained for this trace."
                : "",
        );
        setExpectedSpans(
          typeof detail?.trace?.spanCount === "number" ? detail.trace.spanCount : undefined,
        );
        setCursor(detail?.nextCursor);
        setState(detail || page?.items.length ? "ready" : "unavailable");
      })
      .catch(() => {
        if (!disposed) setState("unavailable");
      });
    return () => {
      disposed = true;
    };
  }, [traceId, revision]);
  const loadMore = async () => {
    setState("loading-more");
    try {
      const client = createInspectorClient();
      const [page, logs] = await Promise.all([
        client.query("traces", { traceId, cursor: cursor!, limit: 100 }),
        client.query("logs", { traceId, limit: 100 }),
      ]);
      setSpans((current) => [
        ...current,
        ...attachLogs(
          page.items.filter((item) => item.signal === "span"),
          logs.items,
        ),
      ]);
      setCursor(page.nextCursor);
      setState("ready");
    } catch {
      setState("partial");
    }
  };
  if (!traceId) return <p className="log-trace-state">No trace is associated with this log.</p>;
  return (
    <section className="log-inline-trace" aria-label="Associated trace">
      <div className="log-trace-heading">
        <strong>Trace</strong>
        <a className="text-link" href={`/traces/${encodeURIComponent(traceId)}`}>
          Open full trace
        </a>
        <Button variant="ghost" size="sm" onPress={() => setRevision((value) => value + 1)}>
          Refresh
        </Button>
      </div>
      {state === "loading" ? (
        <p role="status">Loading trace…</p>
      ) : state === "unavailable" ? (
        <p>Trace unavailable. It may not have been captured or may have expired.</p>
      ) : (
        <>
          {missingSpans && (
            <p>Trace unavailable. It may not have been captured or may have expired.</p>
          )}
          {requestState && <p role="status">{requestState}</p>}
          {summary && <TraceSummary summary={summary} />}
          {cursor && <p role="status">Partial trace: more records are retained.</p>}
          {!cursor &&
            expectedSpans !== undefined &&
            new Set(spans.map((span) => span.spanId)).size < expectedSpans && (
              <p role="status">Partial trace: some spans are no longer retained.</p>
            )}
          {spanId && !spans.some((span) => span.spanId === spanId) && (
            <p role="status">
              The associated span is not in the loaded records. It may have expired.
            </p>
          )}
          <TraceWaterfall spans={spans} requests={requests} compact highlightedSpanId={spanId} />
          {cursor && (
            <Button
              size="sm"
              variant="secondary"
              isDisabled={state === "loading-more"}
              onPress={() => void loadMore()}
            >
              Load more trace records
            </Button>
          )}
          {state === "partial" && (
            <p role="alert">More trace records could not be loaded. Retry when connected.</p>
          )}
        </>
      )}
    </section>
  );
}
