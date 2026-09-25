import { Effect } from "effect";
import type { ObservabilityRuntimeOptions } from "./runtime.types.js";
import type { RemoteObservabilityOptions } from "./remote-runtime.types.js";
import {
  makeRemoteObservabilityRuntimeEffect,
  type RemoteRuntimeError,
} from "./remote-runtime-effect.js";
export type { RemoteObservabilityOptions } from "./remote-runtime.types.js";
export {
  RemoteRuntimeError,
  RemoteObservabilityRuntimeService,
  makeRemoteObservabilityRuntimeEffect,
  remoteObservabilityRuntimeLayer,
} from "./remote-runtime-effect.js";
export type { RemoteObservabilityRuntimeEffects } from "./remote-runtime-effect.types.js";
function legacy(error: RemoteRuntimeError): Error {
  return error.cause instanceof Error ? error.cause : new Error(error.message);
}
/**
 * Creates a remote runtime backed by the configured endpoint.
 * The caller owns close; Effect callers can use the scoped Layer.
 * @param options - Capture, export, and retention options.
 * @param remote - Remote endpoint and bearer token.
 * @returns A Promise with a runtime handle that owns queue and stream release.
 * @throws {Error} If configuration or remote setup fails.
 * @example
 * const runtime = await createRemoteObservabilityRuntime(options, remote);
 * await runtime.close();
 */
export function createRemoteObservabilityRuntime(
  options: ObservabilityRuntimeOptions,
  remote: RemoteObservabilityOptions,
) {
  return Effect.runPromise(
    makeRemoteObservabilityRuntimeEffect(options, remote).pipe(Effect.mapError(legacy)),
  );
}
