import type { HttpTriggerRegistration } from "@relkit/graph";
import { frameworkTrace } from "@relkit/invocation";
import type { Context } from "hono";
import { rateLimiter, type RateLimitInfo } from "hono-rate-limiter";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import { getRequestState } from "./middleware.js";
import { createRateLimitStore, type RateLimitStoreResolver } from "./rate-limit-store.js";
import { recordRateLimitResult } from "./rate-limit-telemetry.js";
import type { RouteHandler } from "./rate-limit.types.js";
export type { RateLimitRuntimeOptions } from "./rate-limit.types.js";

export const ROUTE_MIDDLEWARE_ORDER = Object.freeze([
  "rate-limit",
  "declared-middleware",
  "request-mapping",
  "target",
] as const);
const INFO_KEY = "relkit.rateLimit";

/** Applies the declared fixed-window policy before invoking a route handler.
 * @param trigger - Registered route declaration with its target and transport contract.
 * @param options - Application dependencies and configuration for this domain.
 * @param handler - Native handler executed within the configured boundary.
 * @returns The original handler without a policy, or a handler enforcing the declared limit.
 */
export function withRateLimit(
  trigger: HttpTriggerRegistration,
  options: RouteMaterializationOptions,
  handler: RouteHandler,
): RouteHandler {
  const policy = trigger.config.rateLimit;
  if (policy === undefined || policy === null) return handler;
  const store =
    policy.storeId === undefined
      ? undefined
      : createRateLimitStore(
          trigger.id,
          policy.storeId,
          policy.windowMs,
          requiredResolver(options, policy.storeId),
        );
  const middleware = rateLimiter({
    limit: policy.limit,
    windowMs: policy.windowMs,
    standardHeaders: "draft-6",
    requestPropertyName: INFO_KEY,
    keyGenerator: (context) => requestKey(context, policy.key),
    ...(store === undefined ? {} : { store }),
    handler: (context) => {
      const info = rateInfo(context);
      const retryAfterMs = Math.max(
        0,
        info?.resetTime === undefined ? policy.windowMs : info.resetTime.getTime() - Date.now(),
      );
      return context.json({ error: "rate-limit", retryAfterMs }, 429);
    },
  });

  return async (context) => {
    const startedAt = Date.now();
    const state = getRequestState(context);
    return frameworkTrace.span(
      "relkit.http.rate_limit",
      {
        attributes: {
          "relkit.route.id": trigger.id,
          "relkit.rate_limit.limit": policy.limit,
          "relkit.rate_limit.store": policy.storeId === undefined ? "memory" : "shared",
        },
      },
      async () => {
        let continued = false;
        const result = await middleware(context, async () => {
          continued = true;
          context.res = await handler(context);
        });
        const response = result instanceof Response ? result : context.res;
        const blocked = !continued && response.status === 429;
        const info = rateInfo(context);
        const finalResponse = withStandardHeaders(response, policy, info, blocked);
        context.res = finalResponse;
        frameworkTrace.setAttributes({
          "relkit.rate_limit.remaining": info?.remaining ?? policy.limit,
          "relkit.rate_limit.blocked": blocked,
        });
        recordRateLimitResult(trigger, state, startedAt, finalResponse.status, blocked, continued);
        return finalResponse;
      },
    );
  };
}

/** Adds standard rate-limit headers while preserving the original response body.
 * @param response - Native response whose status, headers and body lifetime are preserved.
 * @param policy - Declared route rate-limit policy.
 * @param info - Limiter result used to write standard response headers.
 * @param blocked - Whether the limiter rejected the request.
 * @returns A response preserving the body and status with limit, remaining and reset headers.
 */
function withStandardHeaders(
  response: Response,
  policy: NonNullable<HttpTriggerRegistration["config"]["rateLimit"]>,
  info: RateLimitInfo | undefined,
  blocked: boolean,
): Response {
  const headers = new Headers(response.headers);
  const resetSeconds = Math.max(
    0,
    Math.ceil(
      (info?.resetTime === undefined ? policy.windowMs : info.resetTime.getTime() - Date.now()) /
        1_000,
    ),
  );
  headers.set("RateLimit-Policy", `${policy.limit};w=${Math.ceil(policy.windowMs / 1_000)}`);
  headers.set("RateLimit-Limit", String(policy.limit));
  headers.set("RateLimit-Remaining", String(info?.remaining ?? policy.limit));
  headers.set("RateLimit-Reset", String(resetSeconds));
  if (blocked) headers.set("Retry-After", String(resetSeconds));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Resolves the configured counter provider or reports a missing store.
 * @param options - Application dependencies and configuration for this domain.
 * @param storeId - Declared provider binding supplying the counter store.
 * @returns The configured store resolver, or a resolver that reports the missing binding when used.
 */
function requiredResolver(
  options: RouteMaterializationOptions,
  storeId: string,
): RateLimitStoreResolver {
  const resolver = options.rateLimitRuntime?.resolveStore;
  if (resolver !== undefined) return resolver;
  return () => {
    throw new Error(`Rate-limit store "${storeId}" is not bound to the active runtime.`);
  };
}

/** Builds the declared rate-limit identity from trusted request sources.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param source - Native iterable or declared request-key source.
 * @returns A serialized tuple of source kind, source name and the extracted request value.
 */
function requestKey(context: Context, source: unknown): string {
  const value = sourceValue(context, source);
  return JSON.stringify([projection(source, "kind"), projection(source, "name"), value]);
}

/** Reads one supported rate-limit key source from the active request.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @param source - Native iterable or declared request-key source.
 * @returns The configured constant or request value, or null when the source is unavailable.
 */
function sourceValue(context: Context, source: unknown): unknown {
  const kind = projection(source, "kind");
  const name = projection(source, "name");
  if (kind === "constant") return projection(source, "value");
  if (typeof name !== "string") return null;
  if (kind === "path") return context.req.param(name) ?? null;
  if (kind === "query") {
    const values = new URL(context.req.url).searchParams.getAll(name);
    return values.length === 0 ? null : values;
  }
  if (kind === "header") return context.req.header(name) ?? null;
  return kind === "cookie" ? cookie(context.req.header("cookie"), name) : null;
}

/** Reads a named cookie without exposing unrelated cookie values.
 * @param header - Raw header value parsed without trusting malformed input.
 * @param name - Declared field, header, stream or configuration key.
 * @returns The decoded cookie value, its raw value for malformed encoding, or null when absent.
 */
function cookie(header: string | undefined, name: string): string | null {
  const value = header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (value === undefined) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Selects the declared property from a structured rate-limit key source.
 * @param value - Value inspected, validated or projected by this operation.
 * @param key - Declared property or field key.
 * @returns The named object property, or undefined for a non-object source.
 */
function projection(value: unknown, key: string): unknown {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/** Reads the limiter result stored on the Hono request context.
 * @param context - Trusted Hono or oRPC request context containing request state and authentication.
 * @returns The limiter metadata stored on the context, or undefined before a result is available.
 */
function rateInfo(context: Context): RateLimitInfo | undefined {
  const value = (context.var as Record<string, unknown>)[INFO_KEY];
  return value !== null && typeof value === "object" ? (value as RateLimitInfo) : undefined;
}
