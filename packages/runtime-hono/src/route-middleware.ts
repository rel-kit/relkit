import { publicTrace } from "@relkit/invocation";
import type { MiddlewareContext, MiddlewareDescriptor } from "@relkit/routes";
import { createPublicClockEffect } from "@relkit/runtime-effect";
import type { Context, Hono, Next } from "hono";
import { runHttp } from "./http-effect.js";
import { getEntry, isRecord } from "./materialize-routes-utils.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import { getRequestState } from "./middleware.js";
import { failureOutcome, recordDetail } from "./request-record-utils.js";

/** Registers declared middleware deterministically before materialized routes.
 * @param app - Hono application receiving the configured endpoints or middleware.
 * @param options - Application dependencies and configuration for this domain.
 * @returns Nothing; registers callable manifest middleware in stable declaration-ID order.
 */
export function registerRouteMiddleware(app: Hono, options: RouteMaterializationOptions): void {
  for (const middleware of [...options.plan.middlewares].sort((a, b) => a.id.localeCompare(b.id))) {
    const descriptor = getEntry(options.manifest.middleware, middleware.id);
    if (!isMiddleware(descriptor)) continue;
    app.use(middleware.path, createMiddlewareHandler(middleware.id, descriptor, options));
  }
}

/** Executes declared middleware with trace attribution and request-record outcomes.
 * @param middlewareId - Stable registered middleware identifier used for attribution.
 * @param descriptor - Resolved runtime declaration and its application callbacks.
 * @param options - Application dependencies and configuration for this domain.
 * @returns A native handler preserving the declared middleware result and recording its outcome.
 */
function createMiddlewareHandler(
  middlewareId: string,
  descriptor: MiddlewareDescriptor,
  options: RouteMaterializationOptions,
): (context: Context, next: Next) => Promise<Response | void> {
  return async (context, next) => {
    const state = getRequestState(context);
    const startedAt = Date.now();
    try {
      const result = await publicTrace.span(`relkit.middleware.${middlewareId}`, async () =>
        descriptor.handler(
          context,
          next,
          await middlewareContext(middlewareId, context.req.raw, state, options),
        ),
      );
      recordDetail(state?.requestRecord, {
        kind: "middleware",
        targetId: middlewareId,
        durationMs: Math.max(0, Date.now() - startedAt),
        outcome: "success",
      });
      return result;
    } catch (cause) {
      const failure = failureOutcome(cause, state?.signal);
      recordDetail(state?.requestRecord, {
        kind: "middleware",
        targetId: middlewareId,
        durationMs: Math.max(0, Date.now() - startedAt),
        outcome: failure.outcome,
      });
      throw cause;
    }
  };
}

/** Builds trusted middleware dependencies and an interruptible clock bridge.
 * @param middlewareId - Stable registered middleware identifier used for attribution.
 * @param request - Native request whose headers, body and cancellation signal define this operation.
 * @param state - State owned by the current request or operation.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The configured middleware context, or defaults with public tracing and an interruptible clock.
 */
async function middlewareContext(
  middlewareId: string,
  request: Request,
  state: ReturnType<typeof getRequestState>,
  options: RouteMaterializationOptions,
): Promise<MiddlewareContext> {
  const signal = state?.signal ?? new AbortController().signal;
  if (options.middlewareContext !== undefined) {
    return options.middlewareContext({
      middlewareId,
      signal,
      request,
      ...(options.auth === undefined ? {} : { auth: options.auth.contextFor(request) }),
      ...(state?.requestId === undefined ? {} : { requestId: state.requestId }),
      ...(state?.traceId === undefined ? {} : { traceId: state.traceId }),
    });
  }
  /** Discard middleware log calls when no application context supplied a logger.
   * @returns Nothing; the default context has no logging sink.
   */
  const noop = (): void => undefined;
  return {
    signal,
    env: Object.freeze({}),
    auth:
      options.auth?.contextFor(request) ??
      Object.freeze({ getSession: () => Promise.resolve(null) }),
    log: Object.freeze({ trace: noop, debug: noop, info: noop, warn: noop, error: noop }),
    trace: publicTrace,
    time: await runHttp(
      createPublicClockEffect(
        { run: (effect, settings) => runHttp(effect, settings?.signal) },
        signal,
      ),
    ),
  };
}

/** Recognizes a callable middleware descriptor before route registration.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns Whether the inspected value satisfies the declared type guard.
 */
function isMiddleware(value: unknown): value is MiddlewareDescriptor {
  return isRecord(value) && typeof value.path === "string" && typeof value.handler === "function";
}
