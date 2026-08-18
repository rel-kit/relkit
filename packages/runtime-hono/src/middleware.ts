import { toRequestId, toTraceId } from "@zsys/contracts";
import type { MiddlewareHandler } from "hono";
import {
  createFallbackState,
  emitLifecycle,
  getRequestState,
  lifecycleEvent,
  readId,
  REQUEST_ID_HEADER,
  setResponseHeader,
  setRequestState,
  TRACE_ID_HEADER,
  type HttpMiddlewareOptions,
  type HttpRequestState,
  type RequestLifecycleEvent,
  type RequestLifecycleHooks,
  type RequestLifecycleType,
} from "./middleware-utils.js";
import { ensureRequestRecord, finishRequestRecord } from "./request-record-middleware.js";
import { limitsMiddleware } from "./middleware-limits.js";
import { failureOutcome } from "./request-record-utils.js";

export {
  REQUEST_CONTEXT_KEY,
  REQUEST_ID_HEADER,
  TRACE_ID_HEADER,
  getRequestState,
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
export type FrameworkMiddlewareName = (typeof FRAMEWORK_MIDDLEWARE_ORDER)[number];

export interface FrameworkMiddleware {
  readonly name: FrameworkMiddlewareName;
  readonly handler: MiddlewareHandler;
}

/** Installs the four framework-owned HTTP middleware layers in v3 order. */
export function createFrameworkMiddleware(
  options: HttpMiddlewareOptions = {},
): readonly FrameworkMiddleware[] {
  return Object.freeze([
    { name: "request-id", handler: requestIdMiddleware(options) },
    { name: "trace", handler: traceMiddleware(options) },
    { name: "limits", handler: limitsMiddleware(options) },
    { name: "request-record", handler: requestLifecycleMiddleware(options) },
  ]);
}

export const createHttpMiddleware = createFrameworkMiddleware;

export { limitsMiddleware } from "./middleware-limits.js";

export function requestIdMiddleware(options: HttpMiddlewareOptions = {}): MiddlewareHandler {
  return async (context, next) => {
    const requestId = readId(
      context.req.header(options.requestIdHeader ?? REQUEST_ID_HEADER),
      options.requestId,
      "request",
      toRequestId,
    );
    const traceId = readId(
      context.req.header(options.traceIdHeader ?? TRACE_ID_HEADER),
      options.traceId,
      "trace",
      toTraceId,
    );
    const startedAt = options.now?.() ?? Date.now();
    const state: HttpRequestState = Object.freeze({
      requestId,
      traceId,
      signal: context.req.raw.signal,
      startedAt,
    });
    setRequestState(context, state);
    ensureRequestRecord(context, state, options);
    context.header(options.requestIdHeader ?? REQUEST_ID_HEADER, requestId);
    context.header(options.traceIdHeader ?? TRACE_ID_HEADER, traceId);
    try {
      await next();
    } finally {
      setResponseHeader(context, options.requestIdHeader ?? REQUEST_ID_HEADER, requestId);
    }
  };
}

export function traceMiddleware(options: HttpMiddlewareOptions = {}): MiddlewareHandler {
  return async (context, next) => {
    const current = ensureRequestRecord(
      context,
      getRequestState(context) ?? createFallbackState(context, options),
      options,
    );
    const traceId = readId(
      context.req.header(options.traceIdHeader ?? TRACE_ID_HEADER),
      options.traceId,
      "trace",
      toTraceId,
    );
    current.requestRecord?.setTraceId(traceId);
    setRequestState(context, Object.freeze({ ...current, traceId }));
    context.header(options.traceIdHeader ?? TRACE_ID_HEADER, traceId);
    try {
      await next();
    } finally {
      setResponseHeader(context, options.traceIdHeader ?? TRACE_ID_HEADER, traceId);
    }
  };
}

export function requestLifecycleMiddleware(options: HttpMiddlewareOptions = {}): MiddlewareHandler {
  return async (context, next) => {
    const state = ensureRequestRecord(
      context,
      getRequestState(context) ?? createFallbackState(context, options),
      options,
    );
    const started = lifecycleEvent(context, state, "request.started");
    await emitLifecycle(options, started, "onStart");
    let failure: unknown;
    let cancelled = state.signal.aborted;
    let cancellation: Promise<void> | undefined;
    const onAbort = (): void => {
      cancelled = true;
      cancellation = emitLifecycle(
        options,
        lifecycleEvent(context, state, "request.cancelled"),
        "onCancel",
      );
    };
    if (state.signal.aborted) onAbort();
    else state.signal.addEventListener("abort", onAbort, { once: true });
    try {
      await next();
    } catch (cause) {
      failure = cause;
      throw cause;
    } finally {
      state.signal.removeEventListener("abort", onAbort);
      if (cancellation !== undefined) await cancellation;
      if (cancelled) {
        state.requestRecord?.setOutcome("cancelled");
        finishRequestRecord(context, state, options, "cancelled");
        return;
      }
      const outcome = failure === undefined ? undefined : failureOutcome(failure, state.signal);
      if (outcome !== undefined) state.requestRecord?.setOutcome(outcome.outcome, outcome.errorId);
      if (failure !== undefined) finishRequestRecord(context, state, options, outcome!.outcome);
      else finishRequestRecord(context, state, options, "success");
      const type: RequestLifecycleType =
        failure === undefined ? "request.completed" : "request.failed";
      await emitLifecycle(
        options,
        lifecycleEvent(context, state, type, failure),
        failure === undefined ? "onComplete" : "onError",
      );
    }
  };
}
