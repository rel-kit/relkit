import type { CacheRefAny } from "@relkit/functions";
import type {
  HttpConstantMapping,
  HttpCookieMapping,
  HttpHeaderMapping,
  HttpPathMapping,
  HttpQueryMapping,
} from "./http-dsl.types.js";

/** Scalar request source used for rate-limit keys.
 * @example const key: HttpRateLimitKey = http.header("x-api-key");
 */
export type HttpRateLimitKey =
  HttpPathMapping | HttpQueryMapping | HttpHeaderMapping | HttpCookieMapping | HttpConstantMapping;

/** Immutable per-route rate-limit policy.
 * @example const policy: RouteRateLimit = { limit: 10, windowMs: 60_000, key: http.header("x-api-key") };
 */
export interface RouteRateLimit {
  readonly limit: number;
  readonly windowMs: number;
  readonly key: HttpRateLimitKey;
  readonly store?: CacheRefAny;
}
