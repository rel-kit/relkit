import { INSPECTOR_API_BASE } from "./api-types";
import type {
  InspectorBucketObject,
  InspectorCacheKey,
  InspectorFetch,
  InspectorObject,
  InspectorRequestOptions,
  InspectorQuery,
  InspectorResourcePage,
  ObservabilityPage,
  SignalCollection,
} from "./api-types";
import {
  invokeActiveRoute,
  invokeActiveRouteStream,
  type RouteInvocationInput,
  type RouteInvocationResult,
  type RouteStreamFrame,
} from "./route-request";

export function agentExecutionsPath(
  agentId: string,
  threadId: string,
  mode: "live" | "history",
): string {
  return `/runtime/agents/${encodeURIComponent(agentId)}/executions?${new URLSearchParams({ threadId, mode })}`;
}

export function bucketPreviewPath(bucketId: string, key: string): string {
  return `/runtime/buckets/${encodeURIComponent(bucketId)}/objects/preview?key=${encodeURIComponent(key)}`;
}

export function cacheValuePath(cacheId: string, key: string): string {
  return `/runtime/cache/${encodeURIComponent(cacheId)}/keys/value?key=${encodeURIComponent(key)}`;
}

type InspectorRequest = <T = InspectorObject>(
  path: string,
  options?: InspectorRequestOptions,
) => Promise<T>;

export function jobScheduleActionRequest<T = InspectorObject>(
  request: InspectorRequest,
  action: "upsert" | "pause" | "resume" | "delete",
  id: string | undefined,
  body: InspectorObject,
): Promise<T> {
  const path =
    id === undefined
      ? `${INSPECTOR_API_BASE}/jobs/schedules`
      : action === "delete"
        ? `${INSPECTOR_API_BASE}/jobs/schedules/${encodeURIComponent(id)}`
        : `${INSPECTOR_API_BASE}/jobs/schedules/${encodeURIComponent(id)}/${action}`;
  return request(path, {
    method: action === "delete" ? "DELETE" : "POST",
    headers: { "content-type": "application/json", "x-relkit-operation-id": crypto.randomUUID() },
    body: JSON.stringify(body),
    cacheTags: ["jobs", "runtime"],
  });
}

export function jobControlRequest<T = InspectorObject>(
  request: InspectorRequest,
  id: string,
  action: "cancel" | "retry",
  body: InspectorObject,
): Promise<T> {
  return request(`${INSPECTOR_API_BASE}/jobs/runs/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cacheTags: ["jobs", "runtime"],
  });
}

export function bucketObjectsRequest(
  request: InspectorRequest,
  bucketId: string,
  query: string,
): Promise<InspectorResourcePage<InspectorBucketObject>> {
  return request<InspectorResourcePage<InspectorBucketObject>>(
    `${INSPECTOR_API_BASE}/runtime/buckets/${encodeURIComponent(bucketId)}/objects${query}`,
    { cacheTags: ["buckets", "runtime"] },
  );
}

export function cacheKeysRequest(
  request: InspectorRequest,
  cacheId: string,
  query: string,
): Promise<InspectorResourcePage<InspectorCacheKey>> {
  return request<InspectorResourcePage<InspectorCacheKey>>(
    `${INSPECTOR_API_BASE}/runtime/cache/${encodeURIComponent(cacheId)}/keys${query}`,
    { cacheTags: ["cache", "runtime"] },
  );
}

export function observabilityQueryRequest<T = InspectorObject>(
  request: InspectorRequest,
  signal: SignalCollection,
  query: string,
): Promise<ObservabilityPage<T>> {
  return request<ObservabilityPage<T>>(`${INSPECTOR_API_BASE}/${signal}${query}`, {
    cacheTags: [signal, "signals"],
    responseProtocols: ["relkit.observability.query", "relkit.inspector"],
  });
}

export function invokeInspectorRoute(
  fetcher: InspectorFetch,
  baseUrl: string,
  headers: Headers,
  input: RouteInvocationInput,
): Promise<RouteInvocationResult> {
  return invokeActiveRoute(fetcher, baseUrl, headers, input);
}

export function invokeInspectorRouteStream(
  fetcher: InspectorFetch,
  baseUrl: string,
  headers: Headers,
  input: RouteInvocationInput,
  format: "sse" | "text" | "bytes",
  onFrame: (frame: RouteStreamFrame) => void,
  signal: AbortSignal,
): Promise<RouteInvocationResult> {
  return invokeActiveRouteStream(fetcher, baseUrl, headers, input, format, onFrame, signal);
}
