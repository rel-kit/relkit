import { publicTrace } from "@relkit/invocation";
import type { MiddlewareContext, MiddlewareDescriptor } from "@relkit/routes";
import type { Context, Next } from "hono";
import { getRequestState } from "./middleware.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";

export function runRpcMiddleware(
  descriptor: MiddlewareDescriptor,
  middlewareId: string,
  context: Context,
  next: Next,
  middlewareContext: MiddlewareContext | Promise<MiddlewareContext>,
): Promise<unknown> {
  return publicTrace.span(`relkit.middleware.${middlewareId}`, async () =>
    descriptor.handler(context, next, await middlewareContext),
  );
}

export async function createRpcMiddlewareContext(
  middlewareId: string,
  context: Context,
  options: RouteMaterializationOptions,
): Promise<MiddlewareContext> {
  const state = getRequestState(context);
  if (options.middlewareContext !== undefined) {
    return options.middlewareContext({
      middlewareId,
      signal: state?.signal ?? context.req.raw.signal,
      request: context.req.raw,
      ...(options.auth === undefined ? {} : { auth: options.auth.contextFor(context.req.raw) }),
      ...(state?.requestId === undefined ? {} : { requestId: state.requestId }),
      ...(state?.traceId === undefined ? {} : { traceId: state.traceId }),
    });
  }
  const noop = (): void => undefined;
  return {
    signal: context.req.raw.signal,
    env: {},
    auth: options.auth?.contextFor(context.req.raw) ?? { getSession: () => Promise.resolve(null) },
    log: { trace: noop, debug: noop, info: noop, warn: noop, error: noop },
    trace: publicTrace,
    time: {
      now: () => new Date(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    },
  };
}
