import type { Context, Next } from "hono";
import type { DescriptorBase, MaybePromise } from "@relkit/contracts";
import type { PublicClock, PublicLogger, PublicTrace } from "@relkit/invocation";
import type { AuthContext, ResolvedApplicationEnv } from "@relkit/functions";

/** Invocation-scoped capabilities provided to middleware.
 * @example const context: MiddlewareContext = relkit;
 */
export interface MiddlewareContext {
  readonly signal: AbortSignal;
  readonly env: ResolvedApplicationEnv;
  readonly auth: AuthContext;
  readonly log: PublicLogger;
  readonly time: PublicClock;
  readonly trace: PublicTrace;
}

/** A path-scoped HTTP middleware callback.
 * @example const handler: MiddlewareHandler = async (_context, next) => next();
 */
export type MiddlewareHandler = (
  context: Context,
  next: Next,
  relkit: MiddlewareContext,
) => MaybePromise<Response | void>;

/** Frozen descriptor for one middleware handler.
 * @example const descriptor: MiddlewareDescriptor = defineMiddleware("/orders", handler);
 */
export interface MiddlewareDescriptor<Id extends string = string> extends DescriptorBase<
  "middleware",
  Id
> {
  readonly path: string;
  readonly handler: MiddlewareHandler;
}
