import {
  INSPECTOR_API_BASE,
  OBSERVABILITY_QUERY_PROTOCOL,
  type InspectorObject,
} from "./api-types";
import type { InspectorApiClient } from "./api";

export interface RequestDetailPayload {
  readonly request?: InspectorObject;
  readonly records?: readonly InspectorObject[];
  readonly continuations?: readonly InspectorObject[];
  readonly incomplete?: readonly string[];
  readonly counts?: InspectorObject;
}

export interface TraceDetailPayload {
  readonly nextCursor?: string;
  readonly trace?: InspectorObject;
  readonly spans?: readonly InspectorObject[];
  readonly records?: readonly InspectorObject[];
}

export function logDetail(
  api: InspectorApiClient,
  cursor: string,
): Promise<{ readonly log?: InspectorObject }> {
  return api.request(`${INSPECTOR_API_BASE}/logs/${encodeURIComponent(cursor)}`, {
    responseProtocols: [OBSERVABILITY_QUERY_PROTOCOL],
    cacheTags: ["logs", "signals"],
  });
}

export function requestDetail(
  api: InspectorApiClient,
  requestId: string,
): Promise<RequestDetailPayload> {
  return api.request<RequestDetailPayload>(
    `${INSPECTOR_API_BASE}/requests/${encodeURIComponent(requestId)}`,
    { responseProtocols: [OBSERVABILITY_QUERY_PROTOCOL], cacheTags: ["requests", "signals"] },
  );
}

export function traceDetail(api: InspectorApiClient, traceId: string): Promise<TraceDetailPayload> {
  return api.request<TraceDetailPayload>(
    `${INSPECTOR_API_BASE}/traces/${encodeURIComponent(traceId)}`,
    { responseProtocols: [OBSERVABILITY_QUERY_PROTOCOL], cacheTags: ["traces", "signals"] },
  );
}
