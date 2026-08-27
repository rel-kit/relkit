import { deepFreeze, isRef } from "@relkit/contracts";
import type { CacheRefAny } from "@relkit/functions";
import { getJsonSchema } from "@relkit/schema";
import type {
  HttpConstantMapping,
  HttpCookieMapping,
  HttpHeaderMapping,
  HttpPathMapping,
  HttpQueryMapping,
} from "./http-dsl-types.js";

export type HttpRateLimitKey =
  HttpPathMapping | HttpQueryMapping | HttpHeaderMapping | HttpCookieMapping | HttpConstantMapping;

export interface RouteRateLimit {
  readonly limit: number;
  readonly windowMs: number;
  readonly key: HttpRateLimitKey;
  readonly store?: CacheRefAny;
}

export function copyRateLimit(value: RouteRateLimit | undefined): RouteRateLimit | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new TypeError("Route rateLimit must be an object");
  positive(value.limit, "rateLimit.limit");
  positive(value.windowMs, "rateLimit.windowMs");
  if (!isRateLimitKey(value.key)) {
    throw new TypeError("Route rateLimit.key must be a scalar request source");
  }
  if (value.store !== undefined && !isNumericCacheRef(value.store)) {
    throw new TypeError("Route rateLimit.store must be a cache reference with numeric values");
  }
  return deepFreeze({
    limit: value.limit,
    windowMs: value.windowMs,
    key: value.key,
    ...(value.store === undefined ? {} : { store: value.store }),
  });
}

export function positive(value: number | undefined, name: string): number | undefined {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

export function successStatus(value: number | undefined): number | undefined {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 200 || value > 299)) {
    throw new TypeError("successStatus must be an integer from 200 through 299");
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
