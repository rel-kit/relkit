import { observeExecution } from "@relkit/runtime-effect";
import { Context, Deferred, Effect, Layer, Ref } from "effect";
import { runEngineSync } from "./engine-runtime.js";
import type {
  GenerationLifecycleSnapshot,
  GenerationLifecycleState,
  GenerationOperations,
} from "./lifecycle.types.js";

export type {
  GenerationLease,
  GenerationLifecycleSnapshot,
  GenerationLifecycleState,
  GenerationState,
} from "./lifecycle.types.js";

/** Stable generation transition states exposed by the compatibility facade. */
export const GENERATION_LIFECYCLE_STATES = [
  "constructing",
  "ready",
  "draining",
  "shutting-down",
  "shutdown",
] as const;

/** Compatibility error for invalid generation transitions. */
export class GenerationLifecycleError extends Error {
  readonly state: GenerationLifecycleState;

  /** Describe the rejected lifecycle transition.
   * @param state - State observed before the rejected transition.
   * @param message - Safe transition diagnostic.
   */
  constructor(state: GenerationLifecycleState, message: string) {
    super(`Generation ${message} in state ${state}`);
    this.name = "GenerationLifecycleError";
    this.state = state;
  }
}

/** Generation lifecycle authority, substitutable through a test Layer.
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   const generation = yield* GenerationService;
 *   yield* generation.markReady();
 *   const lease = yield* generation.acquire();
 *   lease.release();
 *   yield* generation.beginDrain();
 *   yield* generation.waitForIdle();
 * }).pipe(Effect.provide(GenerationLive));
 * await Effect.runPromise(program);
 * ```
 */
export class GenerationService extends Context.Service<GenerationService, GenerationOperations>()(
  "@relkit/engine/Generation",
) {}

/** Allocate isolated lifecycle state and deterministic idle synchronization.
 * @returns A lazy effect constructing one generation's operations.
 * @see {@link GenerationService} for provisioning and lease ownership.
 */
export const makeGeneration = Effect.fn("Engine.generation.make")(function* () {
  const state = yield* Ref.make<GenerationLifecycleSnapshot>({
    state: "constructing",
    activeCount: 0,
    accepting: false,
  });
  const idle = yield* Ref.make(Deferred.makeUnsafe<void>());
  /** Read this generation's current admission state and active lease count.
   * @returns An observed effect yielding the current immutable snapshot.
   */
  const snapshot = Effect.fn("Engine.generation.snapshot")(() =>
    observeExecution("engine", "generation.snapshot", Ref.get(state)),
  );
  /** Apply a permitted lifecycle transition without reopening a draining generation.
   * @param action - Human-readable transition name for invalid-state diagnostics.
   * @param next - State requested by this operation.
   * @param accepts - States from which this transition may begin.
   * @returns An atomic transition effect, failing if state or active leases prevent it.
   */
  const transition = (
    action: string,
    next: GenerationLifecycleState,
    accepts: readonly GenerationLifecycleState[],
  ) =>
    Ref.modify(state, (current) => {
      if (
        (next !== "ready" && current.state === next) ||
        (next === "draining" && ["shutting-down", "shutdown"].includes(current.state)) ||
        (next === "shutting-down" && current.state === "shutdown")
      )
        return [undefined, current] as const;
      if (!accepts.includes(current.state))
        return [
          new GenerationLifecycleError(current.state, `cannot ${action}; expected ${accepts[0]}`),
          current,
        ] as const;
      if (next === "shutdown" && current.activeCount > 0)
        return [
          new GenerationLifecycleError(current.state, "cannot complete shutdown with active work"),
          current,
        ] as const;
      return [
        undefined,
        Object.freeze({ ...current, state: next, accepting: next === "ready" }),
      ] as const;
    }).pipe(Effect.flatMap((error) => (error === undefined ? Effect.void : Effect.fail(error))));
  /** Attach the generation operation's bounded telemetry label to its state change.
   * @param name - Declaration-owned generation operation label.
   * @param work - Lazy transition effect whose failure identity must be retained.
   * @returns The transition with call count, outcome and duration observations.
   */
  const operation = (name: string, work: Effect.Effect<void, GenerationLifecycleError>) =>
    observeExecution("engine", name, work);
  /** Open admission after the generation finishes construction.
   * @returns An effect moving a constructing generation to ready.
   */
  const markReady = Effect.fn("Engine.generation.markReady")(() =>
    operation("generation.markReady", transition("mark ready", "ready", ["constructing"])),
  );
  /** Stop new admission while allowing existing leases to finish.
   * @returns An effect entering draining, or retaining a later shutdown state.
   */
  const beginDrain = Effect.fn("Engine.generation.beginDrain")(() =>
    operation("generation.beginDrain", transition("begin drain", "draining", ["ready"])),
  );
  /** Mark teardown as started without accepting new leases.
   * @returns An effect entering shutting-down, or retaining completed shutdown.
   */
  const beginShutdown = Effect.fn("Engine.generation.beginShutdown")(() =>
    operation(
      "generation.beginShutdown",
      transition("begin shutdown", "shutting-down", ["constructing", "ready", "draining"]),
    ),
  );
  /** Complete teardown only after every active lease has been released.
   * @returns An effect entering shutdown, failing while active work remains.
   */
  const completeShutdown = Effect.fn("Engine.generation.completeShutdown")(() =>
    operation(
      "generation.completeShutdown",
      transition("complete shutdown", "shutdown", ["shutting-down"]),
    ),
  );
  /** Acquire an active-work lease while this generation accepts new invocations.
   * @returns An observed effect yielding a lease with an idempotent synchronous release.
   */
  const acquire = Effect.fn("Engine.generation.acquire")(() =>
    observeExecution(
      "engine",
      "generation.acquire",
      Effect.gen(function* () {
        const current = yield* Ref.get(state);
        if (!current.accepting)
          return yield* Effect.fail(
            new GenerationLifecycleError(current.state, "cannot accept new work"),
          );
        if (current.activeCount === 0) yield* Ref.set(idle, Deferred.makeUnsafe<void>());
        yield* Ref.update(state, (value) =>
          Object.freeze({ ...value, activeCount: value.activeCount + 1 }),
        );
        const released = Ref.makeUnsafe(false);
        return Object.freeze({
          release: () =>
            runEngineSync(
              observeExecution(
                "engine",
                "generation.release",
                Effect.gen(function* () {
                  if (yield* Ref.getAndSet(released, true)) return;
                  const next = yield* Ref.updateAndGet(state, (value) =>
                    Object.freeze({ ...value, activeCount: value.activeCount - 1 }),
                  );
                  if (next.activeCount === 0)
                    yield* Deferred.succeed(yield* Ref.get(idle), undefined);
                }),
              ),
            ),
        });
      }),
    ),
  );
  /** Wait for the current active-work group to release its final lease.
   * @returns An interruptible wait that completes immediately when already idle.
   */
  const waitForIdle = Effect.fn("Engine.generation.waitForIdle")(() =>
    observeExecution(
      "engine",
      "generation.waitForIdle",
      Effect.gen(function* () {
        if ((yield* Ref.get(state)).activeCount > 0) yield* Deferred.await(yield* Ref.get(idle));
      }),
    ),
  );
  return GenerationService.of({
    snapshot,
    markReady,
    beginDrain,
    beginShutdown,
    completeShutdown,
    acquire,
    waitForIdle,
  });
});

/** Live generation layer; each build receives independent state. */
export const GenerationLive = Layer.effect(GenerationService, makeGeneration());
