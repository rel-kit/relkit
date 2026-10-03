import { parseTraceParent, toRequestId } from "@relkit/contracts";
import type { MiddlewareHandler } from "hono";
import { isRelkitControlPlanePath } from "./control-plane.js";
import { createHttpSpanRuntime, httpSpanMiddleware, outerHttpState } from "./http-span.js";
import { limitsMiddleware } from "./middleware-limits.js";
import {
  createFallbackState,
  emitLifecycle,
  emitTerminalLifecycle,
  getRequestState,
  lifecycleEvent,
  readId,
  REQUEST_ID_HEADER,
  setRequestState,
  setResponseHeader,
  type HttpMiddlewareOptions,
  type HttpRequestState,
} from "./middleware-utils.js";
import type { FrameworkMiddleware } from "./middleware.types.js";
import { ensureRequestRecord } from "./request-record-middleware.js";
import { failureOutcome } from "./request-record-utils.js";
export type { FrameworkMiddleware, FrameworkMiddlewareName } from "./middleware.types.js";

export {
  getRequestState,
  REQUEST_CONTEXT_KEY,
  REQUEST_ID_HEADER,
  TRACE_ID_HEADER,
  type HttpMiddlewareOptions,
  type HttpRequestState,
  type RequestLifecycleEvent,
  type RequestLifecycleHooks,
  type RequestLifecycleType,
} from "./middleware-utils.js";

export const FRAMEWORK_MIDDLEWARE_ORDER = Object.freeze([
  "request-id",
  "trace",
  "limits",
  "request-record",
] as const);

/** Installs the four framework-owned HTTP middleware layers in v3 order.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The ordered immutable request-ID, trace, limits and request-record middleware list.
 */
export function createFrameworkMiddleware(
  options: HttpMiddlewareOptions = {},
): readonly FrameworkMiddleware[] {
  options = { ...options, spanRuntime: createHttpSpanRuntime(options) };
  return Object.freeze([
    { name: "request-id", handler: applicationOnly(requestIdMiddleware(options)) },
    { name: "trace", handler: applicationOnly(traceMiddleware(options)) },
    { name: "limits", handler: limitsMiddleware(options) },
    { name: "request-record", handler: applicationOnly(requestLifecycleMiddleware(options)) },
  ]);
}

export const createHttpMiddleware = createFrameworkMiddleware;

export { limitsMiddleware } from "./middleware-limits.js";

/** Establishes one request identity for downstream middleware and response headers.
 * @param options - Application dependencies and configuration for this domain.
 * @returns A handler retaining the request identity through downstream execution and response headers.
 */
export function requestIdMiddleware(options: HttpMiddlewareOptions = {}): MiddlewareHandler {
  return async (context, next) => {
    const outer = outerHttpState(context.req.raw);
    if (outer !== undefined) {
      setRequestState(context, outer);
      context.header(options.requestIdHeader ?? REQUEST_ID_HEADER, outer.requestId);
      await next();
      setResponseHeader(context, options.requestIdHeader ?? REQUEST_ID_HEADER, outer.requestId);
      return;
    }
    const requestId = readId(undefined, options.requestId, "request", toRequestId);
    const remoteParent = parseTraceParent(
      context.req.header("traceparent"),
      context.req.header("tracestate"),
    );
    const traceId = remoteParent?.traceId ?? createFallbackState(context, options).traceId;
    const startedAt = options.now?.() ?? Date.now();
    const state: HttpRequestState = Object.freeze({
      requestId,
      traceId,
      signal: context.req.raw.signal,
      runtimeSignal: { current: context.req.raw.signal },
      startedAt,
      ...(remoteParent === undefined ? {} : { remoteParent }),
    });
    setRequestState(context, state);
    ensureRequestRecord(context, state, options);
    context.header(options.requestIdHeader ?? REQUEST_ID_HEADER, requestId);
    try {
      await next();
    } finally {
      setResponseHeader(context, options.requestIdHeader ?? REQUEST_ID_HEADER, requestId);
    }
  };
}

/** Resolves incoming trace context for the request and downstream invocation.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The HTTP span middleware configured for incoming trace propagation.
 */
export function traceMiddleware(options: HttpMiddlewareOptions = {}): MiddlewareHandler {
  return httpSpanMiddleware(options);
}

/** Emits request lifecycle events while preserving the downstream result and failure.
 * @param options - Application dependencies and configuration for this domain.
 * @returns A handler emitting lifecycle observations while preserving downstream failures.
 */
export function requestLifecycleMiddleware(options: HttpMiddlewareOptions = {}): MiddlewareHandler {
  return async (context, next) => {
    const state = ensureRequestRecord(
      context,
      getRequestState(context) ?? createFallbackState(context, options),
      options,
    );
    if (!state.lifecycleStarted) {
      const started = lifecycleEvent(context, state, "request.started");
      await emitLifecycle(options, started, "onStart");
    }
    const signal = state.runtimeSignal?.current ?? state.signal;
    /** Publish the request's terminal cancellation event without delaying signal dispatch.
     * @returns Nothing; advisory lifecycle delivery runs through the terminal-event guard.
     */
    const cancelled = (): void => {
      void emitTerminalLifecycle(
        options,
        state,
        lifecycleEvent(context, state, "request.cancelled"),
        "onCancel",
      );
    };
    signal.addEventListener("abort", cancelled, { once: true });
    let failure: unknown;
    try {
      await next();
    } catch (cause) {
      failure = cause;
      throw cause;
    } finally {
      signal.removeEventListener("abort", cancelled);
      if (state.signal.aborted) {
        state.requestRecord?.setOutcome("cancelled");
        return;
      }
      const outcome = failure === undefined ? undefined : failureOutcome(failure, state.signal);
      if (outcome !== undefined) state.requestRecord?.setOutcome(outcome.outcome, outcome.errorId);
    }
  };
}

/** Skips application middleware on reserved control-plane endpoints.
 * @param handler - Native handler executed within the configured boundary.
 * @returns A handler bypassing the supplied middleware for reserved control-plane paths.
 */
function applicationOnly(handler: MiddlewareHandler): MiddlewareHandler {
  return async (context, next) => {
    if (isRelkitControlPlanePath(context.req.path)) return next();
    return handler(context, next);
  };
}
