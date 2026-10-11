/**
 * Coalesces session shutdown and joins background support before releasing the
 * stable listener/generations. The original reason stays captured in lazy work;
 * signal callbacks submit that work without executing a nested Effect runtime.
 */
import { Deferred, Effect, Fiber, Ref } from "effect";
import { observeCli } from "../cli-runtime.js";
import { shutdownDevEffect } from "./dev-shutdown.js";
import { provideDevEngine } from "./dev-engine-state.js";
import type { DevEngineState } from "./dev-engine-state.types.js";
import type { DevSession } from "./dev-session.js";

/**
 * Closes admission once and returns the shared physical shutdown settlement.
 * @typeParam Reason - Original native/public reason, retained without widening.
 * @param owner - Stop coordination and support-worker reference.
 * @param session - Session whose owned children/resources are released.
 * @param worker - Serialized candidate worker owned by this session.
 * @param reason - Original cancellation/failure reason or default user stop.
 * @returns Joined shutdown after support, generations, outputs and listeners release.
 */
export function stopDevEngine<Reason>(
  owner: DevEngineState,
  session: DevSession,
  worker: Fiber.Fiber<void>,
  reason?: Reason,
) {
  const stoppingReason = reason ?? new Error("Development session stopped.");
  return observeCli(
    "dev.session.stop",
    Effect.uninterruptible(
      Effect.gen(function* () {
        if (!(yield* Ref.getAndSet(owner.closing, true))) {
          session.markStopping();
          session.abortController.abort(stoppingReason);
          const support = yield* Ref.get(owner.inspector);
          if (support !== undefined) yield* Fiber.interrupt(support);
          yield* Deferred.complete(
            owner.closed,
            owner.startup.withPermits(1)(
              provideDevEngine(owner, shutdownDevEffect(session, stoppingReason, worker)),
            ),
          );
        }
        yield* Deferred.await(owner.closed);
      }),
    ),
  );
}
