import { observeExecution } from "@relkit/contracts/operation";
import { Clock, Context, Deferred, Effect, Exit, Layer, Ref } from "effect";
import { runDrain } from "./drain-run.js";
import { sameToken } from "./proxy-validation.js";
import { validateSupervisorToken } from "./state-machine-telemetry.js";
import type { DrainService, DrainState } from "./drain-service.types.js";
import type { SupervisorDrainOptions } from "./drain.types.js";

/** Generation lease admission and bounded shutdown service. */
export class SupervisorDrainOwner extends Context.Service<SupervisorDrainOwner, DrainService>()(
  "@relkit/supervisor/SupervisorDrainOwner",
) {}

/**
 * Acquires isolated lease state and a lazy, shared shutdown operation.
 * @param options - Native owner capabilities, token and explicit clock precedence.
 * @param deadlineMs - Validated absolute-budget policy.
 * @returns A scoped service whose acquisition does not start draining.
 */
export function createDrainLayer(options: SupervisorDrainOptions, deadlineMs: number) {
  return Layer.effect(
    SupervisorDrainOwner,
    Effect.gen(function* () {
      const idle = yield* Deferred.make<void>();
      yield* Deferred.succeed(idle, undefined);
      const state = yield* Ref.make<DrainState>({
        work: new Map(),
        nextId: 0,
        accepting: true,
        idle,
      });
      const token = Object.freeze({ ...options.token });
      const now = options.now === undefined ? Clock.currentTimeMillis : Effect.sync(options.now);
      const retainedOptions = {
        ...options,
        providers: Object.freeze([...(options.providers ?? [])]),
      };
      const drain = yield* Effect.cached(
        observeExecution(
          "supervisor",
          "generation.drain",
          runDrain({ state, token, now, deadlineMs }, retainedOptions),
          () => ({
            leases: Ref.getUnsafe(state).work.size,
            providers: retainedOptions.providers.length,
          }),
          (exit) => (Exit.isSuccess(exit) && exit.value.outcome !== "drained" ? "failure" : true),
        ),
      );
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          const current = Ref.getUnsafe(state);
          Effect.runSync(Ref.set(state, { ...current, accepting: false }));
          for (const work of current.work.values())
            if (!work.controller.signal.aborted)
              work.controller.abort(new Error("Supervisor drain owner closed."));
          Deferred.doneUnsafe(current.idle, Effect.void);
        }),
      );
      return SupervisorDrainOwner.of({
        inFlight: Ref.get(state).pipe(Effect.map((current) => current.work.size)),
        accepting: Ref.get(state).pipe(Effect.map((current) => current.accepting)),
        drain,
        track: (requested, workOptions) =>
          Effect.sync(() => {
            validateSupervisorToken(requested);
            const current = Ref.getUnsafe(state);
            if (!current.accepting || !sameToken(requested, token)) return undefined;
            const id = current.nextId + 1;
            const controller = new AbortController();
            const work = new Map(current.work);
            work.set(id, { controller, interrupt: workOptions.interrupt });
            Effect.runSync(
              Ref.set(state, {
                ...current,
                work,
                nextId: id,
                idle: current.work.size === 0 ? Deferred.makeUnsafe<void>() : current.idle,
              }),
            );
            return Object.freeze({
              token,
              signal: controller.signal,
              release: () => {
                const owned = Ref.getUnsafe(state);
                if (!owned.work.has(id)) return;
                const remaining = new Map(owned.work);
                remaining.delete(id);
                Effect.runSync(Ref.set(state, { ...owned, work: remaining }));
                if (remaining.size === 0) Deferred.doneUnsafe(owned.idle, Effect.void);
              },
            });
          }),
      });
    }),
  );
}
