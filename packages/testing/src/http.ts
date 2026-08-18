import type { MaybePromise } from "@zsys/contracts";
import {
  createInspectableObservabilityHooks,
  OBSERVABILITY_HOOK_PROTOCOL,
  OBSERVABILITY_HOOK_VERSION,
  type InspectableObservabilityHooks,
  type ObservabilityHookEvent,
} from "@zsys/engine";
import {
  createTestHttpListener,
  type TestHttpListener,
  type TestHttpListenerOptions,
} from "./http-listener.js";

export type TestHttpInput = Request | string | URL;
export type TestHttpRequest = (input: TestHttpInput, init?: RequestInit) => Promise<Response>;

/** The app request/fetch methods satisfy this boundary without leaking framework types. */
export interface TestHttpApplication {
  readonly request?: (input: TestHttpInput, init?: RequestInit) => Response | Promise<Response>;
  readonly fetch?: (request: Request) => Response | Promise<Response>;
}
export interface TestHttpClientOptions {
  readonly baseUrl?: string | URL;
  /** Registers client shutdown with the owning test runtime/application. */
  readonly registerClose?: (close: () => Promise<void>) => void;
  readonly onClose?: () => MaybePromise<void>;
  readonly closeTimeoutMs?: number;
}
export interface TestHttpClient {
  readonly request: TestHttpRequest;
  readonly get: TestHttpRequest;
  readonly post: TestHttpRequest;
  readonly put: TestHttpRequest;
  readonly patch: TestHttpRequest;
  readonly delete: TestHttpRequest;
  readonly listen: (options?: TestHttpListenerOptions) => Promise<TestHttpListener>;
  readonly close: () => Promise<void>;
}

/** Sends ordinary route tests through the app's in-memory request entry point. */
export function createTestHttpClient(
  app: TestHttpApplication,
  options: TestHttpClientOptions = {},
): TestHttpClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? "http://zsys.test");
  const listeners = new Set<TestHttpListener>();
  let closing: Promise<void> | undefined;
  const request: TestHttpRequest = (input, init) =>
    dispatchInMemory(app, makeRequest(input, init, baseUrl));
  const listen = async (listenerOptions: TestHttpListenerOptions = {}) => {
    const listener = await createTestHttpListener(app, {
      ...listenerOptions,
      ...(listenerOptions.closeTimeoutMs === undefined && options.closeTimeoutMs !== undefined
        ? { closeTimeoutMs: options.closeTimeoutMs }
        : {}),
    });
    listeners.add(listener);
    return listener;
  };
  const close = (): Promise<void> => {
    if (closing !== undefined) return closing;
    closing = (async () => {
      const results = await Promise.allSettled([...listeners].map((listener) => listener.close()));
      listeners.clear();
      const failed = results.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
      await options.onClose?.();
    })();
    return closing;
  };
  const client = Object.freeze({
    request,
    get: method(request, "GET"),
    post: method(request, "POST"),
    put: method(request, "PUT"),
    patch: method(request, "PATCH"),
    delete: method(request, "DELETE"),
    listen,
    close,
  });
  options.registerClose?.(close);
  return client;
}

export const createHttpTestClient = createTestHttpClient;
export { createTestHttpListener } from "./http-listener.js";
export { createBunHttpListener } from "./http-listener.js";
export type {
  RealListenerPurpose,
  TestHttpListener,
  TestHttpListenerOptions,
} from "./http-listener.js";

export function assertResponseStatus(response: Response, expected: number): Response {
  if (response.status !== expected)
    throw new Error(`Expected HTTP ${String(expected)}, received ${String(response.status)}`);
  return response;
}
export async function responseJson<T = unknown>(
  response: Response,
  expectedStatus?: number,
): Promise<T> {
  if (expectedStatus !== undefined) assertResponseStatus(response, expectedStatus);
  return (await response.json()) as T;
}
export async function responseText(response: Response, expectedStatus?: number): Promise<string> {
  if (expectedStatus !== undefined) assertResponseStatus(response, expectedStatus);
  return response.text();
}

export interface TestObservability {
  readonly hooks: InspectableObservabilityHooks;
  readonly read: () => readonly ObservabilityHookEvent[];
  readonly types: () => readonly ObservabilityHookEvent["type"][];
  readonly assertTypes: (
    expected: readonly ObservabilityHookEvent["type"][],
  ) => readonly ObservabilityHookEvent[];
  readonly clear: () => void;
}

/** Creates a protocol/version-checked capture for engine-backed HTTP tests. */
export function createTestObservability(): TestObservability {
  const hooks = createInspectableObservabilityHooks();
  return Object.freeze({
    hooks,
    read: hooks.read,
    types: () => hooks.read().map((event) => event.type),
    assertTypes: (expected: readonly ObservabilityHookEvent["type"][]) =>
      assertObservabilityHookTypes(hooks, expected),
    clear: hooks.clear,
  });
}
export const createObservabilityAssertions = createTestObservability;

export function assertObservabilityHookTypes(
  hooks: Pick<InspectableObservabilityHooks, "read">,
  expected: readonly ObservabilityHookEvent["type"][],
): readonly ObservabilityHookEvent[] {
  const events = hooks.read();
  const actual = events.map((event) => event.type);
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`Unexpected observability hook types: ${JSON.stringify(actual)}`);
  if (
    events.some(
      (event) =>
        event.protocol !== OBSERVABILITY_HOOK_PROTOCOL ||
        event.version !== OBSERVABILITY_HOOK_VERSION,
    )
  )
    throw new Error("Observability hook protocol/version mismatch");
  return events;
}

function method(request: TestHttpRequest, verb: string): TestHttpRequest {
  return (input, init) => request(input, { ...(init ?? {}), method: verb });
}
function makeRequest(input: TestHttpInput, init: RequestInit | undefined, baseUrl: URL): Request {
  if (input instanceof Request) return init === undefined ? input : new Request(input, init);
  const url = input instanceof URL ? new URL(input) : new URL(input, baseUrl);
  return new Request(url.toString(), init);
}
function normalizeBaseUrl(value: string | URL): URL {
  const url = new URL(value.toString());
  if (!url.href.endsWith("/")) url.href += "/";
  return url;
}
async function dispatchInMemory(app: TestHttpApplication, request: Request): Promise<Response> {
  if (app.request !== undefined) return app.request(request);
  return dispatchFetch(app, request);
}
function dispatchFetch(app: TestHttpApplication, request: Request): Response | Promise<Response> {
  if (app.fetch !== undefined) return app.fetch(request);
  throw new TypeError("Test HTTP application must expose request() or fetch()");
}
