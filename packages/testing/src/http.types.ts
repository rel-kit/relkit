import type { MaybePromise } from "@relkit/contracts";
import type { InspectableObservabilityHooks, ObservabilityHookEvent } from "@relkit/engine";
import type { TestHttpListener, TestHttpListenerOptions } from "./http-listener.js";

/** Native Request, URL or relative path accepted by direct HTTP fixtures. */
export type TestHttpInput = Request | string | URL;

/** Native in-memory request operation preserving RequestInit and Response contracts. */
export type TestHttpRequest = (input: TestHttpInput, init?: RequestInit) => Promise<Response>;

/** The app request/fetch methods satisfy this boundary without leaking framework types. */
export interface TestHttpApplication {
  readonly request?: (input: TestHttpInput, init?: RequestInit) => Response | Promise<Response>;
  readonly fetch?: (request: Request) => Response | Promise<Response>;
}

/** Explicit test origin, listener close policy and ownership callbacks. */
export interface TestHttpClientOptions {
  readonly logger?: import("@relkit/runtime-effect").LoggerOptions;
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
