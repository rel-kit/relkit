import { Context, Effect, Layer } from "effect";
import type { ClientRateLimitInfo, Store } from "hono-rate-limiter";
import { httpBoundary, HttpBoundaryError, observeHttp, runHttp } from "./http-effect.js";
import type { RateLimitCounter, RateLimitStoreResolver } from "./rate-limit-store.types.js";
export type { RateLimitCounter, RateLimitStoreResolver } from "./rate-limit-store.types.js";

export class RateLimitStoreError extends Error {
  readonly code = "RELKIT_RATE_LIMIT_STORE_UNAVAILABLE" as const;

  constructor(message: string) {
    super(message);
    this.name = "RateLimitStoreError";
  }
}

/** Adapts a numeric RELKIT cache provider to hono-rate-limiter's fixed-window store contract.
 * @param routeId - Stable route identifier included in the counter namespace.
 * @param storeId - Declared provider binding supplying the counter store.
 * @param windowMs - Positive fixed-window duration in milliseconds.
 * @param resolve - Lazy callback resolving the configured counter provider.
 * @param now - Clock callback used to locate the fixed counter window.
 * @returns A native fixed-window store backed by the configured atomic counter provider.
 */
export function createRateLimitStore(
  routeId: string,
  storeId: string,
  windowMs: number,
  resolve: RateLimitStoreResolver,
  now: () => number = Date.now,
): Store {
  const service = Effect.runSync(makeRateLimitWindow(routeId, storeId, windowMs, resolve, now));
  /** Run a native limiter call against this store's shared fixed-window service.
   * @typeParam A - Result expected by the limiter operation.
   * @param operation - Window operation selected by the native limiter adapter.
   * @returns A Promise preserving the counter result or public store error.
   */
  const execute = <A>(
    operation: (window: RateLimitWindow["Service"]) => Effect.Effect<A, HttpBoundaryError>,
  ) =>
    runHttp(
      Effect.flatMap(RateLimitWindow, operation).pipe(
        Effect.provide(Layer.succeed(RateLimitWindow, service)),
      ),
    );
  return {
    localKeys: false,
    prefix: `relkit:rate-limit:${routeId}:`,
    get: (key) => execute((window) => window.get(key)),
    increment: (key) => execute((window) => window.increment(key)),
    decrement: (key) => execute((window) => window.decrement(key)),
    resetKey: (key) => execute((window) => window.reset(key)),
  };
}

/** Rejects provider values that cannot implement atomic counter operations.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns The same provider after its required counter methods have been verified.
 */
function assertCounter(value: RateLimitCounter): RateLimitCounter {
  if (
    value === null ||
    typeof value !== "object" ||
    typeof value.get !== "function" ||
    typeof value.increment !== "function" ||
    typeof value.delete !== "function"
  ) {
    throw new RateLimitStoreError(
      "Rate-limit cache provider must support get, increment, and delete.",
    );
  }
  return value;
}

/** Validates a provider counter result without coercing arbitrary values.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns The validated nonnegative safe integer; malformed counters throw RateLimitStoreError.
 */
function numeric(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RateLimitStoreError("Rate-limit cache provider returned an invalid counter.");
  }
  return value;
}

/** Hashes a request key before it is persisted in a rate-limit counter name.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns A Promise for the lowercase hexadecimal SHA-256 digest of the request key.
 */
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Numeric fixed-window operations sharing one lazily resolved provider. */
export class RateLimitWindow extends Context.Service<
  RateLimitWindow,
  {
    readonly get: (
      key: string,
    ) => Effect.Effect<ClientRateLimitInfo | undefined, HttpBoundaryError>;
    readonly increment: (key: string) => Effect.Effect<ClientRateLimitInfo, HttpBoundaryError>;
    readonly decrement: (key: string) => Effect.Effect<void, HttpBoundaryError>;
    readonly reset: (key: string) => Effect.Effect<void, HttpBoundaryError>;
  }
>()("@relkit/runtime-hono/RateLimitWindow") {}

