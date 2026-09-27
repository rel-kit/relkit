import { deepFreeze, isRef } from "@relkit/contracts";
import type { CacheRefAny } from "@relkit/functions";
import { getJsonSchema } from "@relkit/schema";
import { Effect } from "effect";
import type { HttpRateLimitKey, RouteRateLimit } from "./route-options.types.js";
import { RouteInputError, routeTry, runRouteSync } from "./route-observability.js";

export type { HttpRateLimitKey, RouteRateLimit } from "./route-options.types.js";

/** Copies a rate-limit policy through Effect.
 * @param value - Optional rate-limit policy.
 * @returns Frozen policy or tagged invalid-input failure.
 * @example Effect.runSync(copyRateLimitEffect(undefined));
 */
export const copyRateLimitEffect = Effect.fn("routes.options.copy-rate-limit")(
  (value: RouteRateLimit | undefined) =>
    routeTry("options.copy-rate-limit", () => copyRateLimitValue(value)),
);

/** Copies a route rate-limit policy synchronously.
 * @param value - Optional rate-limit policy.
 * @returns Frozen policy when supplied.
 * @throws TypeError for invalid policy fields.
 * @example copyRateLimit(undefined);
 */
export function copyRateLimit(value: RouteRateLimit | undefined): RouteRateLimit | undefined {
  return runRouteSync(copyRateLimitEffect(value));
}

/** Copies a rate limit inside an already observed operation.
 * @param value - Optional rate limit.
 * @returns A frozen policy or undefined.
 * @throws RouteInputError for invalid policy fields.
 * @example copyRateLimitValue(undefined);
 */
export function copyRateLimitValue(value: RouteRateLimit | undefined): RouteRateLimit | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new RouteInputError("Route rateLimit must be an object");
  positiveValue(value.limit, "rateLimit.limit");
  positiveValue(value.windowMs, "rateLimit.windowMs");
  if (!isRateLimitKey(value.key)) {
    throw new RouteInputError("Route rateLimit.key must be a scalar request source");
  }
  if (value.store !== undefined && !isNumericCacheRef(value.store)) {
    throw new RouteInputError(
      "Route rateLimit.store must be a cache reference with numeric values",
    );
  }
  return deepFreeze({
    limit: value.limit,
    windowMs: value.windowMs,
    key: value.key,
    ...(value.store === undefined ? {} : { store: value.store }),
  });
}

/** Validates an optional positive integer through Effect.
 * @param value - Optional integer.
 * @param name - Fixed field name used in an error message.
 * @returns The input or a tagged invalid-input failure.
 * @example Effect.runSync(positiveEffect(5, "timeoutMs"));
 */
export const positiveEffect = Effect.fn("routes.options.positive")(
  (value: number | undefined, name: string) =>
    routeTry("options.positive", () => positiveValue(value, name)),
);

/** Validates an optional positive integer synchronously.
 * @param value - Optional integer.
 * @param name - Fixed field name.
 * @returns The input when valid.
 * @throws TypeError for nonpositive or unsafe integers.
 * @example positive(5, "timeoutMs");
 */
export function positive(value: number | undefined, name: string): number | undefined {
  return runRouteSync(positiveEffect(value, name));
}

/** Checks an optional positive integer inside an already observed operation.
 * @param value - Candidate integer.
 * @param name - Field name for the error.
 * @returns The valid integer or undefined.
 * @throws RouteInputError for invalid integers.
 * @example positiveValue(5, "timeoutMs");
 */
export function positiveValue(value: number | undefined, name: string): number | undefined {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
    throw new RouteInputError(`${name} must be a positive integer`);
  }
  return value;
}

/** Validates a success status through Effect.
 * @param value - Optional HTTP status.
 * @returns The input or a tagged invalid-input failure.
 * @example Effect.runSync(successStatusEffect(201));
 */
export const successStatusEffect = Effect.fn("routes.options.success-status")(
  (value: number | undefined) =>
    routeTry("options.success-status", () => successStatusValue(value)),
);

/** Validates an optional HTTP success status synchronously.
 * @param value - Optional HTTP status.
 * @returns The input when valid.
 * @throws TypeError for values outside 200–299.
 * @example successStatus(201);
 */
export function successStatus(value: number | undefined): number | undefined {
  return runRouteSync(successStatusEffect(value));
}

/** Checks an optional success status inside an already observed operation.
 * @param value - Candidate HTTP status.
 * @returns A status from 200 through 299 or undefined.
 * @throws RouteInputError for invalid statuses.
 * @example successStatusValue(201);
 */
export function successStatusValue(value: number | undefined): number | undefined {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 200 || value > 299)) {
    throw new RouteInputError("successStatus must be an integer from 200 through 299");
  }
  return value;
}

function isRateLimitKey(value: unknown): value is HttpRateLimitKey {
  if (!isRecord(value)) return false;
  return ["path", "query", "header", "cookie", "constant"].includes(String(value.kind));
}

function isCacheRef(value: unknown): value is CacheRefAny {
  return isRecord(value) && isRef(value.ref, "cache");
}

function isNumericCacheRef(value: unknown): value is CacheRefAny {
  if (!isCacheRef(value)) return false;
  const projected = getJsonSchema(value.value);
  return projected.ok && ["integer", "number"].includes(String(projected.schema.type));
}

function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
