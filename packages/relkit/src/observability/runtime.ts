import { Effect } from "effect";
import { makeObservabilityRuntimeEffect, type RuntimeOperationError } from "./runtime-effect.js";
import type { ObservabilityRuntimeOptions } from "./runtime.types.js";
export type { ObservabilityRuntimeOptions, TelemetryPipelineCounters } from "./runtime.types.js";
export {
  RuntimeOperationError,
  ObservabilityRuntimeService,
  makeObservabilityRuntimeEffect,
  observabilityRuntimeLayer,
} from "./runtime-effect.js";
export type { ObservabilityRuntimeEffects } from "./runtime-effect.types.js";
function legacy(error: RuntimeOperationError): Error {
  return error.cause instanceof Error ? error.cause : new Error(error.message);
}
/**
 * Creates the local or remote observability runtime with owned resources.
 * The caller owns close; Effect callers can use the scoped Layer.
 * @param options - Retention, export, storage, and remote endpoint settings.
 * @returns A Promise with the runtime handle.
 * @throws {Error} If storage acquisition or configuration fails.
 * @example
 * const runtime = await createObservabilityRuntime({ root });
 * await runtime.close();
 */
export async function createObservabilityRuntime(options: ObservabilityRuntimeOptions = {}) {
  return Effect.runPromise(makeObservabilityRuntimeEffect(options).pipe(Effect.mapError(legacy)));
}