/** Allocates shared cache state without resolving the provider until the first operation.
 * @param routeId - Stable route identifier included in the counter namespace.
 * @param storeId - Declared provider binding supplying the counter store.
 * @param windowMs - Positive fixed-window duration in milliseconds.
 * @param resolve - Lazy callback resolving the configured counter provider.
 * @param now - Clock callback used to locate the fixed counter window.
 * @returns A lazy effect constructing operations that share one cached provider resolution.
 * @see tests/request-services.test.ts for checked provider sharing and fixed-window TTL.
 */
export function makeRateLimitWindow(
  routeId: string,
  storeId: string,
  windowMs: number,
  resolve: RateLimitStoreResolver,
  now: () => number,
) {
  return Effect.gen(function* () {
    const counter = yield* Effect.cached(
      httpBoundary("rateLimit.resolve", async () => assertCounter(await resolve(storeId))),
    );
    /** Locate the active fixed window without persisting the raw request key.
     * @param key - Request-derived limiter key to hash into the counter namespace.
     * @returns The hashed provider key, reset timestamp and remaining positive TTL.
     */
    const location = Effect.fn("RateLimitWindow.location")(function* (key: string) {
      const current = now();
      const resetAt = (Math.floor(current / windowMs) + 1) * windowMs;
      const digest = yield* httpBoundary("rateLimit.digest", () => sha256(key));
      return {
        key: `relkit:rate-limit:${routeId}:${Math.floor(current / windowMs)}:${digest}`,
        resetAt,
        ttlMs: Math.max(1, resetAt - current),
      };
    });
    /** Read and validate the current window's provider counter.
     * @param key - Request-derived limiter key selecting this fixed window.
     * @returns Current hit count/reset time, or undefined when no counter exists.
     */
    const read = Effect.fn("RateLimitWindow.get")(function* (key: string) {
      const target = yield* location(key);
      const provider = yield* counter;
      const value = yield* httpBoundary("rateLimit.get", async () => provider.get(target.key));
      if (value === undefined) return undefined;
      return { totalHits: yield* checkedCount(value), resetTime: new Date(target.resetAt) };
    });
    return RateLimitWindow.of({
      get: (key) => observeHttp("rateLimit.get", read(key)),
      increment: Effect.fn("RateLimitWindow.increment")((key: string) =>
        observeHttp(
          "rateLimit.increment",
          Effect.gen(function* () {
            const target = yield* location(key);
            const provider = yield* counter;
            const value = yield* httpBoundary("rateLimit.increment", async () =>
              provider.increment(target.key, 1, { ttlMs: target.ttlMs }),
            );
            return { totalHits: yield* checkedCount(value), resetTime: new Date(target.resetAt) };
          }),
        ),
      ),
      decrement: Effect.fn("RateLimitWindow.decrement")((key: string) =>
        observeHttp(
          "rateLimit.decrement",
          Effect.gen(function* () {
            const current = yield* read(key);
            if (current === undefined || current.totalHits <= 0) return;
            const target = yield* location(key);
            const provider = yield* counter;
            yield* httpBoundary("rateLimit.decrement", async () =>
              provider.increment(target.key, -1, { ttlMs: target.ttlMs }),
            );
          }),
        ),
      ),
      reset: Effect.fn("RateLimitWindow.reset")((key: string) =>
        observeHttp(
          "rateLimit.reset",
          Effect.gen(function* () {
            const target = yield* location(key);
            const provider = yield* counter;
            yield* httpBoundary("rateLimit.delete", async () => provider.delete(target.key));
          }),
        ),
      ),
    });
  });
}

/** Checks a foreign provider value while preserving the public store error type.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns An effect yielding the validated count or wrapping the public store error at the HTTP boundary.
 */
function checkedCount(value: unknown) {
  return Effect.try({
    try: () => numeric(value),
    catch: (cause) => new HttpBoundaryError({ operation: "rateLimit.counter", cause }),
  });
}
