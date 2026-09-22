import {
  INSPECTOR_API_BASE,
  type InspectorCollection,
  type InspectorDiagnosticsPage,
  type InspectorEnvironmentPage,
  type InspectorFetchOptions,
  type InspectorGraph,
  type InspectorObject,
  type InspectorJobRunQuery,
  type InspectorRunPage,
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
import type { RouteInvocationInput, RouteInvocationResult } from "./route-request";
import {
  agentExecutionsPath,
  bucketObjectsRequest,
  bucketPreviewPath,
  cacheValuePath,
  cacheKeysRequest,
  jobControlRequest,
  jobScheduleActionRequest,
  invokeInspectorRoute,
  observabilityQueryRequest,
} from "./api-methods";
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
  agentExecutions(
    agentId: string,
    threadId: string,
    mode: "live" | "history" = "live",
  ): Promise<InspectorObject> {
    return this.request(`${INSPECTOR_API_BASE}${agentExecutionsPath(agentId, threadId, mode)}`);
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
  jobDefinitions<T = InspectorObject>(query: InspectorQuery = {}): Promise<InspectorPage<T>> {
    return this.request(`${INSPECTOR_API_BASE}/jobs/definitions${this.queryString(query)}`, {
      cacheTags: ["jobs", "graph"],
    });
  }
  jobDefinition<T = InspectorObject>(id: string): Promise<T> {
    return this.request(`${INSPECTOR_API_BASE}/jobs/definitions/${encodeURIComponent(id)}`, {
      cacheTags: ["jobs", "graph"],
    });
  }
  taskDefinition<T = InspectorObject>(id: string): Promise<T> {
    return this.request(`${INSPECTOR_API_BASE}/jobs/tasks/${encodeURIComponent(id)}`, {
      cacheTags: ["jobs", "graph"],
    });
  }
  jobRuns<T = InspectorObject>(query: InspectorJobRunQuery = {}): Promise<InspectorRunPage<T>> {
    return this.request(`${INSPECTOR_API_BASE}/jobs/runs${this.queryString(query)}`, {
      cacheTags: ["jobs", "runtime"],
    });
  }
  jobRun<T = InspectorObject>(id: string): Promise<T> {
    return this.request(`${INSPECTOR_API_BASE}/jobs/runs/${encodeURIComponent(id)}`, {
      cacheTags: ["jobs", "runtime"],
    });
  }
  jobServices<T = InspectorObject>(): Promise<InspectorPage<T>> {
    return this.request(`${INSPECTOR_API_BASE}/jobs/services`, { cacheTags: ["jobs", "runtime"] });
  }
  jobSchedules<T = InspectorObject>(query: InspectorQuery = {}): Promise<InspectorRunPage<T>> {
    return this.request(`${INSPECTOR_API_BASE}/jobs/schedules${this.queryString(query)}`, {
      cacheTags: ["jobs", "runtime"],
    });
  }
  jobScheduleAction<T = InspectorObject>(
    action: "upsert" | "pause" | "resume" | "delete",
    id: string | undefined,
    body: InspectorObject = {},
  ): Promise<T> {
    return jobScheduleActionRequest(
      (path, options) => this.request<T>(path, options),
      action,
      id,
      body,
    );
  }
  jobControl<T = InspectorObject>(
    id: string,
    action: "cancel" | "retry",
    body: InspectorObject = {},
  ): Promise<T> {
    return jobControlRequest((path, options) => this.request<T>(path, options), id, action, body);
  }
  bucketObjects(
    bucketId: string,
    query: InspectorQuery = {},
  ): Promise<InspectorResourcePage<InspectorBucketObject>> {
    return bucketObjectsRequest(
      (path, options) => this.request(path, options),
      bucketId,
      this.queryString(query),
    );
  }
  bucketPreview(bucketId: string, key: string): Promise<InspectorBucketPreview> {
    return this.request(`${INSPECTOR_API_BASE}${bucketPreviewPath(bucketId, key)}`, {
      cacheTags: ["buckets", "runtime"],
    });
  }
  cacheKeys(
    cacheId: string,
    query: InspectorQuery = {},
  ): Promise<InspectorResourcePage<InspectorCacheKey>> {
    return cacheKeysRequest(
      (path, options) => this.request(path, options),
      cacheId,
      this.queryString(query),
    );
  }
  cacheValue(cacheId: string, key: string): Promise<InspectorCacheValue> {
    return this.request(`${INSPECTOR_API_BASE}${cacheValuePath(cacheId, key)}`, {
      cacheTags: ["cache", "runtime"],
    });
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
    return observabilityQueryRequest(
      (path, options) => this.request(path, options),
      signal,
      this.queryString(query),
    );
  }
  invokeRoute(input: RouteInvocationInput): Promise<RouteInvocationResult> {
    return invokeInspectorRoute(this.fetcher, this.baseUrl, this.headers, input);
  }
}
export const createInspectorApiClient = (options: InspectorFetchOptions = {}): InspectorApiClient =>
  new InspectorApiClient(options);
export const createInspectorApi = createInspectorApiClient;
