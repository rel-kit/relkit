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

/** Transfers request finalization to body EOF, failure or cancellation exactly once.
 * @param request - Native request whose headers, body and cancellation signal define this operation.
 * @param response - Native response whose status, headers and body lifetime are preserved.
 * @param state - State owned by the current request or operation.
 * @param options - Application dependencies and configuration for this domain.
 * @param handlerError - Native handler failure observed before response-body ownership transfers.
 * @returns The original response when already finalizable, otherwise a body-tracking response wrapper.
 */
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
  /** Finalize byte counts, request record, span and lifecycle notification exactly once.
   * @param outcome - Terminal body outcome before request-level cancellation precedence.
   * @param error - Optional body or handler failure attributed to the terminal span.
   * @returns Nothing; repeated completion attempts leave the finalized record unchanged.
   */
  const finish = (outcome: RequestOutcome, error?: unknown): void => {
    if (done || completedStates.has(state)) return;
    done = true;
    completedStates.add(state);
    if ((state.runtimeSignal?.current ?? state.signal).aborted) outcome = "cancelled";
    (state.runtimeSignal?.current ?? request.signal).removeEventListener("abort", abort);
    span.attribute("http.response.status_code", response.status);
    span.attribute("http.response.body.size", bytes);
    const prior = state.requestRecord?.setOutcome(outcome) ?? outcome;
    const effective =
      prior === "success" && response.status >= 500
        ? (state.requestRecord?.setOutcome("defect") ?? "defect")
        : prior;
    span.event(`http.${effective}`, BigInt(Date.now()) * 1_000_000n);
    const status =
      response.status >= 400 ? response.status : fallbackStatus(effective, response.status);
    const record = state.requestRecord?.finish({ status, responseBytes: bytes });
    if (record) options.observability?.collect(record);
    const finalOutcome = record?.outcome ?? effective;
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
  /** Finalize the response when its owning request signal aborts.
   * @returns Nothing; forwards the signal reason to the idempotent finalizer.
   */
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
    finish("success");
    return response;
  }
  const reader = response.body.getReader();
  return new Response(
    new ReadableStream<Uint8Array>({
      /** Reads one downstream-requested chunk and finalizes the body at its terminal condition.
       * @param controller - Native response-body controller used to emit and terminate chunks.
       * @returns A Promise settling after one chunk is forwarded or the response body terminates.
       */
      async pull(controller) {
        try {
          const result = await reader.read();
          if (result.done) {
            finish("success");
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
      /** Returns the source iterator so cancellation releases its owned resources.
       * @param reason - Cancellation or interruption reason supplied by the owning boundary.
       * @returns The underlying reader's cancellation Promise after terminal cancellation is recorded.
       */
      cancel(reason) {
        finish("cancelled", reason);
        return reader.cancel(reason);
      },
    }),
    { status: response.status, statusText: response.statusText, headers: response.headers },
  );
}

/** Records cancellation before a response body becomes available.
 * @param request - Native request whose headers, body and cancellation signal define this operation.
 * @param state - State owned by the current request or operation.
 * @param options - Application dependencies and configuration for this domain.
 * @returns A cleanup callback that removes the early-abort listener.
 */
export function observeEarlyHttpAbort(
  request: Request,
  state: HttpRequestState,
  options: HttpMiddlewareOptions,
): () => void {
  const signal = state.signal;
  /** Record cancellation before headers exist using the synthetic HTTP 499 boundary.
   * @returns Nothing; terminal state prevents later response finalization from repeating it.
   */
  const abort = (): void => {
    const error = signal.reason ?? new DOMException("Request cancelled", "AbortError");
    observeHttpResponse(request, new Response(null, { status: 499 }), state, options, error);
  };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  return () => signal.removeEventListener("abort", abort);
}

/** Builds a lifecycle event from native boundary state and terminal metadata.
 * @param request - Native request whose headers, body and cancellation signal define this operation.
 * @param state - State owned by the current request or operation.
 * @param type - Lifecycle event kind describing the current request boundary.
 * @param status - HTTP status associated with the observed response or lifecycle event.
 * @param error - Failure metadata recorded or projected at this boundary.
 * @returns An immutable lifecycle event with request identity and optional terminal timing metadata.
 */
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

/** Chooses a status consistent with the terminal outcome when no response status is available.
 * @param outcome - Terminal classification used for durable state and telemetry.
 * @param status - HTTP status associated with the observed response or lifecycle event.
 * @returns The response status for success, or the status associated with its terminal failure class.
 */
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
