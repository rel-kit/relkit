/**
 * Defines the checked transport-loader seam and Bun Fetch facade. Applications
 * borrow request/server context per call; one generation owns module loading and
 * closes it before retiring its immutable execution capsule.
 */
import type { Effect } from "effect";
import type { Hono } from "hono";
import type { BunWebSocketData } from "hono/bun";
import type { Server } from "bun";
import type { CreateAppOptions } from "./create-app.types.js";
import type { HttpBoundaryError } from "./http-effect.js";

/**
 * Installs optional generation endpoints before the deferred app handles requests.
 * @param app - Complete application owned by the same generation as the eager shell.
 * @returns Physical initialization settlement, joined before retirement.
 */
export type PreparedAppInitializer = (app: Hono) => Promise<void>;

/** Injectable physical transport initialization; it never captures a request. */
export interface PreparedTransportLoaderOperations {
  readonly load: (options: CreateAppOptions) => Effect.Effect<Hono, HttpBoundaryError>;
}

/** A generation owns one eager REST application and one deferred rich initialization. */
export interface PreparedTransportOperations {
  readonly app: Hono;
  readonly load: () => Effect.Effect<Hono, HttpBoundaryError>;
}

/** Native Bun boundary; release physically joins outstanding module evaluation. */
export interface PreparedHttpApplication {
  readonly app: Hono;
  readonly fetch: (
    request: Request,
    server?: Server<BunWebSocketData>,
  ) => Response | Promise<Response>;
  readonly close: () => Promise<void>;
}
