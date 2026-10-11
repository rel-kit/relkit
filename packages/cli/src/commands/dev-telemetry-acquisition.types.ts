/** Precise acquired canonical resources remain private to their single telemetry lifetime. */
import type { Effect } from "effect";
import type { telemetryLifetimeEffect } from "./dev-telemetry-lifetime.js";
import type { acquireTelemetryCore } from "./dev-telemetry-core.js";

/** Existing child Scope and idempotent release registration authority. */
export type TelemetryLifetime = Effect.Success<ReturnType<typeof telemetryLifetimeEffect>>;
/** Already acquired worker, state, router and callbacks; never undecoded transport data. */
export type TelemetryCore = Effect.Success<ReturnType<typeof acquireTelemetryCore>>;
