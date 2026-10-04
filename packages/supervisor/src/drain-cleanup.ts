import { Cause, Effect, Exit } from "effect";
import type { SupervisorDrainAction, SupervisorDrainResource } from "./drain.types.js";
import type { SupervisorDrainCleanupResult } from "./drain-cleanup.types.js";
export type { SupervisorDrainCleanupResult } from "./drain-cleanup.types.js";

/**
 * Invokes native cleanup once and bounds waiting by the shared absolute deadline.
 * @param id - Resource name used only in bounded diagnostics.
 * @param action - Native owner cleanup; cancellation remains that owner's responsibility.
 * @param deadlineAt - Shared deadline, never reset for later providers.
 * @param now - Injected clock or explicitly supplied compatibility clock.
 * @returns Closed, failed or timed-out evidence without changing native owner error identity.
 */
export const closeAction: (
  id: string,
  action: SupervisorDrainAction | undefined,
  deadlineAt: number,
  now: Effect.Effect<number>,
) => Effect.Effect<SupervisorDrainCleanupResult> = Effect.fn("SupervisorDrain.closeAction")(
  function* (
    id: string,
    action: SupervisorDrainAction | undefined,
    deadlineAt: number,
    now: Effect.Effect<number>,
  ) {
    if (action === undefined) return { status: "not-configured" as const };
    const invoked = yield* Effect.exit(Effect.try({ try: action, catch: (error) => error }));
    if (Exit.isFailure(invoked)) return failure(id, Cause.squash(invoked.cause));
    if (invoked.value === undefined) return { status: "closed" as const };
    const remaining = Math.max(0, deadlineAt - (yield* now));
    // Legacy provider callbacks do not accept AbortSignal. Interrupt the owned waiter;
    // their actual resource owners retain responsibility for native settlement.
    return yield* Effect.raceFirst(
      Effect.tryPromise({
        try: () => Promise.resolve(invoked.value),
        catch: (error) => error,
      }).pipe(
        Effect.as({ status: "closed" as const }),
        Effect.catch((error) => Effect.succeed(failure(id, error))),
      ),
      Effect.sleep(remaining).pipe(Effect.as({ status: "timed-out" as const })),
    );
  },
);

/** Chooses the established native cleanup alias. @param resource - Provider owner. @returns First cleanup capability. */
export function resourceAction(
  resource: SupervisorDrainResource,
): SupervisorDrainAction | undefined {
  return resource.close ?? resource.release ?? resource.dispose;
}

/** Bounds public native failure details. @param id - Resource name. @param error - Native rejection. @returns Failure evidence. */
function failure(id: string, error: unknown): SupervisorDrainCleanupResult {
  const message = error instanceof Error ? error.message : "Resource cleanup failed.";
  return { status: "failed", message: `${id}: ${message}`.slice(0, 256) };
}
