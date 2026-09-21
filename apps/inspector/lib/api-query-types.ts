import type { InspectorResponseProtocol } from "./api-types";

export interface InspectorJobRunQuery extends InspectorQuery {
  readonly jobId?: string;
  readonly taskId?: string;
  readonly taskVersion?: string;
  readonly buildId?: string;
  readonly service?: string;
  readonly acceptedFrom?: string;
  readonly acceptedTo?: string;
  readonly startedFrom?: string;
  readonly startedTo?: string;
  readonly completedFrom?: string;
  readonly completedTo?: string;
  readonly tag?: string;
  readonly tags?: string;
  readonly tagMatch?: "all" | "any";
  readonly correlationId?: string;
  readonly parentRunId?: string;
  readonly runId?: string;
  readonly failure?: string;
  readonly attempt?: number;
  readonly timezone?: string;
  readonly nativeQuery?: string;
}

export interface InspectorFetchOptions {
  readonly baseUrl?: string | URL;
  readonly fetch?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  readonly headers?: HeadersInit;
  readonly signal?: AbortSignal;
  readonly cacheTtlMs?: number;
}

export interface InspectorRequestOptions extends RequestInit {
  readonly cacheTags?: readonly string[];
  readonly responseProtocols?: readonly InspectorResponseProtocol[];
}

export type { RouteInvocationInput, RouteInvocationResult } from "./route-request";

export interface InspectorQuery {
  readonly cursor?: string;
  readonly limit?: number;
  readonly search?: string;
  readonly source?: string;
  readonly order?: "asc" | "desc";
  readonly kind?: string;
  readonly status?: string;
  readonly from?: string;
  readonly to?: string;
  readonly severity?: string;
  readonly routeId?: string;
  readonly functionId?: string;
  readonly outcome?: string;
  readonly requestId?: string;
  readonly traceId?: string;
  readonly serviceId?: string;
  readonly generationId?: string;
  readonly graphHash?: string;
  readonly eventId?: string;
  readonly eventVersion?: number;
  readonly triggerId?: string;
  readonly state?: string;
  readonly prefix?: string;
}

export type InspectorFetch = NonNullable<InspectorFetchOptions["fetch"]>;

export class InspectorApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
    readonly kind: "network" | "http" | "protocol" = "http",
  ) {
    super(message);
    this.name = "InspectorApiError";
  }

  get isProtocolMismatch(): boolean {
    return [
      "RELKIT_INSPECTOR_PROTOCOL_MISMATCH",
      "RELKIT_INSPECTOR_PROTOCOL_UNSUPPORTED",
      "RELKIT_INSPECTOR_API_VERSION_UNSUPPORTED",
    ].includes(this.code);
  }

  get isCursorExpired(): boolean {
    return this.code === "RELKIT_OBSERVABILITY_STREAM_CURSOR_EXPIRED";
  }

  get isCursorResetRequired(): boolean {
    return this.isCursorExpired || this.code === "RELKIT_OBSERVABILITY_STREAM_CURSOR_FUTURE";
  }
}
