import {
  INSPECTOR_API_BASE,
  INSPECTOR_API_PROTOCOL,
  OBSERVABILITY_QUERY_PROTOCOL,
  type InspectorCollection,
  type InspectorDiagnosticsPage,
  type InspectorEnvironmentPage,
  type InspectorFetchOptions,
  type InspectorGraph,
  type InspectorObject,
  type InspectorPage,
  type InspectorQuery,
  type InspectorBucketObject,
  type InspectorBucketPreview,
  type InspectorCacheKey,
  type InspectorCacheValue,
  type InspectorResourcePage,
  type ObservabilityPage,
  type RuntimeCollection,
  type SignalCollection,
} from "./api-types";
import { InspectorApiTransport } from "./api-transport";
import {
  invokeActiveRoute,
  type RouteInvocationInput,
  type RouteInvocationResult,
} from "./route-request";
export * from "./api-types";
export class InspectorApiClient extends InspectorApiTransport {
  health(kind: "live" | "ready" = "ready"): Promise<InspectorObject> {
    return this.request(`${INSPECTOR_API_BASE}/health/${kind}`, { cacheTags: ["health"] });
  }
  graph(): Promise<InspectorGraph> {
    return this.request(`${INSPECTOR_API_BASE}/graph`, { cacheTags: ["graph"] });
  }
  runtime(): Promise<InspectorObject> {
    return this.request(`${INSPECTOR_API_BASE}/runtime`, { cacheTags: ["runtime"] });
  }
  list<T = InspectorObject>(
    collection: InspectorCollection,
    query: InspectorQuery = {},
  ): Promise<InspectorPage<T>> {
    return this.request(`${INSPECTOR_API_BASE}/${collection}${this.queryString(query)}`, {
      cacheTags: [collection, "graph"],
    });
  }
  detail<T = InspectorObject>(collection: InspectorCollection, id: string): Promise<T> {
    return this.request(`${INSPECTOR_API_BASE}/${collection}/${encodeURIComponent(id)}`, {
      cacheTags: [collection, "graph"],
    });
  }
  runtimeList<T = InspectorObject>(
    collection: RuntimeCollection,
    query: InspectorQuery = {},
  ): Promise<InspectorPage<T>> {
    return this.request(`${INSPECTOR_API_BASE}/runtime/${collection}${this.queryString(query)}`, {
      cacheTags: [collection, "runtime"],
    });
  }
  bucketObjects(
    bucketId: string,
    query: InspectorQuery = {},
  ): Promise<InspectorResourcePage<InspectorBucketObject>> {
    return this.request(
      `${INSPECTOR_API_BASE}/runtime/buckets/${encodeURIComponent(bucketId)}/objects${this.queryString(query)}`,
      { cacheTags: ["buckets", "runtime"] },
    );
  }
  bucketPreview(bucketId: string, key: string): Promise<InspectorBucketPreview> {
    return this.request(
      `${INSPECTOR_API_BASE}/runtime/buckets/${encodeURIComponent(bucketId)}/objects/preview?key=${encodeURIComponent(key)}`,
      { cacheTags: ["buckets", "runtime"] },
    );
  }
  cacheKeys(
    cacheId: string,
    query: InspectorQuery = {},
  ): Promise<InspectorResourcePage<InspectorCacheKey>> {
    return this.request(
      `${INSPECTOR_API_BASE}/runtime/cache/${encodeURIComponent(cacheId)}/keys${this.queryString(query)}`,
      { cacheTags: ["cache", "runtime"] },
    );
  }
  cacheValue(cacheId: string, key: string): Promise<InspectorCacheValue> {
    return this.request(
      `${INSPECTOR_API_BASE}/runtime/cache/${encodeURIComponent(cacheId)}/keys/value?key=${encodeURIComponent(key)}`,
      { cacheTags: ["cache", "runtime"] },
    );
  }
  eventRuntime(query: InspectorQuery = {}): Promise<import("./api-types").InspectorEventRuntime> {
    return this.request(`${INSPECTOR_API_BASE}/runtime/events${this.queryString(query)}`, {
      cacheTags: ["events", "runtime"],
    });
  }
  env(query: InspectorQuery = {}): Promise<InspectorEnvironmentPage> {
    return this.request(`${INSPECTOR_API_BASE}/env${this.queryString(query)}`, {
      cacheTags: ["env"],
    });
  }
  diagnostics(query: InspectorQuery = {}): Promise<InspectorDiagnosticsPage> {
    return this.request(`${INSPECTOR_API_BASE}/diagnostics${this.queryString(query)}`, {
      cacheTags: ["diagnostics"],
    });
  }
  source(id: string): Promise<InspectorObject> {
    return this.request(`${INSPECTOR_API_BASE}/source/${encodeURIComponent(id)}`, {
      cacheTags: ["source"],
    });
  }
  query<T = InspectorObject>(
    signal: SignalCollection,
    query: InspectorQuery = {},
  ): Promise<ObservabilityPage<T>> {
    return this.request<ObservabilityPage<T>>(
      `${INSPECTOR_API_BASE}/${signal}${this.queryString(query)}`,
      {
        cacheTags: [signal, "signals"],
        responseProtocols: [OBSERVABILITY_QUERY_PROTOCOL, INSPECTOR_API_PROTOCOL],
      },
    );
  }
  invokeRoute(input: RouteInvocationInput): Promise<RouteInvocationResult> {
    return invokeActiveRoute(this.fetcher, this.baseUrl, this.headers, input);
  }
}
export const createInspectorApiClient = (options: InspectorFetchOptions = {}): InspectorApiClient =>
  new InspectorApiClient(options);
export const createInspectorApi = createInspectorApiClient;
