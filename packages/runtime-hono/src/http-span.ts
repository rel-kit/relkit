import { createSpanId, createTraceId, parseTraceParent, toRequestId } from "@relkit/contracts";
import { runInExecutionContext, SpanRuntime, startRootSpan } from "@relkit/invocation";
import { createRequestRecordBuilder } from "@relkit/observability";
import type { MiddlewareHandler } from "hono";
import {
  emitLifecycle,
  getRequestState,
  readId,
  setRequestState,
  type HttpMiddlewareOptions,
  type HttpRequestState,
} from "./middleware-utils.js";
import { collectHttpSpan } from "./http-span-record.js";
import { boundaryEvent, observeEarlyHttpAbort, observeHttpResponse } from "./http-response.js";
import { isRelkitControlPlanePath } from "./control-plane.js";

const outerStates = new WeakMap<Request, HttpRequestState>();

export function createHttpSpanRuntime(options: HttpMiddlewareOptions): SpanRuntime {
  return (
    options.spanRuntime ??
    new SpanRuntime({
      ids: { next: (kind) => (kind === "trace" ? createTraceId() : createSpanId()) },
      observer: (event) => collectHttpSpan(event, options),
      ...(options.observability?.capture === undefined
        ? {}
        : { capture: options.observability.capture }),
      recording: options.observability !== undefined,
    })
  );
}

export function outerHttpState(request: Request): HttpRequestState | undefined {
  return outerStates.get(request);
}

export function httpSpanMiddleware(options: HttpMiddlewareOptions): MiddlewareHandler {
  return async (context, next) => {
    const state = getRequestState(context);
    if (!state || isRelkitControlPlanePath(context.req.path)) return next();
    if (state.serverSpan !== undefined) return next();
    const runtime = options.spanRuntime ?? createHttpSpanRuntime(options);
    const span = startRootSpan(
      runtime,
      `HTTP ${context.req.method}`,
      "server",
      state.remoteParent,
      state.remoteParent === undefined ? state.traceId : undefined,
    );
    prepareSpan(span, state.requestId, context.req.method);
    const active = Object.freeze({ ...state, traceId: span.traceId, serverSpan: span });
    active.requestRecord?.setTraceId(span.traceId);
    setRequestState(context, active);
    let failure: unknown;
    try {
      await runInExecutionContext(
        { span, runtime, requestId: state.requestId, originRequestId: state.requestId },
        next,
      );
    } catch (error) {
      failure = error;
    }
    context.res = observeHttpResponse(context.req.raw, context.res, active, options, failure);
    if (failure !== undefined) throw failure;
  };
}

export async function instrumentHttpRequest(
  request: Request,
  options: HttpMiddlewareOptions,
  handler: (request: Request) => Response | Promise<Response>,
): Promise<Response> {
  if (isRelkitControlPlanePath(new URL(request.url).pathname)) return handler(request);
  const requestId = readId(undefined, options.requestId, "request", toRequestId);
  const remoteParent = parseTraceParent(
    request.headers.get("traceparent"),
    request.headers.get("tracestate"),
  );
  const runtime = options.spanRuntime ?? createHttpSpanRuntime(options);
  const span = startRootSpan(runtime, `HTTP ${request.method}`, "server", remoteParent);
  const startedAt = options.now?.() ?? Date.now();
  const requestBytes = contentLength(request);
  const requestRecord =
    options.observability === undefined
      ? undefined
      : createRequestRecordBuilder({
          requestId,
          traceId: span.traceId,
          generationId: options.generationId ?? "generation.unknown",
          graphHash: options.graphHash ?? "sha256:unknown",
          method: request.method,
          rawPath: new URL(request.url).pathname,
          startedAt,
          ...(requestBytes === undefined ? {} : { requestBytes }),
          ...(options.now === undefined ? {} : { now: options.now }),
        });
  if (requestRecord) options.observability!.collect(requestRecord.started);
  const state: HttpRequestState = Object.freeze({
    requestId,
    traceId: span.traceId,
    signal: request.signal,
    startedAt,
    ...(remoteParent === undefined ? {} : { remoteParent }),
    runtimeSignal: { current: request.signal },
    serverSpan: span,
    ...(requestRecord === undefined ? {} : { requestRecord }),
    lifecycleStarted: true,
  });
  prepareSpan(span, requestId, request.method);
  outerStates.set(request, state);
  const removeEarlyAbort = observeEarlyHttpAbort(request, state, options);
  await emitLifecycle(options, boundaryEvent(request, state, "request.started"), "onStart");
  try {
    const response = await runInExecutionContext(
      { span, runtime, requestId, originRequestId: requestId },
      () => handler(request),
    );
    return withRequestId(
      observeHttpResponse(request, response, state, options),
      options,
      requestId,
    );
  } catch (error) {
    observeHttpResponse(request, new Response(null, { status: 500 }), state, options, error);
    throw error;
  } finally {
    removeEarlyAbort();
    outerStates.delete(request);
  }
}

function prepareSpan(
  span: import("@relkit/invocation").RelkitSpan,
  requestId: string,
  method: string,
): void {
  span.attribute("relkit.request.id", requestId);
  span.attribute("relkit.origin_request.id", requestId);
  span.attribute("http.request.method", method);
  span.event("http.received", span.startTime);
}

function contentLength(request: Request): number | undefined {
  const header = request.headers.get("content-length");
  if (header === null || !/^\d+$/.test(header)) return undefined;
  const value = Number(header);
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
function withRequestId(
  response: Response,
  options: HttpMiddlewareOptions,
  requestId: string,
): Response {
  const headers = new Headers(response.headers);
  headers.set(options.requestIdHeader ?? "x-request-id", requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
