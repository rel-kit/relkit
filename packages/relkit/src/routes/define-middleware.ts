import { createDescriptorBase, deepFreeze, isDescriptor } from "../contracts/index.js";
import { Effect } from "effect";
import type { StandardSchemaV1 } from "../schema/index.js";
import type {
  MiddlewareDescriptor,
  MiddlewareHandler,
  MiddlewareServices,
  ProvidedData,
  TypedMiddlewareOptions,
} from "./define-middleware.types.js";
import {
  RouteInputError,
  RouteOperationError,
  measureRoute,
  routeAttempt,
  routeIdentity,
  routeTry,
  runRouteSync,
} from "./route-observability.js";

export type {
  MiddlewareContext,
  MiddlewareDescriptor,
  MiddlewareHandler,
  MiddlewareServices,
  ProvidedData,
  TypedMiddlewareOptions,
} from "./define-middleware.types.js";

/** Defines path-scoped middleware through a typed Effect.
 * @param path - Absolute pattern or wildcard.
 * @param handler - Middleware callback.
 * @returns Frozen descriptor or tagged invalid-input failure.
 * @example Effect.runSync(defineMiddlewareEffect("/orders/*", handler));
 */
export const defineMiddlewareEffect = Effect.fn("routes.middleware.define")(
  (
    path: string,
    definition: MiddlewareHandler | TypedMiddlewareOptions<StandardSchemaV1>,
  ): Effect.Effect<MiddlewareDescriptor<string, any>, RouteOperationError> =>
    measureRoute(
      "middleware.define",
      Effect.gen(function* () {
        const typed = typeof definition === "function" ? undefined : definition;
        const handler = (
          typed === undefined ? definition : typed.handler
        ) as MiddlewareHandler<any>;
        const normalizedPath = yield* routeAttempt("middleware.define", () => {
          if (typeof handler !== "function")
            throw new RouteInputError("Middleware handler must be a function");
          if (typed !== undefined && !isSchema(typed.provides))
            throw new RouteInputError("Middleware provides must be a Standard Schema");
          return middlewarePath(path);
        });
        const id = yield* routeIdentity("middleware.define");
        return yield* routeAttempt("middleware.define", () =>
          deepFreeze({
            ...createDescriptorBase("middleware", id),
            path: normalizedPath,
            handler,
            ...(typed === undefined ? {} : { provides: typed.provides }),
          }),
        );
      }),
    ),
);

/**
 * Defines one automatically discovered path-scoped HTTP middleware handler.
 *
 * @example
 * ```ts
 * import { defineMiddleware } from "relkit/routes"
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
 * @param path - Absolute pattern or wildcard.
 * @param handler - Middleware callback.
 * @returns Frozen descriptor.
 * @throws TypeError for an invalid path or handler.
 */
export function defineMiddleware(
  path: string,
  handler: MiddlewareHandler,
): MiddlewareDescriptor<string>;
/** Defines typed middleware that provides validated data to routes through `http.from`.
 * @param path - Absolute pattern or wildcard.
 * @param options - `provides` schema and the handler that calls `relkit.provide(data)`.
 * @returns Frozen descriptor carrying the provided data type.
 * @throws TypeError for an invalid path, handler or schema.
 * @example defineMiddleware("/orders/*", { provides: z.object({ tenantId: z.string() }), handler });
 */
export function defineMiddleware<const Schema extends StandardSchemaV1>(
  path: string,
  options: TypedMiddlewareOptions<Schema>,
): MiddlewareDescriptor<string, ProvidedData<Schema>>;
export function defineMiddleware(
  path: string,
  definition: MiddlewareHandler | TypedMiddlewareOptions<StandardSchemaV1>,
): MiddlewareDescriptor<string, any> {
  return runRouteSync(defineMiddlewareEffect(path, definition));
}

function isSchema(value: unknown): value is StandardSchemaV1 {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    "~standard" in value
  );
}

/** Checks a middleware descriptor through Effect.
 * @param value - Candidate descriptor.
 * @returns Whether the candidate has a valid middleware shape.
 * @example Effect.runSync(isMiddlewareDescriptorEffect(value));
 */
export const isMiddlewareDescriptorEffect = Effect.fn("routes.middleware.is-descriptor")(
  (value: unknown) =>
    routeTry("middleware.is-descriptor", () => isMiddlewareDescriptorValue(value)),
);

/** Checks a middleware descriptor synchronously.
 * @param value - Candidate descriptor.
 * @returns Whether the candidate has a valid middleware shape.
 * @example isMiddlewareDescriptor(value);
 */
export function isMiddlewareDescriptor(value: unknown): value is MiddlewareDescriptor {
  return runRouteSync(isMiddlewareDescriptorEffect(value));
}

function isMiddlewareDescriptorValue(value: unknown): value is MiddlewareDescriptor {
  const candidate = value as Partial<MiddlewareDescriptor>;
  return (
    isDescriptor(value, "middleware") &&
    typeof candidate.path === "string" &&
    isMiddlewarePathValue(candidate.path) &&
    typeof candidate.handler === "function"
  );
}

/** Checks an HTTP middleware path through Effect.
 * @param value - Candidate path.
 * @returns Whether the path follows the middleware pattern syntax.
 * @example Effect.runSync(isMiddlewarePathEffect("/orders/*"));
 */
export const isMiddlewarePathEffect = Effect.fn("routes.middleware.is-path")((value: unknown) =>
  routeTry("middleware.is-path", () => isMiddlewarePathValue(value)),
);

/** Checks a middleware path synchronously.
 * @param value - Candidate path.
 * @returns Whether the path follows the middleware pattern syntax.
 * @example isMiddlewarePath("/orders/*");
 */
export function isMiddlewarePath(value: unknown): value is string {
  return runRouteSync(isMiddlewarePathEffect(value));
}

function isMiddlewarePathValue(value: unknown): value is string {
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
  if (!isMiddlewarePathValue(value)) {
    throw new RouteInputError(
      'Middleware path must be "*" or an absolute path containing static segments, :params, and an optional trailing *',
    );
  }
  return value;
}
