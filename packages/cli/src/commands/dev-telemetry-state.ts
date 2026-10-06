import { Effect, MutableRef, Ref } from "effect";
import type { TelemetryConfiguration } from "@relkit/observability";
import type { TelemetryState } from "./dev-telemetry.types.js";

/**
 * Allocates private state before any worker callback can publish a failure.
 * @param configuration - Normalized model-owner settings.
 * @returns State owned exclusively by this telemetry session.
 */
export const telemetryStateEffect = Effect.fn("DevTelemetry.state")(function* (
  configuration: TelemetryConfiguration,
) {
  return {
    configuration: yield* Ref.make(configuration),
    error: yield* Ref.make<string | undefined>(undefined),
    committed: yield* Ref.make(0),
    sequence: yield* Ref.make(0),
    streamClosed: yield* Ref.make(false),
  } satisfies TelemetryState;
});

/**
 * Publishes the failure before best-effort notification, retaining the first diagnostic.
 * @param state - Session-owned state.
 * @param notify - Existing external failure sink.
 * @returns Native callback that cannot strand cleanup if notification throws.
 */
export function telemetryFailureCallback(state: TelemetryState, notify: (error: Error) => void) {
  return (reason: unknown): void => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    if (Ref.getUnsafe(state.error) !== undefined) return;
    MutableRef.set(state.error.ref, error.message);
    try {
      notify(error);
    } catch {
      /* Failure reporting cannot replace the storage outcome. */
    }
  };
}
