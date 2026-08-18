export const INSPECTOR_API_PROTOCOL = "zsys.inspector" as const;
export const OBSERVABILITY_QUERY_PROTOCOL = "zsys.observability.query" as const;
export const INSPECTOR_API_VERSION = 1 as const;
export const INSPECTOR_API_BASE = "/_zsys/v1" as const;
export type InspectorResponseProtocol =
  typeof INSPECTOR_API_PROTOCOL | typeof OBSERVABILITY_QUERY_PROTOCOL;

export type InspectorJson =
  | string
  | number
  | boolean
  | null
  | readonly InspectorJson[]
  | { readonly [key: string]: InspectorJson };
export type InspectorObject = { readonly [key: string]: unknown };
export type InspectorCollection =
  | "descriptors"
  | "routes"
  | "functions"
  | "jobs"
  | "events"
  | "buckets"
  | "cache"
  | "tools"
  | "agents";
export type RuntimeCollection = Exclude<InspectorCollection, "descriptors" | "routes">;
export type SignalCollection = "requests" | "logs" | "traces";

export interface InspectorIdentity {
  readonly protocol: typeof INSPECTOR_API_PROTOCOL;
  readonly version: typeof INSPECTOR_API_VERSION;
  readonly generationId?: string;
  readonly graphHash?: string;
}
export interface InspectorPage<T = InspectorObject> extends InspectorIdentity {
  readonly items: readonly T[];
  readonly nextCursor?: string;
}
export interface InspectorGenerationPage<T = InspectorObject> extends InspectorIdentity {
  readonly role: "active" | "candidate";
  readonly items: readonly T[];
  readonly nextCursor?: string;
  readonly sourceVersion?: number;
  readonly state?: string;
  readonly status?: string;
  readonly activeGenerationId?: string;
  readonly activeGraphHash?: string;
}
export interface InspectorEnvironmentPage extends InspectorPage {
  readonly active: InspectorGenerationPage;
}
export interface InspectorDiagnosticsPage extends InspectorPage {
  readonly status: "active" | "candidate";
  readonly active: InspectorGenerationPage;
  readonly candidate?: InspectorGenerationPage;
}
export interface InspectorEventRuntime extends InspectorIdentity {
  readonly eventProtocol: "zsys.events.admin";
  readonly eventVersion: number;
  readonly events: readonly InspectorObject[];
  readonly triggers: readonly InspectorObject[];
  readonly capabilities: readonly InspectorObject[];
  readonly publications: readonly InspectorObject[];
  readonly items: readonly InspectorObject[];
  readonly deliveries: readonly InspectorObject[];
  readonly deadLetters: readonly InspectorObject[];
  readonly nextCursor?: string;
}
export interface ObservabilityPage<T = InspectorObject> extends Omit<
  InspectorIdentity,
  "protocol"
> {
  readonly protocol: typeof OBSERVABILITY_QUERY_PROTOCOL;
  readonly items: readonly T[];
  readonly nextCursor?: string;
}
export interface InspectorGraph extends InspectorIdentity {
  readonly graph?: InspectorObject;
  readonly nodes?: readonly InspectorObject[];
  readonly edges?: readonly InspectorObject[];
  readonly observedEdges?: readonly InspectorObject[];
}
export interface InspectorErrorPayload extends Partial<InspectorIdentity> {
  readonly error?: string;
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
  readonly from?: string;
  readonly to?: string;
  readonly severity?: string;
  readonly routeId?: string;
  readonly functionId?: string;
  readonly outcome?: string;
  readonly requestId?: string;
  readonly traceId?: string;
  readonly generationId?: string;
  readonly graphHash?: string;
  readonly eventId?: string;
  readonly eventVersion?: number;
  readonly triggerId?: string;
  readonly state?: string;
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
      "ZSYS_INSPECTOR_PROTOCOL_MISMATCH",
      "ZSYS_INSPECTOR_PROTOCOL_UNSUPPORTED",
      "ZSYS_INSPECTOR_API_VERSION_UNSUPPORTED",
    ].includes(this.code);
  }
  get isCursorExpired(): boolean {
    return this.code === "ZSYS_OBSERVABILITY_STREAM_CURSOR_EXPIRED";
  }
}
