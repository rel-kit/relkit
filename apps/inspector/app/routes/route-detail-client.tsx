"use client";

/** Keeps route metadata and composer calls on one observed browser generation across rerenders. */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { graphHref } from "../../lib/graph-url-state";
import type { InspectorObject, ObservabilityPage } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { RouteComposer } from "./route-composer";
import { RouteContract } from "./route-contract";

export function RouteDetailClient() {
  const [api] = useState(createInspectorClient);
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";
  const [route, setRoute] = useState<InspectorObject>();
  const [target, setTarget] = useState<InspectorObject>();
  const [requests, setRequests] = useState<readonly InspectorObject[]>([]);
  const [result, setResult] = useState<{
    status: number;
    body: unknown;
    requestId?: string;
    traceId?: string;
  }>();
  const [error, setError] = useState(false);

  const loadRequests = () => {
    if (id === "") return;
    void createInspectorClient()
      .query<InspectorObject>("requests", { routeId: id, limit: 10 })
      .then((page: ObservabilityPage<InspectorObject>) => setRequests(page.items))
      .catch(() => setRequests([]));
  };

  useEffect(() => {
    if (id === "") return;
    void Promise.all([
      api.detail<InspectorObject>("routes", id),
      api
        .query<InspectorObject>("requests", { routeId: id, limit: 10 })
        .catch(() => ({ items: [] as readonly InspectorObject[] })),
    ])
      .then(async ([routePayload, requestPayload]) => {
        const nextRoute =
          record(routePayload.node) ?? record(routePayload.descriptor) ?? record(routePayload);
        if (nextRoute === undefined) throw new Error("Route unavailable");
        setRoute(nextRoute);
        setRequests(requestPayload.items);
        const targetId = text(nextRoute.targetFunctionId);
        setTarget(undefined);
        if (targetId !== "" && record(nextRoute.config)?.rawHandler !== true) {
          const targetPayload = await api.detail<InspectorObject>("functions", targetId);
          setTarget(
            record(targetPayload.node) ?? record(targetPayload.descriptor) ?? record(targetPayload),
          );
        }
      })
      .catch(() => setError(true));
  }, [api, id]);

  if (error || route === undefined)
    return (
      <section className="panel route-state" role={error ? "alert" : "status"}>
        {error ? "The route API is unavailable." : "Loading route contract…"}
      </section>
    );
  return (
    <div className="route-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ACTIVE WORKSPACE</p>
          <h1>Route detail</h1>
          <p className="lede">
            The contract, generated operation, and recent active-backend requests stay tied to one
            graph identity.
          </p>
        </div>
        <div className="page-heading__aside">
          <span className="badge">{text(route.id) || id}</span>
          <Link
            className="text-link"
            href={graphHref({
              view: "flow",
              scope: text(route.id) || id,
              node: text(route.id) || id,
            })}
          >
            Follow in graph →
          </Link>
        </div>
      </header>
      <RouteContract route={route} target={target} requests={requests} />
      <RouteComposer
        route={route}
        target={target}
        invoke={(input) => api.invokeRoute(input)}
        {...streamInvocation(route, api)}
        onComplete={(next) => {
          setResult(next);
          loadRequests();
        }}
      />
      {result !== undefined && <InvocationResult result={result} />}
    </div>
  );
}

function InvocationResult({
  result,
}: {
  readonly result: { status: number; body: unknown; requestId?: string; traceId?: string };
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [result]);

  return (
    <section className="panel invocation-result" aria-live="polite" aria-atomic="true">
      <div className="section-heading">
        <div>
          <p className="eyebrow">RESPONSE</p>
          <h2 ref={headingRef} tabIndex={-1}>
            Active backend result
          </h2>
        </div>
        <span className="badge">HTTP {result.status}</span>
      </div>
      <pre>{format(result.body)}</pre>
      <div className="request-links">
        {result.requestId === undefined ? (
          <span>Request ID unavailable</span>
        ) : (
          <a className="text-link" href={`/requests/${encodeURIComponent(result.requestId)}`}>
            Open request record
          </a>
        )}
        {result.traceId === undefined ? null : (
          <a className="text-link" href={`/traces/${encodeURIComponent(result.traceId)}`}>
            Open trace
          </a>
        )}
      </div>
    </section>
  );
}

function format(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Response unavailable";
  }
}
function record(value: unknown): InspectorObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as InspectorObject)
    : undefined;
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function streamInvocation(route: InspectorObject, api: ReturnType<typeof createInspectorClient>) {
  const format = text(record(record(route.config)?.stream)?.format);
  if (format !== "sse" && format !== "text" && format !== "bytes") return {};
  return {
    invokeStream: (
      input: { path: string; init: RequestInit },
      onFrame: Parameters<typeof api.invokeRouteStream>[2],
      signal: AbortSignal,
    ) => api.invokeRouteStream(input, format, onFrame, signal),
  };
}
