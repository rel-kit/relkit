import type { MaybePromise, ProblemDetails } from "relkit/contracts";
import type { InspectableObservabilityHooks, ObservabilityHookEvent } from "relkit/engine";
import type { TestHttpListener, TestHttpListenerOptions } from "./http-listener.js";

/** Native Request, URL or relative path accepted by direct HTTP fixtures. */
export type TestHttpInput = Request | string | URL;

/**
 * Native `Response` whose JSON body has the type the test declares.
 * @typeParam Body - Shape the test expects `json()` to resolve to; it is not validated.
 * @example
 * const response = await app.http.get<{ message: string }>("/hello");
 * const { message } = await response.json();
 */
export interface TestHttpResponse<Body = unknown> extends Response {
  readonly json: () => Promise<Body>;
}

/** Problem Details response that RelKit routes return for validation and declared errors. */
export type TestProblemResponse = TestHttpResponse<ProblemDetails>;

/**
 * `RequestInit` with a `json` shorthand for the request body.
 * @typeParam Json - Shape of the value sent as the JSON body.
 */
export interface TestHttpRequestInit<Json = unknown> extends RequestInit {
  /** Serialized as the body, with `content-type: application/json` unless a header already sets one. */
  readonly json?: Json;
}

/**
 * Native in-memory request operation that types the request and response JSON.
 * @typeParam Body - Shape the test expects `response.json()` to resolve to.
 * @typeParam Json - Shape of the optional `json` request body.
 */
export type TestHttpRequest = <Body = unknown, Json = unknown>(
  input: TestHttpInput,
  init?: TestHttpRequestInit<Json>,
) => Promise<TestHttpResponse<Body>>;

/** The app request/fetch methods satisfy this boundary without leaking framework types. */
export interface TestHttpApplication {
  readonly request?: (input: TestHttpInput, init?: RequestInit) => Response | Promise<Response>;
  readonly fetch?: (request: Request) => Response | Promise<Response>;
}

/** Explicit test origin, listener close policy and ownership callbacks. */
export interface TestHttpClientOptions {
  readonly logger?: import("relkit/runtime-effect").LoggerOptions;
  readonly baseUrl?: string | URL;
  /** Registers client shutdown with the owning test runtime/application. */
  readonly registerClose?: (close: () => Promise<void>) => void;
  readonly onClose?: () => MaybePromise<void>;
  readonly closeTimeoutMs?: number;
}

/** Owned HTTP test facade exposing direct requests and optional real listeners. */
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

/** Native engine event capture with ordered protocol/version assertions. */
export interface TestObservability {
  readonly hooks: InspectableObservabilityHooks;
  readonly read: () => readonly ObservabilityHookEvent[];
  readonly types: () => readonly ObservabilityHookEvent["type"][];
  readonly assertTypes: (
    expected: readonly ObservabilityHookEvent["type"][],
  ) => readonly ObservabilityHookEvent[];
  readonly clear: () => void;
}
