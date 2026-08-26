import {
  INSPECTOR_API_PROTOCOL,
  INSPECTOR_API_VERSION,
  InspectorApiError,
  type InspectorFetch,
  type InspectorFetchOptions,
  type InspectorJson,
  type InspectorQuery,
  type InspectorRequestOptions,
} from "./api-types";
import {
  delay,
  errorCode,
  GET_RETRY_DELAYS_MS,
  readPayload,
  shouldRetry,
} from "./api-request-utils";
import { assertEnvelope } from "./api-validation";
import { resolveBackendUrl } from "./backend-url";

interface CacheEntry {
  readonly value: unknown;
  readonly expiresAt: number;
  readonly tags: readonly string[];
}

export class InspectorApiTransport {
  readonly baseUrl: string;
  protected readonly fetcher: InspectorFetch;
  protected readonly headers: Headers;
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
    const url = resolveBackendUrl(this.baseUrl, path);
    const key = `${method}:${url}`;
    if (method === "GET" && this.cacheTtlMs > 0) {
      const cached = this.cache.get(key);
      if (cached !== undefined && cached.expiresAt > Date.now()) return cached.value as T;
      this.cache.delete(key);
    }
    let attempt = 0;
    while (true) {
      try {
        const headers = new Headers(this.headers);
        if (init.headers !== undefined)
          new Headers(init.headers).forEach((value, name) => headers.set(name, value));
        const requestInit: RequestInit = { ...init, headers };
        if (init.signal !== undefined) requestInit.signal = init.signal;
        else if (this.signal !== undefined) requestInit.signal = this.signal;
        const response = await this.fetch(url, requestInit);
        const payload = await readPayload(response);
        assertEnvelope(payload, response.headers, responseProtocols);
        if (!response.ok) {
          const code = errorCode(payload);
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
      } catch (error) {
        if (!shouldRetry(method, error, attempt)) throw error;
        await delay(GET_RETRY_DELAYS_MS[attempt]!);
        attempt += 1;
      }
    }
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

  protected queryString(input: InspectorQuery): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(input))
      if (value !== undefined) params.set(key, String(value));
    const encoded = params.toString();
    return encoded === "" ? "" : `?${encoded}`;
  }

  private async fetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetcher(url, init);
    } catch {
      throw new InspectorApiError(
        "Inspector backend is disconnected",
        "ZSYS_INSPECTOR_DISCONNECTED",
        undefined,
        "network",
      );
    }
  }
}
