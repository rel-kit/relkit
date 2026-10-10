/**
 * Defines delayed persistent acquisition behind the same deterministic test seam.
 * Configuration and failure callbacks belong to each session; required Scope
 * remains a run requirement so storage cannot outlive its caller's lifetime.
 */
import type { Effect, Scope } from "effect";
import type { TelemetryConfiguration } from "@relkit/observability";
import type { CliAdapterError } from "../cli-errors.js";
import type { DevTelemetryEffects } from "./dev-telemetry.types.js";

/** Persistent acquisition can be delayed or failed without blocking backend ingress. */
export interface TelemetryStorageOperations {
  readonly acquire: (
    root: string,
    configuration: TelemetryConfiguration,
    onFailure: (error: Error) => void,
  ) => Effect.Effect<DevTelemetryEffects, CliAdapterError, Scope.Scope>;
}
