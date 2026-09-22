export const INSPECTOR_API_PROTOCOL = "relkit.inspector" as const;
export const OBSERVABILITY_QUERY_PROTOCOL = "relkit.observability.query" as const;
export const INSPECTOR_API_VERSION = 1 as const;
export const INSPECTOR_API_BASE = "/_relkit/v1" as const;
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
  | "middlewares"
  | "functions"
  | "jobs"
  | "events"
  | "buckets"
  | "cache"
  | "tools"
  | "agents"
  | "channels"
  | "errors"
  | "services"
  | "providers";
export type RuntimeCollection = Exclude<
  InspectorCollection,
  "descriptors" | "routes" | "middlewares" | "services" | "providers" | "channels"
>;
export type SignalCollection = "requests" | "logs" | "traces";
export type {
  InspectorFetch,
  InspectorFetchOptions,
  InspectorJobRunQuery,
  InspectorQuery,
  InspectorRequestOptions,
} from "./api-query-types";
export { InspectorApiError } from "./api-query-types";

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
export interface InspectorRunPage<T = InspectorObject> extends InspectorIdentity {
  readonly items: readonly T[];
  readonly nextCursor?: string;
  readonly hasMore: boolean;
  readonly partial?: boolean;
  readonly availability: readonly InspectorObject[];
  readonly count?: { readonly value: number; readonly accuracy: "exact" | "approximate" };
}
export interface InspectorResourcePage<T = InspectorObject> extends InspectorPage<T> {
  readonly supported: boolean;
  readonly reason?: string;
}
export interface InspectorBucketObject {
  readonly key: string;
  readonly metadata?: InspectorObject;
  readonly size?: number;
  readonly etag?: string;
  readonly lastModified?: string;
}
export interface InspectorBucketPreview extends InspectorIdentity {
  readonly supported: boolean;
  readonly key: string;
  readonly kind: "json" | "text" | "image" | "pdf" | "metadata-only";
  readonly content?: string;
  readonly metadata: InspectorObject;
  readonly totalBytes: number;
  readonly truncated: boolean;
}
export interface InspectorCacheKey {
  readonly key: string;
  readonly type: string;
  readonly ttlMs: number | null;
  readonly bytes: number;
}
export interface InspectorCacheValue extends InspectorIdentity {
  readonly supported: boolean;
  readonly key: string;
  readonly type: string;
  readonly ttlMs: number | null;
  readonly bytes: number;
  readonly value?: unknown;
  readonly truncated?: boolean;
}
export interface InspectorGenerationPage<T = InspectorObject> extends InspectorIdentity {
  readonly role: "active" | "candidate";
  readonly items: readonly T[];
  readonly nextCursor?: string;
  readonly sourceVersion?: number;
  readonly state?: string;
  readonly status?: string;
  readonly domain?: string;
  readonly layer?: string;
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
  readonly eventProtocol: "relkit.events.admin";
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
  readonly protocol: InspectorResponseProtocol;
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
