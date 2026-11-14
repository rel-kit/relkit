import { Effect } from "effect";
import type { Context, MiddlewareHandler } from "hono";
import { isRelkitControlPlanePath } from "./control-plane.js";
import { httpBoundary, runHttp } from "./http-effect.js";
import { RequestBodyReader, RequestBodyReaderLive } from "./request-body-service.js";
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
import { problemResponse } from "./problem-details.js";

/** Consumes a request body the handler left unread, so the next request on a kept-alive
 * connection is parsed from its own first byte. A body larger than the limit, of unknown size
 * without a limit, or one that cannot be read is left for the connection to close instead.
 * @param request - Native request the response answers.
 * @param status - Status of the response about to be sent; an oversize answer always closes.
 * @param maxBodyBytes - Body limit in bytes, or undefined when none is configured.
 * @returns Whether the connection can stay open after the response.
 */
export async function settleUnreadBody(
  request: Request,
  status: number,
  maxBodyBytes: number | undefined,
): Promise<boolean> {
  if (status === 413) return false;
  const body = request.body;
  if (body === null || request.bodyUsed || body.locked) return true;
  const declared = Number(request.headers.get("content-length") ?? Number.NaN);
  if (maxBodyBytes === undefined || declared > maxBodyBytes) return false;
  const reader = body.getReader();
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) return true;
      total += part.value.byteLength;
      if (total > maxBodyBytes) {
        void reader.cancel().catch(() => undefined);
        return false;
      }
    }
  } catch {
    return false;
  } finally {
    reader.releaseLock();
  }
}

/** Checks the request body against the limit before any route or mounted handler reads it. A
 * declared `Content-Length` is checked as declared, since the listener frames the body by it; a
 * body without one is read up to the limit and handed on as a buffered request.
 * @param context - Hono context whose raw request is replaced by its buffered copy.
 * @param maxBodyBytes - Body limit in bytes.
 * @returns Whether the body fits the limit; on false, the body was left partly unread.
 */
async function withinBodyLimit(context: Context, maxBodyBytes: number): Promise<boolean> {
  const raw = context.req.raw;
  const length = Number(raw.headers.get("content-length") ?? Number.NaN);
  if (Number.isSafeInteger(length)) return length <= maxBodyBytes;
  if (raw.body === null || raw.method === "GET" || raw.method === "HEAD") return true;
  const read = await runHttp(
    Effect.gen(function* () {
      const reader = yield* RequestBodyReader;
      return yield* reader.read(raw, maxBodyBytes);
    }).pipe(Effect.provide(RequestBodyReaderLive)),
    raw.signal,
  );
  if (read.bytes === undefined) return false;
  const headers = new Headers(raw.headers);
  headers.set("content-length", String(read.bytes.byteLength));
  // The reader assembles the bytes into a fresh ArrayBuffer.
  const body = read.bytes as Uint8Array<ArrayBuffer>;
  context.req.raw = new Request(raw, { body, headers, signal: raw.signal });
  return true;
}

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
    if (
      options.maxBodyBytes !== undefined &&
      !(await withinBodyLimit(context, options.maxBodyBytes))
    ) {
      const response = problemResponse({
        traceId: current.traceId,
        status: 413,
        code: "body-too-large",
        detail: `The request body exceeds the ${options.maxBodyBytes}-byte limit.`,
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
