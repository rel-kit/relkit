import { Effect } from "effect";
import type { MiddlewareHandler } from "hono";
import { isRelkitControlPlanePath } from "./control-plane.js";
import { httpBoundary, runHttp } from "./http-effect.js";
import {
  createFallbackState,
  emitLifecycle,
  getRequestState,
  lifecycleEvent,
  setRequestState,
  validateLimit,
  type HttpMiddlewareOptions,
} from "./middleware-utils.js";
import { ensureRequestRecord, finishRequestRecord } from "./request-record-middleware.js";

/** Enforces declared body and timeout limits while cleaning up request listeners.
 * @param options - Application dependencies and configuration for this domain.
 * @returns A handler rejecting oversized requests and forwarding cancellation with scoped timeout cleanup.
 */
export function limitsMiddleware(options: HttpMiddlewareOptions = {}): MiddlewareHandler {
  validateLimit(options.maxBodyBytes, "maxBodyBytes");
  validateLimit(options.timeoutMs, "timeoutMs");
  return async (context, next) => {
    const controlPlane = isRelkitControlPlanePath(context.req.path);
    const state = getRequestState(context) ?? createFallbackState(context, options);
    const current = controlPlane ? state : ensureRequestRecord(context, state, options);
    const length = Number(context.req.header("content-length"));
    if (
      options.maxBodyBytes !== undefined &&
      Number.isSafeInteger(length) &&
      length > options.maxBodyBytes
    ) {
      const response = new Response(JSON.stringify({ error: "payload-too-large" }), {
        status: 413,
        headers: { "content-type": "application/json" },
      });
      current.requestRecord?.add({
        kind: "mapping",
        status: response.status,
        outcome: "validation-error",
      });
      current.requestRecord?.setOutcome("validation-error");
      setRequestState(context, Object.freeze({ ...current, signal: context.req.raw.signal }));
      context.res = response;
      if (!controlPlane) {
        finishRequestRecord(context, current, options, "validation-error");
        await emitLifecycle(
          options,
          lifecycleEvent(context, current, "request.started"),
          "onStart",
        );
        await emitLifecycle(
          options,
          lifecycleEvent(context, current, "request.completed", undefined, response.status),
          "onComplete",
        );
      }
      return response;
    }
    const controller = new AbortController();
    const source = context.req.raw.signal;
    /** Propagate native request cancellation to the middleware-owned controller.
     * @returns Nothing; preserves the original cancellation reason.
     */
    const abort = (): void => controller.abort(source.reason);
    if (source.aborted) abort();
    else source.addEventListener("abort", abort, { once: true });
    const deadlineMs =
      options.timeoutMs === undefined ? undefined : current.startedAt + options.timeoutMs;
    setRequestState(
      context,
      Object.freeze(
        deadlineMs === undefined
          ? { ...current, signal: controller.signal }
          : { ...current, signal: controller.signal, deadlineMs },
      ),
    );
    try {
      await runHttp(
        Effect.scoped(
          Effect.gen(function* () {
            if (options.timeoutMs !== undefined) {
              yield* Effect.sleep(options.timeoutMs).pipe(
                Effect.andThen(
                  Effect.sync(() =>
                    controller.abort(new DOMException("HTTP request timeout", "TimeoutError")),
                  ),
                ),
                Effect.forkScoped,
              );
            }
            yield* httpBoundary("http.middleware.next", next);
          }),
        ),
      );
    } finally {
      source.removeEventListener("abort", abort);
    }
  };
}
