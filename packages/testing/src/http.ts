import { Layer, ManagedRuntime } from "effect";
import { runExecutionPromise, runExecutionSync } from "@relkit/contracts/operation";
import { TestHttpOwner, httpOwnerLayer, TestHttpPlatformLive } from "./http-owner.js";
import { disposeTestingOwner, testingLoggerLayer } from "./testing-owner.js";
import type {
  TestHttpInput,
  TestHttpRequest,
  TestHttpApplication,
  TestHttpClientOptions,
  TestHttpClient,
  TestObservability,
} from "./http.types.js";
export type {
  TestHttpInput,
  TestHttpRequest,
  TestHttpApplication,
  TestHttpClientOptions,
  TestHttpClient,
  TestObservability,
} from "./http.types.js";

import {
  createInspectableObservabilityHooks,
  OBSERVABILITY_HOOK_PROTOCOL,
  OBSERVABILITY_HOOK_VERSION,
  type InspectableObservabilityHooks,
  type ObservabilityHookEvent,
} from "@relkit/engine";
import {
  createTestHttpListener,
  type TestHttpListener,
  type TestHttpListenerOptions,
} from "./http-listener.js";

/**
 * Sends ordinary route tests through the app's in-memory request entry point.
 * @param app - Native in-memory application request/fetch boundary.
 * @param options - Explicit configuration and native dependencies for this test owner.
 * @returns A synchronous client facade whose close waits for pending listener startup.
 */
export function createTestHttpClient(
  app: TestHttpApplication,
  options: TestHttpClientOptions = {},
): TestHttpClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? "http://relkit.test");
  const owner = ManagedRuntime.make(
    httpOwnerLayer(app, options).pipe(
      Layer.provide(TestHttpPlatformLive),
      Layer.provideMerge(testingLoggerLayer(options.logger)),
    ),
  );
  let service;
  try {
    service = runExecutionSync(owner, TestHttpOwner);
  } catch (error) {
    void disposeTestingOwner(owner).catch(() => undefined);
    throw error;
  }
  let closing: Promise<void> | undefined;
  const request: TestHttpRequest = (input, init) =>
    dispatchInMemory(app, makeRequest(input, init, baseUrl));
  const listen = (listenerOptions?: TestHttpListenerOptions) =>
    closing === undefined
      ? runExecutionPromise(owner, service.listen(listenerOptions))
      : Promise.reject(new Error("Test HTTP client is closed"));
  const close = (): Promise<void> =>
    (closing ??= runExecutionPromise(owner, service.close).finally(() =>
      disposeTestingOwner(owner),
    ));
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
  try {
    options.registerClose?.(close);
  } catch (error) {
    void close().catch(() => undefined);
    throw error;
  }
  return client;
}

/** @inheritDoc createTestHttpClient */
export const createHttpTestClient = createTestHttpClient;
export { createTestHttpListener } from "./http-listener.js";
export { createBunHttpListener } from "./http-listener.js";
export type {
  RealListenerPurpose,
  TestHttpListener,
  TestHttpListenerOptions,
} from "./http-listener.js";

/**
 * Asserts the existing native HTTP response status.
 * @param response - Native HTTP response returned by the application.
 * @param expected - Existing expected status or ordered captured values.
 * @returns The same response when the assertion succeeds.
 */
export function assertResponseStatus(response: Response, expected: number): Response {
  if (response.status !== expected)
    throw new Error(`Expected HTTP ${String(expected)}, received ${String(response.status)}`);
  return response;
}

/**
 * Reads JSON after the optional native status assertion.
 * @typeParam T - Caller-asserted response or record value type; native assertions remain authoritative.
 * @param response - Native HTTP response returned by the application.
 * @param expectedStatus - Optional status assertion performed before consuming the body.
 * @returns The native decoded body cast to the caller's asserted type; no schema fallback is added.
 */
export async function responseJson<T = unknown>(
  response: Response,
  expectedStatus?: number,
): Promise<T> {
  if (expectedStatus !== undefined) assertResponseStatus(response, expectedStatus);
  return (await response.json()) as T;
}

/**
 * Reads text after the optional native status assertion.
 * @param response - Native HTTP response returned by the application.
 * @param expectedStatus - Optional status assertion performed before consuming the body.
 * @returns The native response text.
 */
export async function responseText(response: Response, expectedStatus?: number): Promise<string> {
  if (expectedStatus !== undefined) assertResponseStatus(response, expectedStatus);
  return response.text();
}

/**
 * Creates a protocol/version-checked capture for engine-backed HTTP tests.
 * @returns The capture and unchanged native assertion helpers.
 */
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

/** @inheritDoc createTestObservability */
export const createObservabilityAssertions = createTestObservability;

/**
 * Asserts event order and the existing observability protocol/version.
 * @param hooks - Caller-native hooks forwarded without changing ordering.
 * @param expected - Existing expected status or ordered captured values.
 * @returns The original captured events when all assertions pass.
 */
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

/**
 * Binds one HTTP verb to the in-memory request boundary.
 * @param request - Native operation input carrying explicit identity and execution context.
 * @param verb - HTTP method retained in RequestInit.
 * @returns A request function retaining all other RequestInit fields.
 */
function method(request: TestHttpRequest, verb: string): TestHttpRequest {
  return (input, init) => request(input, { ...(init ?? {}), method: verb });
}

/**
 * Normalizes a native request input against the configured base URL.
 * @param input - Declared input passed through the owning schema authority.
 * @param init - Caller-native request options.
 * @param baseUrl - Explicit origin for relative test requests.
 * @returns A Request retaining caller options and existing Request semantics.
 */
function makeRequest(input: TestHttpInput, init: RequestInit | undefined, baseUrl: URL): Request {
  if (input instanceof Request) return init === undefined ? input : new Request(input, init);
  const url = input instanceof URL ? new URL(input) : new URL(input, baseUrl);
  return new Request(url.toString(), init);
}

/**
 * Normalizes the test origin to a trailing-slash URL.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns An independent URL suitable for relative request resolution.
 */
function normalizeBaseUrl(value: string | URL): URL {
  const url = new URL(value.toString());
  if (!url.href.endsWith("/")) url.href += "/";
  return url;
}

/**
 * Prefers the application's in-memory request entry point.
 * @param app - Native in-memory application request/fetch boundary.
 * @param request - Native operation input carrying explicit identity and execution context.
 * @returns The native response without opening a listening socket.
 */
async function dispatchInMemory(app: TestHttpApplication, request: Request): Promise<Response> {
  if (app.request !== undefined) return app.request(request);
  return dispatchFetch(app, request);
}

/**
 * Invokes the available native application request/fetch boundary.
 * @param app - Native in-memory application request/fetch boundary.
 * @param request - Native operation input carrying explicit identity and execution context.
 * @returns The original native response or Promise.
 */
function dispatchFetch(app: TestHttpApplication, request: Request): Response | Promise<Response> {
  if (app.fetch !== undefined) return app.fetch(request);
  throw new TypeError("Test HTTP application must expose request() or fetch()");
}
