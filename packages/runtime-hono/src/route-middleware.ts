import type { Context, Hono, Next } from "hono";
import type { MiddlewareContext, MiddlewareDescriptor } from "@zsys/routes";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import { getEntry, isRecord } from "./materialize-routes-utils.js";
import { getRequestState } from "./middleware.js";
import { failureOutcome, recordDetail } from "./request-record-utils.js";

export function registerRouteMiddleware(app: Hono, options: RouteMaterializationOptions): void {
  for (const middleware of [...options.plan.middlewares].sort((a, b) => a.id.localeCompare(b.id))) {
    const descriptor = getEntry(options.manifest.middleware, middleware.id);
    if (!isMiddleware(descriptor)) continue;
    app.use(middleware.path, createMiddlewareHandler(middleware.id, descriptor, options));
  }
}

function createMiddlewareHandler(
  middlewareId: string,
  descriptor: MiddlewareDescriptor,
  options: RouteMaterializationOptions,
): (context: Context, next: Next) => Promise<Response | void> {
  return async (context, next) => {
    const state = getRequestState(context);
    const startedAt = Date.now();
    try {
      const result = await descriptor.handler(
        context,
        next,
        await middlewareContext(middlewareId, state, options),
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

async function middlewareContext(
  middlewareId: string,
  state: ReturnType<typeof getRequestState>,
  options: RouteMaterializationOptions,
): Promise<MiddlewareContext> {
  const signal = state?.signal ?? new AbortController().signal;
  if (options.middlewareContext !== undefined) {
    return options.middlewareContext({
      middlewareId,
      signal,
      ...(state?.requestId === undefined ? {} : { requestId: state.requestId }),
      ...(state?.traceId === undefined ? {} : { traceId: state.traceId }),
    });
  }
  const noop = (): void => undefined;
  return {
    signal,
    env: Object.freeze({}),
    log: Object.freeze({ trace: noop, debug: noop, info: noop, warn: noop, error: noop }),
    time: Object.freeze({
      now: () => new Date(),
      sleep: (milliseconds: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
    }),
  };
}

function isMiddleware(value: unknown): value is MiddlewareDescriptor {
  return isRecord(value) && typeof value.path === "string" && typeof value.handler === "function";
}
