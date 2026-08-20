import type { HttpTriggerRegistration } from "@zsys/graph";
import type { Context } from "hono";
import { rateLimiter, type RateLimitInfo } from "hono-rate-limiter";
import type { RouteMaterializationOptions } from "./materialize-routes.js";
import { getRequestState } from "./middleware.js";
import { createRateLimitStore, type RateLimitStoreResolver } from "./rate-limit-store.js";
import { emitRateLimitSpan, recordRateLimitResult } from "./rate-limit-telemetry.js";

export const ROUTE_MIDDLEWARE_ORDER = Object.freeze([
  "rate-limit",
  "declared-middleware",
  "request-mapping",
  "target",
] as const);

export interface RateLimitRuntimeOptions {
  readonly resolveStore?: RateLimitStoreResolver;
}

type RouteHandler = (context: Context) => Promise<Response>;
const INFO_KEY = "zsys.rateLimit";

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
    const spanId = `rate-limit:${crypto.randomUUID()}`;
    let continued = false;
    emitRateLimitSpan(options, trigger, state, spanId, startedAt, "started", false);
    try {
      const result = await middleware(context, async () => {
        continued = true;
        context.res = await handler(context);
      });
      const response = result instanceof Response ? result : context.res;
      const blocked = !continued && response.status === 429;
      const finalResponse = withStandardHeaders(response, policy, rateInfo(context), blocked);
      context.res = finalResponse;
      recordRateLimitResult(trigger, state, startedAt, finalResponse.status, blocked, continued);
      emitRateLimitSpan(
        options,
        trigger,
        state,
        spanId,
        startedAt,
        "completed",
        blocked,
        rateInfo(context),
      );
      return finalResponse;
    } catch (cause) {
      emitRateLimitSpan(
        options,
        trigger,
        state,
        spanId,
        startedAt,
        "completed",
        false,
        undefined,
        "defect",
      );
      throw cause;
    }
  };
}

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

function requestKey(context: Context, source: unknown): string {
  const value = sourceValue(context, source);
  return JSON.stringify([projection(source, "kind"), projection(source, "name"), value]);
}

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

function projection(value: unknown, key: string): unknown {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function rateInfo(context: Context): RateLimitInfo | undefined {
  const value = (context.var as Record<string, unknown>)[INFO_KEY];
  return value !== null && typeof value === "object" ? (value as RateLimitInfo) : undefined;
}
