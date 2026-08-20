import {
  INSPECTOR_API_BASE,
  INSPECTOR_API_PROTOCOL,
  INSPECTOR_API_VERSION,
  OBSERVABILITY_QUERY_PROTOCOL,
  InspectorApiError,
  type InspectorCollection,
  type InspectorDiagnosticsPage,
  type InspectorEnvironmentPage,
  type InspectorFetch,
  type InspectorFetchOptions,
  type InspectorGraph,
  type InspectorJson,
  type InspectorObject,
  type InspectorPage,
  type InspectorQuery,
  type InspectorRequestOptions,
  type ObservabilityPage,
  type RuntimeCollection,
  type SignalCollection,
} from "./api-types";
import { assertEnvelope } from "./api-validation";
import {
  invokeActiveRoute,
  type RouteInvocationInput,
  type RouteInvocationResult,
} from "./route-request";
import { resolveBackendUrl } from "./backend-url";
export * from "./api-types";
interface CacheEntry {
  readonly value: unknown;
  readonly expiresAt: number;
  readonly tags: readonly string[];
}
export class InspectorApiClient {
  readonly baseUrl: string;
  private readonly fetcher: InspectorFetch;
  private readonly headers: Headers;
  private readonly cacheTtlMs: number;
  private readonly signal: AbortSignal | undefined;
  private readonly cache = new Map<string, CacheEntry>();
  constructor(options: InspectorFetchOptions = {}) {
    this.baseUrl = options.baseUrl === undefined ? "" : String(options.baseUrl).replace(/\/$/, "");
    this.fetcher = options.fetch ?? ((input, init) => fetch(input, init));
    this.headers = new Headers(options.headers);
    this.headers.set("accept", `application/json; version=${INSPECTOR_API_VERSION}`);
    this.headers.set("x-zsys-api-version", String(INSPECTOR_API_VERSION));
    this.headers.set("x-zsys-api-protocol", INSPECTOR_API_PROTOCOL);
    this.cacheTtlMs = Math.max(0, options.cacheTtlMs ?? 2_000);
    this.signal = options.signal;
  }
  async request<T = InspectorJson>(
    path: string,
    options: InspectorRequestOptions = {},
  ): Promise<T> {
    const { cacheTags, responseProtocols, ...init } = options;
    const method = init.method ?? "GET";
    const url = this.url(path);
    const key = `${method}:${url}`;
    if (method === "GET" && this.cacheTtlMs > 0) {
      const cached = this.cache.get(key);
      if (cached !== undefined && cached.expiresAt > Date.now()) return cached.value as T;
      this.cache.delete(key);
    }
    let response: Response;
    try {
      const headers = new Headers(this.headers);
      if (init.headers !== undefined)
        new Headers(init.headers).forEach((value, key) => headers.set(key, value));
      const requestInit: RequestInit = { ...init, headers };
      if (init.signal !== undefined) requestInit.signal = init.signal;
      else if (this.signal !== undefined) requestInit.signal = this.signal;
      response = await this.fetcher(url, requestInit);
    } catch (error) {
      throw new InspectorApiError(
        "Inspector backend is disconnected",
        "ZSYS_INSPECTOR_DISCONNECTED",
        undefined,
        "network",
      );
    }
    const payload = await this.readPayload(response);
    assertEnvelope(payload, response.headers, responseProtocols);
    if (!response.ok) {
      const code = this.object(payload)?.error;
      throw new InspectorApiError(
        typeof code === "string" ? code : `HTTP_${response.status}`,
        typeof code === "string" ? code : `HTTP_${response.status}`,
        response.status,
      );
    }
    if (method === "GET" && this.cacheTtlMs > 0)
      this.cache.set(key, {
        value: payload,
        expiresAt: Date.now() + this.cacheTtlMs,
        tags: cacheTags ?? [],
      });
    return payload as T;
  }
  clearCache(): void {
    this.cache.clear();
  }
  invalidate(tags: readonly string[] = []): void {
    if (tags.length === 0) return this.clearCache();
    const selected = new Set(tags);
    for (const [key, entry] of this.cache)
      if (entry.tags.some((tag) => selected.has(tag))) this.cache.delete(key);
  }
  health(kind: "live" | "ready" = "ready"): Promise<InspectorObject> {
    return this.request(`${INSPECTOR_API_BASE}/health/${kind}`, { cacheTags: ["health"] });
  }
  graph(): Promise<InspectorGraph> {
    return this.request(`${INSPECTOR_API_BASE}/graph`, { cacheTags: ["graph"] });
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
  private url(path: string): string {
    return resolveBackendUrl(this.baseUrl, path);
  }
  private queryString(input: InspectorQuery): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(input))
      if (value !== undefined) params.set(key, String(value));
    const encoded = params.toString();
    return encoded === "" ? "" : `?${encoded}`;
  }
  private async readPayload(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new InspectorApiError(
        "Inspector returned invalid JSON",
        "ZSYS_INSPECTOR_INVALID_RESPONSE",
      );
    }
  }
  private object(value: unknown): InspectorObject | undefined {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as InspectorObject)
      : undefined;
  }
}
export const createInspectorApiClient = (options: InspectorFetchOptions = {}): InspectorApiClient =>
  new InspectorApiClient(options);
export const createInspectorApi = createInspectorApiClient;
