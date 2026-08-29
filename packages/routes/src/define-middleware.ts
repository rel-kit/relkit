import type { Context, Next } from "hono";
import {
  createDescriptorBase,
  deepFreeze,
  isDescriptor,
  type DescriptorBase,
  type MaybePromise,
} from "@relkit/contracts";
import { createUnboundIdentity, type PublicClock, type PublicLogger } from "@relkit/invocation";
import type { AuthContext, ResolvedApplicationEnv } from "@relkit/functions";

export interface MiddlewareContext {
  readonly signal: AbortSignal;
  readonly env: ResolvedApplicationEnv;
  readonly auth: AuthContext;
  readonly log: PublicLogger;
  readonly time: PublicClock;
}

export type MiddlewareHandler = (
  context: Context,
  next: Next,
  relkit: MiddlewareContext,
) => MaybePromise<Response | void>;

export interface MiddlewareDescriptor<Id extends string = string> extends DescriptorBase<
  "middleware",
  Id
> {
  readonly path: string;
  readonly handler: MiddlewareHandler;
}

/**
 * Defines one automatically discovered path-scoped HTTP middleware handler.
 *
 * @example
 * ```ts
 * import { defineMiddleware } from "@relkit/app/routes"
 *
 * export default defineMiddleware("/orders/*", async (context, next) => {
 *   if (context.req.header("authorization") === undefined) {
 *     return context.json({ error: "unauthorized" }, 401)
 *   }
 *   await next()
 * })
 * ```
 * @category Routes
 * @since 0.1.0
 */
export function defineMiddleware(
  path: string,
  handler: MiddlewareHandler,
): MiddlewareDescriptor<string> {
  const normalizedPath = middlewarePath(path);
  if (typeof handler !== "function") throw new TypeError("Middleware handler must be a function");
  const id = createUnboundIdentity();
  return deepFreeze({
    ...createDescriptorBase("middleware", id),
    path: normalizedPath,
    handler,
  });
}

export function isMiddlewareDescriptor(value: unknown): value is MiddlewareDescriptor {
  const candidate = value as Partial<MiddlewareDescriptor>;
  return (
    isDescriptor(value, "middleware") &&
    typeof candidate.path === "string" &&
    isMiddlewarePath(candidate.path) &&
    typeof candidate.handler === "function"
  );
}

export function isMiddlewarePath(value: unknown): value is string {
  if (value === "*") return true;
  if (typeof value !== "string" || !value.startsWith("/")) return false;
  if (value === "/") return true;
  const segments = value.slice(1).split("/");
  if (segments.some((segment) => segment === "")) return false;
  return segments.every((segment, index) => {
    if (segment === "*") return index === segments.length - 1;
    if (/^:[A-Za-z_][A-Za-z0-9_]*$/.test(segment)) return true;
    return !/[*:?{}]/.test(segment);
  });
}

function middlewarePath(value: unknown): string {
  if (!isMiddlewarePath(value)) {
    throw new TypeError(
      'Middleware path must be "*" or an absolute path containing static segments, :params, and an optional trailing *',
    );
  }
  return value;
}
