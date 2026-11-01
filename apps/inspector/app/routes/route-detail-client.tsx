"use client";

/** Keeps route metadata and composer calls on one observed browser generation across rerenders. */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { InspectorObject, ObservabilityPage } from "../../lib/api-types";
import { createInspectorClient } from "../../lib/client";
import { CodeBlock } from "../../components/blocks/code-block";
import { Section } from "../../components/blocks/section";
import { StatusBadge } from "../../components/neon/status-badge";
import { Badge } from "../../components/ui/badge";
import { DetailLayout } from "../detail-layout";
import { SourceLink } from "../source-link";
import {
  DetailPending,
  ExposureBadge,
  GraphAction,
  MetaItem,
  MethodChip,
} from "../domains/catalog-kit";
import { RouteComposer } from "./route-composer";
import { RecentRequests, RouteContract, RouteFacts, statusCodeTone } from "./route-contract";

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
      <DetailPending
        failed={error}
        failedTitle="The route API is unavailable."
        loadingLabel="Loading route contract…"
      />
    );
  const config = record(route.config);
  const routeId = text(route.id) || id;
  const method = text(config?.method) || "HTTP";
  const path = text(config?.path) || "/";
  const raw = config?.rawHandler === true;
  const targetId = text(route.targetFunctionId);
  const domainId = text(target?.domainId);
  return (
    <DetailLayout
      header={{
        kicker: "Route",
        title: (
          <span className="inline-flex min-w-0 items-center gap-2">
            <MethodChip method={method} className="mr-0!" />
            <span className="truncate font-mono">{path}</span>
          </span>
        ),
        badges: (
          <>
            {raw ? <Badge>raw handler</Badge> : null}
            {config?.stream ? <StatusBadge tone="info" label="streaming" /> : null}
            <ExposureBadge exposure={target?.exposure} />
          </>
        ),
        meta: (
          <>
            <MetaItem label="id" copy={routeId}>
              {routeId}
            </MetaItem>
            <MetaItem label="handler">
              {raw || targetId === "" ? (
                "Raw HTTP handler"
              ) : (
                <Link
                  href={`/functions/${encodeURIComponent(targetId)}`}
                  className="underline-offset-2 hover:underline"
                >
                  {targetId}
                </Link>
              )}
            </MetaItem>
            {domainId ? (
              <MetaItem label="domain">
                <Link
                  href={`/domains/${encodeURIComponent(domainId)}`}
                  className="underline-offset-2 hover:underline"
                >
                  {domainId}
                </Link>
              </MetaItem>
            ) : null}
            <SourceLink source={record(route.source)} />
          </>
        ),
        actions: <GraphAction id={routeId} />,
      }}
      aside={<RouteFacts route={route} target={target} />}
    >
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
      <RecentRequests requests={requests} />
      <RouteContract route={route} target={target} />
    </DetailLayout>
  );
}

function InvocationResult({
  result,
}: {
  readonly result: { status: number; body: unknown; requestId?: string; traceId?: string };
}) {
  const headingRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [result]);

  return (
    <Section
      id="route-result"
      aria-live="polite"
      aria-atomic="true"
      title={
        <span ref={headingRef} tabIndex={-1} className="outline-none">
          Active backend result
        </span>
      }
      actions={
        <>
          <StatusBadge tone={statusCodeTone(result.status)} label={`HTTP ${result.status}`} />
          {result.requestId === undefined ? (
            <span className="text-[11px] text-muted-foreground">Request ID unavailable</span>
          ) : (
            <Link
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground no-underline hover:bg-muted hover:text-foreground"
              href={`/requests/${encodeURIComponent(result.requestId)}`}
            >
              Open request record
            </Link>
          )}
          {result.traceId === undefined ? null : (
            <Link
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground no-underline hover:bg-muted hover:text-foreground"
              href={`/traces/${encodeURIComponent(result.traceId)}`}
            >
              Open trace
            </Link>
          )}
        </>
      }
    >
      <CodeBlock value={format(result.body)} label="response body" maxHeight="28rem" />
    </Section>
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
