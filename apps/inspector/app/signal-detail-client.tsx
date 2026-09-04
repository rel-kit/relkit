"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { InspectorObject } from "../lib/api-types";
import { createInspectorBackendStream, createInspectorClient } from "../lib/client";
import { requestDetail, traceDetail } from "../lib/observability-api";
import { eventRecord, records, text } from "../lib/observability-model";
import { SignalDetailView } from "./signal-detail-view";
import { Button } from "../components/ui/button";
import { attachLogs, attachSources, isSignalDetailEvent } from "./signal-detail-live";

interface SignalDetailData {
  readonly nextCursor?: string;
  readonly request?: InspectorObject;
  readonly trace?: InspectorObject;
  readonly records: readonly InspectorObject[];
  readonly spans: readonly InspectorObject[];
  readonly logs: readonly InspectorObject[];
  readonly requests: readonly InspectorObject[];
  readonly continuations?: readonly InspectorObject[];
  readonly incomplete?: readonly string[];
}

export function SignalDetailClient({ kind }: { readonly kind: "requests" | "traces" }) {
  const params = useParams<{ requestId?: string; traceId?: string }>();
  const id = kind === "requests" ? text(params?.requestId) : text(params?.traceId);
  const [data, setData] = useState<SignalDetailData>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [liveState, setLiveState] = useState("connecting");
  const [paging, setPaging] = useState("ready");
  const loadMore = async () => {
    if (!data?.nextCursor) return;
    setPaging("loading");
    try {
      const page = await createInspectorClient().query("traces", {
        traceId: id,
        cursor: data.nextCursor,
        limit: 100,
      });
      setData((current) => {
        if (current !== data) return current;
        const { nextCursor: _, ...rest } = current;
        return {
          ...rest,
          records: [...rest.records, ...page.items],
          spans: [...rest.spans, ...page.items.filter((item) => item.signal === "span")],
          ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
        };
      });
      setPaging("ready");
    } catch {
      setPaging("error");
    }
  };
  useEffect(() => {
    if (id === "") return;
    let mounted = true;
    let requestNumber = 0;
    let traceId = kind === "traces" ? id : "";
    const api = createInspectorClient();
    const load = async (showLoading: boolean): Promise<void> => {
      const current = ++requestNumber;
      if (showLoading) setState("loading");
      try {
        const next = kind === "requests" ? await loadRequest(api, id) : await loadTrace(api, id);
        traceId = text(next.request?.traceId) || text(next.trace?.traceId) || traceId;
        if (mounted && current === requestNumber) {
          setData(next);
          setState("ready");
        }
      } catch {
        if (mounted && current === requestNumber) setState("error");
      }
    };
    void load(true);
    const stream = createInspectorBackendStream({
      onStateChange: (snapshot) => mounted && setLiveState(snapshot.state),
      onEvent: (event) => {
        if (!isSignalDetailEvent(event.type)) return;
        const signal = eventRecord(event);
        const correlations =
          signal === undefined
            ? []
            : [
                text(signal.requestId),
                text(signal.originRequestId),
                text(signal.traceId),
                text(signal.correlationId),
              ].filter((value) => value !== "");
        if (signal !== undefined && (correlations.length === 0 || !correlations.includes(id)))
          return;
        api.invalidate([kind, "signals"]);
        void load(false);
      },
    });
    stream.start();
    return () => {
      mounted = false;
      stream.stop();
    };
  }, [id, kind]);

  if (state === "loading" && data === undefined)
    return (
      <p className="panel route-state" role="status">
        Loading {kind === "requests" ? "request" : "trace"}…
      </p>
    );
  if (state === "error" || data === undefined)
    return (
      <p className="panel route-state" role="alert">
        The {kind === "requests" ? "request" : "trace"} API is unavailable.
      </p>
    );
  return (
    <>
      {data.nextCursor && (
        <div className="panel supporting-copy" role="status">
          Partial trace: more records are retained.{" "}
          <Button
            variant="secondary"
            isDisabled={paging === "loading"}
            onPress={() => void loadMore()}
          >
            Load more trace records
          </Button>
          {paging === "error" && (
            <p role="alert">More records could not be loaded. Retry when connected.</p>
          )}
        </div>
      )}
      <SignalDetailView kind={kind} id={id} {...data} liveState={liveState} />
    </>
  );
}

async function loadRequest(
  api: ReturnType<typeof createInspectorClient>,
  id: string,
): Promise<SignalDetailData> {
  const detail = await requestDetail(api, id);
  const request = detail.request;
  if (request === undefined) throw new Error("Request unavailable");
  const traceId = text(request.traceId);
  const [logs, traces, graph] = await Promise.all([
    api.query<InspectorObject>(
      "logs",
      traceId === "" ? { requestId: id, limit: 100 } : { traceId, limit: 100 },
    ),
    api.query<InspectorObject>(
      "traces",
      traceId === "" ? { requestId: id, limit: 100 } : { traceId, limit: 100 },
    ),
    api.graph(),
  ]);
  return {
    request,
    ...(detail.continuations ? { continuations: detail.continuations } : {}),
    ...(detail.incomplete ? { incomplete: detail.incomplete } : {}),
    records: records(detail.records),
    spans: attachSources(
      attachLogs(
        traces.items.filter((item) => item.signal === "span" || text(item.spanId) !== ""),
        logs.items,
      ),
      graph,
      request,
    ),
    logs: logs.items,
    requests: [],
  };
}

async function loadTrace(
  api: ReturnType<typeof createInspectorClient>,
  id: string,
): Promise<SignalDetailData> {
  const detail = await traceDetail(api, id);
  const traceRecords = records(detail.records);
  const detailSpans = records(detail.spans);
  const spans =
    detailSpans.length > 0
      ? detailSpans
      : traceRecords.filter((item) => item.signal === "span" || text(item.spanId) !== "");
  const [logs, requests, graph] = await Promise.all([
    api.query<InspectorObject>("logs", { traceId: id, limit: 100 }),
    api.query<InspectorObject>("requests", { traceId: id, limit: 100 }),
    api.graph(),
  ]);
  return {
    ...(detail.trace === undefined ? {} : { trace: detail.trace }),
    ...(detail.nextCursor ? { nextCursor: detail.nextCursor } : {}),
    records: traceRecords,
    spans: attachSources(attachLogs(spans, logs.items), graph, detail.trace ?? requests.items[0]),
    logs: logs.items,
    requests: requests.items,
  };
}
