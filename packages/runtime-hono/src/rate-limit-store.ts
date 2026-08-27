import type { MaybePromise } from "@relkit/contracts";
import type { ClientRateLimitInfo, Store } from "hono-rate-limiter";

export interface RateLimitCounter {
  readonly get: (key: string) => MaybePromise<unknown | undefined>;
  readonly increment: (
    key: string,
    delta: number,
    options?: { readonly ttlMs?: number },
  ) => MaybePromise<unknown>;
  readonly delete: (key: string) => MaybePromise<void>;
}

export type RateLimitStoreResolver = (storeId: string) => MaybePromise<RateLimitCounter>;

export class RateLimitStoreError extends Error {
  readonly code = "RELKIT_RATE_LIMIT_STORE_UNAVAILABLE" as const;

  constructor(message: string) {
    super(message);
    this.name = "RateLimitStoreError";
  }
}

/** Adapts a numeric RELKIT cache provider to hono-rate-limiter's fixed-window store contract. */
export function createRateLimitStore(
  routeId: string,
  storeId: string,
  windowMs: number,
  resolve: RateLimitStoreResolver,
  now: () => number = Date.now,
): Store {
  let pending: Promise<RateLimitCounter> | undefined;
  const counter = async (): Promise<RateLimitCounter> => {
    pending ??= Promise.resolve(resolve(storeId)).then(assertCounter);
    return pending;
  };
  const location = async (key: string): Promise<WindowLocation> => {
    const current = now();
    const resetAt = (Math.floor(current / windowMs) + 1) * windowMs;
    const digest = await sha256(key);
    return {
      key: `relkit:rate-limit:${routeId}:${Math.floor(current / windowMs)}:${digest}`,
      resetAt,
      ttlMs: Math.max(1, resetAt - current),
    };
  };
  const read = async (key: string): Promise<ClientRateLimitInfo | undefined> => {
    const target = await location(key);
    const value = await (await counter()).get(target.key);
    if (value === undefined) return undefined;
    return { totalHits: numeric(value), resetTime: new Date(target.resetAt) };
  };

  return {
    localKeys: false,
    prefix: `relkit:rate-limit:${routeId}:`,
    get: read,
    increment: async (key) => {
      const target = await location(key);
      const value = await (
        await counter()
      ).increment(target.key, 1, {
        ttlMs: target.ttlMs,
      });
      return { totalHits: numeric(value), resetTime: new Date(target.resetAt) };
    },
    decrement: async (key) => {
      // ponytail: skip modes are disabled; add provider-side conditional decrement if enabled later.
      const current = await read(key);
      if (current === undefined || current.totalHits <= 0) return;
      const target = await location(key);
      await (await counter()).increment(target.key, -1, { ttlMs: target.ttlMs });
    },
    resetKey: async (key) => {
      const target = await location(key);
      await (await counter()).delete(target.key);
    },
  };
}

interface WindowLocation {
  readonly key: string;
  readonly resetAt: number;
  readonly ttlMs: number;
}

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

function numeric(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RateLimitStoreError("Rate-limit cache provider returned an invalid counter.");
  }
  return value;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
