/**
 * Defines a compiler/storage-independent loopback ingress authority.
 * The acquiring domain owns the returned close receipt; substitutable listeners
 * allow support readiness and cancellation tests without opening native ports.
 */
import type { Effect } from "effect";
import type { CliAdapterError } from "../cli-errors.js";

/** One listener's actual URL and joined physical close operation. */
export interface TelemetryListener {
  readonly url: string;
  readonly stop: Effect.Effect<void, CliAdapterError>;
}

/** Bounded loopback ingress; authentication belongs to the consuming domain. */
export interface TelemetryListenerOperations {
  readonly listen: (
    handler: (request: Request) => Promise<Response>,
  ) => Effect.Effect<TelemetryListener, CliAdapterError>;
}
