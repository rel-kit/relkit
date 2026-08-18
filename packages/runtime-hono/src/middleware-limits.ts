import type { MiddlewareHandler } from "hono";
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

export function limitsMiddleware(options: HttpMiddlewareOptions = {}): MiddlewareHandler {
  validateLimit(options.maxBodyBytes, "maxBodyBytes");
  validateLimit(options.timeoutMs, "timeoutMs");
  return async (context, next) => {
    const current = ensureRequestRecord(
      context,
      getRequestState(context) ?? createFallbackState(context, options),
      options,
    );
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
      finishRequestRecord(context, current, options, "validation-error");
      await emitLifecycle(options, lifecycleEvent(context, current, "request.started"), "onStart");
      await emitLifecycle(
        options,
        lifecycleEvent(context, current, "request.completed", undefined, response.status),
        "onComplete",
      );
      return response;
    }
    const controller = new AbortController();
    const source = context.req.raw.signal;
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
    const timer =
      deadlineMs === undefined
        ? undefined
        : setTimeout(
            () => controller.abort(new DOMException("HTTP request timeout", "TimeoutError")),
            options.timeoutMs,
          );
    try {
      await next();
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      source.removeEventListener("abort", abort);
    }
  };
}
