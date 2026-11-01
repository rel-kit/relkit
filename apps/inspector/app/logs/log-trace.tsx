"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { Button } from "../../components/ui/button";
import { LoadingRows } from "../../components/blocks/block-state";
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
        <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Trace
        </h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onPress={() => setRevision((value) => value + 1)}>
            <RefreshCw aria-hidden="true" />
            Refresh
          </Button>
          <Link
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-foreground no-underline hover:bg-muted"
            href={`/traces/${encodeURIComponent(traceId)}`}
          >
            Open full trace
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </Link>
        </div>
      </div>
      {state === "loading" ? (
        <LoadingRows label="Loading trace…" rows={3} />
      ) : state === "unavailable" ? (
        <p className="log-trace-note">
          Trace unavailable. It may not have been captured or may have expired.
        </p>
      ) : (
        <>
          {missingSpans && (
            <p className="log-trace-note">
              Trace unavailable. It may not have been captured or may have expired.
            </p>
          )}
          {requestState && (
            <p className="log-trace-note" role="status">
              {requestState}
            </p>
          )}
          {summary && <TraceSummary summary={summary} />}
          {cursor && (
            <p className="log-trace-note" role="status">
              Partial trace: more records are retained.
            </p>
          )}
          {!cursor &&
            expectedSpans !== undefined &&
            new Set(spans.map((span) => span.spanId)).size < expectedSpans && (
              <p className="log-trace-note" role="status">
                Partial trace: some spans are no longer retained.
              </p>
            )}
          {spanId && !spans.some((span) => span.spanId === spanId) && (
            <p className="log-trace-note" role="status">
              The associated span is not in the loaded records. It may have expired.
            </p>
          )}
          <TraceWaterfall spans={spans} requests={requests} compact highlightedSpanId={spanId} />
          {cursor && (
            <Button
              size="sm"
              variant="secondary"
              className="justify-self-start"
              isDisabled={state === "loading-more"}
              onPress={() => void loadMore()}
            >
              Load more trace records
            </Button>
          )}
          {state === "partial" && (
            <p className="log-trace-note text-danger" role="alert">
              More trace records could not be loaded. Retry when connected.
            </p>
          )}
        </>
      )}
    </section>
  );
}
