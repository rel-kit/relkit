import { publicTrace } from "@relkit/invocation";
import type { MiddlewareContext, MiddlewareDescriptor } from "@relkit/routes";
import { createPublicClockEffect } from "@relkit/runtime-effect";
import type { Context, Next } from "hono";
import { runHttp } from "./http-effect.js";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import { getRequestState } from "./middleware.js";

/** Runs declared middleware within an attributed public trace span.
 * @param descriptor - Resolved runtime declaration and its application callbacks.
 * @param middlewareId - Stable registered middleware identifier used for attribution.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param next - Next middleware callback; its result and onion ordering are preserved.
 * @param middlewareContext - Trusted dependencies provided to the declared middleware.
 * @returns A Promise for the declared middleware result within its attributed trace span.
 */
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

/** Builds trusted middleware dependencies with the inherited Effect clock.
 * @param middlewareId - Stable registered middleware identifier used for attribution.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param options - Application dependencies and configuration for this domain.
 * @returns A configured or default middleware context with inherited cancellation and clock.
 */
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
  /** Discard log calls when no custom RPC middleware context supplied a logger.
   * @returns Nothing; the default middleware context has no logging sink.
   */
  const noop = (): void => undefined;
  return {
    signal: context.req.raw.signal,
    env: {},
    auth: options.auth?.contextFor(context.req.raw) ?? { getSession: () => Promise.resolve(null) },
    log: { trace: noop, debug: noop, info: noop, warn: noop, error: noop },
    trace: publicTrace,
    time: await runHttp(
      createPublicClockEffect(
        { run: (effect, settings) => runHttp(effect, settings?.signal) },
        state?.signal ?? context.req.raw.signal,
      ),
    ),
  };
}
