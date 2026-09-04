import { completeSpan } from "@relkit/invocation";
import type { RequestOutcome } from "@relkit/observability";
import {
  emitTerminalLifecycle,
  type HttpMiddlewareOptions,
  type HttpRequestState,
  type RequestLifecycleEvent,
  type RequestLifecycleType,
} from "./middleware-utils.js";

const completedStates = new WeakSet<HttpRequestState>();

export function observeHttpResponse(
  request: Request,
  response: Response,
  state: HttpRequestState,
  options: HttpMiddlewareOptions,
  handlerError?: unknown,
): Response {
  if (completedStates.has(state)) return response;
  const span = state.serverSpan!;
  span.event("http.response.headers", BigInt(Date.now()) * 1_000_000n, {
    "http.response.status_code": response.status,
  });
  let done = false;
  let bytes = 0;
  const finish = (outcome: RequestOutcome, error?: unknown): void => {
    if (done || completedStates.has(state)) return;
    done = true;
    completedStates.add(state);
    if ((state.runtimeSignal?.current ?? state.signal).aborted) outcome = "cancelled";
    (state.runtimeSignal?.current ?? request.signal).removeEventListener("abort", abort);
    span.attribute("http.response.status_code", response.status);
    span.attribute("http.response.body.size", bytes);
    span.event(`http.${outcome}`, BigInt(Date.now()) * 1_000_000n);
    const effective = state.requestRecord?.setOutcome(
      outcome === "success" && response.status >= 500 ? "defect" : outcome,
    );
    const status =
      response.status >= 400
        ? response.status
        : fallbackStatus(effective ?? outcome, response.status);
    const record = state.requestRecord?.finish({ status, responseBytes: bytes });
    if (record) options.observability?.collect(record);
    const finalOutcome = record?.outcome ?? outcome;
    span.attribute("relkit.outcome", finalOutcome);
    if (error instanceof Error) {
      span.attribute("error.type", error.name);
      span.attribute("error.message", error.message);
    }
    completeSpan(span, error ?? (finalOutcome === "success" ? undefined : finalOutcome));
    const type =
      finalOutcome === "cancelled"
        ? "request.cancelled"
        : error === undefined
          ? "request.completed"
          : "request.failed";
    void emitTerminalLifecycle(
      options,
      state,
      boundaryEvent(request, state, type, response.status, error),
      finalOutcome === "cancelled" ? "onCancel" : error === undefined ? "onComplete" : "onError",
    );
  };
  const observedSignal = state.runtimeSignal?.current ?? request.signal;
  const abort = (): void => finish("cancelled", observedSignal.reason);
  observedSignal.addEventListener("abort", abort, { once: true });
  if (handlerError !== undefined) {
    finish("defect", handlerError);
    return response;
  }
  if (
    request.method === "HEAD" ||
    response.body === null ||
    response.status === 204 ||
    response.status === 304
  ) {
    finish(response.status >= 500 ? "defect" : "success");
    return response;
  }
  const reader = response.body.getReader();
  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const result = await reader.read();
          if (result.done) {
            finish(response.status >= 500 ? "defect" : "success");
            controller.close();
            return;
          }
          bytes += result.value.byteLength;
          controller.enqueue(result.value);
        } catch (error) {
          finish("defect", error);
          controller.error(error);
        }
      },
      cancel(reason) {
        finish("cancelled", reason);
        return reader.cancel(reason);
      },
    }),
    { status: response.status, statusText: response.statusText, headers: response.headers },
  );
}

export function observeEarlyHttpAbort(
  request: Request,
  state: HttpRequestState,
  options: HttpMiddlewareOptions,
): () => void {
  const signal = state.signal;
  const abort = (): void => {
    const error = signal.reason ?? new DOMException("Request cancelled", "AbortError");
    observeHttpResponse(request, new Response(null, { status: 499 }), state, options, error);
  };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  return () => signal.removeEventListener("abort", abort);
}

export function boundaryEvent(
  request: Request,
  state: HttpRequestState,
  type: RequestLifecycleType,
  status?: number,
  error?: unknown,
): RequestLifecycleEvent {
  const now = Date.now();
  return Object.freeze({
    type,
    requestId: state.requestId,
    traceId: state.traceId,
    method: request.method,
    path: new URL(request.url).pathname,
    startedAt: new Date(state.startedAt).toISOString(),
    ...(type === "request.started"
      ? {}
      : {
          completedAt: new Date(now).toISOString(),
          durationMs: Math.max(0, now - state.startedAt),
          status: status ?? 500,
        }),
    ...(error instanceof Error ? { errorName: error.name || "Error" } : {}),
  });
}

function fallbackStatus(outcome: RequestOutcome, status: number): number {
  return outcome === "success"
    ? status || 200
    : outcome === "validation-error"
      ? 422
      : outcome === "timeout"
        ? 504
        : outcome === "cancelled"
          ? 499
          : 500;
}
