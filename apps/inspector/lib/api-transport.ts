/** Shares observed session headers and request handling; only control requests read action identity from JSON. */
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
import { assertEnvelope, isEnvelope } from "./api-validation";
import { resolveBackendUrl } from "./backend-url";
import { invokeInspectorRouteStream } from "./api-methods";
import { mutationGeneration, observedGeneration, STALE_GENERATION } from "./api-generation";
import type {
  RouteInvocationInput,
  RouteInvocationResult,
  RouteStreamFrame,
} from "./route-request";

interface CacheEntry {
  readonly value: unknown;
  readonly expiresAt: number;
  readonly tags: readonly string[];
}

/**
 * The error for a non-2xx response; the status is read before the envelope is checked. The
 * message is the server's own `message` when the envelope carries one (a rejected history query
 * names the parameter and the accepted values), otherwise the code.
 */
function failure(
  response: Response,
  payload: unknown,
  responseProtocols: InspectorRequestOptions["responseProtocols"],
): InspectorApiError {
  const envelope = isEnvelope(payload, ["relkit.inspector", ...(responseProtocols ?? [])]);
  // The tool refuses a mutation for an older generation before it reaches the application, in a
  // body that is not an envelope; the page needs the code to tell it from any other 409.
  const code = envelope ? errorCode(payload) : staleCode(payload);
  const named = code ?? `HTTP_${response.status}`;
  const message =
    envelope && typeof payload.message === "string" && payload.message !== ""
      ? payload.message
      : named;
  return new InspectorApiError(
    message,
    named,
    response.status,
    "http",
    envelope ? payload : problemDetails(payload),
  );
}

function staleCode(payload: unknown): string | undefined {
  return errorCode(payload) === STALE_GENERATION ? STALE_GENERATION : undefined;
}

/**
 * Keeps an application's own Problem Details answer, which is not an Inspector envelope, so a
 * page can say why the application refused (for example its `origin-denied` code).
 * @param payload - Parsed response body.
 * @returns The body when it carries a string `code`; otherwise undefined.
 */
function problemDetails(payload: unknown): Record<string, unknown> | undefined {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return undefined;
  const body = payload as Record<string, unknown>;
  return typeof body.code === "string" ? body : undefined;
}

export class InspectorApiTransport {
  readonly baseUrl: string;
  protected readonly fetcher: InspectorFetch;
  protected readonly headers: Headers;
  private readonly cacheTtlMs: number;
  private readonly signal: AbortSignal | undefined;
  private readonly cache = new Map<string, CacheEntry>();
  private generation: string | undefined;

  constructor(options: InspectorFetchOptions = {}) {
    this.baseUrl = options.baseUrl === undefined ? "" : String(options.baseUrl).replace(/\/$/, "");
    this.fetcher = options.fetch ?? ((input, init) => fetch(input, init));
    this.headers = new Headers(options.headers);
    this.headers.set("accept", `application/json; version=${INSPECTOR_API_VERSION}`);
    this.headers.set("x-relkit-api-version", String(INSPECTOR_API_VERSION));
    this.headers.set("x-relkit-api-protocol", INSPECTOR_API_PROTOCOL);
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
        const requestInit = this.prepareRequest(init);
        const response = await this.fetch(url, requestInit);
        const payload = await readPayload(response);
        if (!response.ok) throw failure(response, payload, responseProtocols);
        assertEnvelope(payload, response.headers, responseProtocols);
        if (method === "GET")
          this.generation =
            observedGeneration(payload) ??
            response.headers.get("x-relkit-generation-id") ??
            this.generation;
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

  invokeRouteStream(
    input: RouteInvocationInput,
    format: "sse" | "text" | "bytes",
    onFrame: (frame: RouteStreamFrame) => void,
    signal: AbortSignal,
  ): Promise<RouteInvocationResult> {
    return invokeInspectorRouteStream(
      this.fetcher,
      this.baseUrl,
      this.requestHeaders(input.init),
      input,
      format,
      onFrame,
      signal,
    );
  }

  protected queryString(input: InspectorQuery): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(input))
      if (value !== undefined) params.set(key, String(value));
    const encoded = params.toString();
    return encoded === "" ? "" : `?${encoded}`;
  }

  /**
   * Adds a mutation fence without interpreting application request bodies.
   * @param init - Native request options; explicit headers retain precedence.
   * @param generation - Observed identity, or the identity selected by a control request.
   * @returns Merged headers fenced to the selected generation when present.
   */
  protected requestHeaders(init: RequestInit, generation = this.generation): Headers {
    const headers = new Headers(this.headers);
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    if ((init.method ?? "GET") !== "GET" && !headers.has("x-relkit-generation-id")) {
      if (generation) headers.set("x-relkit-generation-id", generation);
    }
    return headers;
  }

  private prepareRequest(init: RequestInit): RequestInit {
    const request: RequestInit = {
      ...init,
      headers: this.requestHeaders(init, mutationGeneration(init.body, this.generation)),
    };
    if (init.signal === undefined && this.signal !== undefined) request.signal = this.signal;
    return request;
  }

  private async fetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetcher(url, init);
    } catch {
      throw new InspectorApiError(
        "Inspector backend is disconnected",
        "RELKIT_INSPECTOR_DISCONNECTED",
        undefined,
        "network",
      );
    }
  }
}
