import type { CacheRefAny } from "../functions/index.js";
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
  /** Requests allowed per key in one window. */
  readonly limit: number;
  /** Length of the window in milliseconds. */
  readonly windowMs: number;
  /** Request value that separates callers, such as `http.header("x-api-key")`. */
  readonly key: HttpRateLimitKey;
  /** Cache that holds the counters; process memory when omitted. Production needs one. */
  readonly store?: CacheRefAny;
}
