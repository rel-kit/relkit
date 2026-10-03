import type { Context } from "hono";
import type { RateLimitStoreResolver } from "./rate-limit-store.js";

/** rate limit runtime options configuring dependencies, callbacks and runtime policy. */
export interface RateLimitRuntimeOptions {
  readonly resolveStore?: RateLimitStoreResolver;
}

/** Contract for route handler used by rate limit. */
export type RouteHandler = (context: Context) => Promise<Response>;
