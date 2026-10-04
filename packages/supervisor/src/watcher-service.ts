import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Ref } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { createWatcherNotify } from "./watcher-notify.js";
import { runWatcherCompile } from "./watcher-compile.js";
import type { SupervisorStateMachine } from "./state-machine.js";
import type {
  ActiveCompile,
  WatcherService,
  WatcherState,
  SupervisorWatcherOptions,
} from "./watcher.types.js";

/** Owns source coalescing, debounce fibers and one active native compilation. */
export class SupervisorSourceWatcher extends Context.Service<
  SupervisorSourceWatcher,
  WatcherService
>()("relkit/supervisor/SourceWatcher") {}

/**
 * Acquires a prompt Layer; workers start only after notification or flush.
 * @param options - Native compiler and debounce policy.
 * @param machine - Activation owner borrowed by this watcher.
 * @returns The replaceable scoped scheduling workflow.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { createSupervisorStateMachine } from "./state-machine.js";
 * import { SupervisorSourceWatcher, createWatcherLayer } from "./watcher-service.js";
 * export async function compileLatest(): Promise<void> {
 * const machine = createSupervisorStateMachine({ logger: { human: false, json: false } });
 * await Effect.runPromise(Effect.gen(function* () {
 *   const watcher = yield* SupervisorSourceWatcher;
 *   yield* watcher.notify({ version: 1 });
 *   yield* watcher.flush;
 * }).pipe(Effect.provide(createWatcherLayer({ compile: () => undefined }, machine))));
 * }
 * ```
 */
export function createWatcherLayer(
  options: SupervisorWatcherOptions,
  machine: SupervisorStateMachine,
) {
  return Layer.effect(
    SupervisorSourceWatcher,
    Effect.gen(function* () {
      const debounce = options.debounceMs ?? 0;
      if (!Number.isFinite(debounce) || debounce < 0)
        return yield* Effect.fail(
          new RangeError("Supervisor watcher debounce must be a non-negative number."),
        );
      const scope = yield* Effect.scope;
      const state = yield* Ref.make<WatcherState>({
        admission: undefined,
        disposed: false,
        version: undefined,
        pending: undefined,
        active: undefined,
      });
      const timer = yield* Ref.make<Fiber.Fiber<void> | undefined>(undefined);

      /** Releases the previous debounce fiber. @returns No pending sleep remains. */
      const clearTimer = Effect.gen(function* () {
        const previous = yield* Ref.getAndSet(timer, undefined);
        if (previous !== undefined) yield* Fiber.interrupt(previous);
      });

      /** Replaces debounce work in the owner scope. @returns After forking the delay. */
      const schedule = Effect.suspend(() =>
        Effect.gen(function* () {
          yield* clearTimer;
          const fiber = yield* Effect.forkIn(
            Effect.gen(function* () {
              yield* Effect.sleep(debounce);
              yield* Ref.set(timer, undefined);
              yield* startPending;
            }),
            scope,
          );
          yield* Ref.set(timer, fiber);
        }),
      );

      /** Admits one worker atomically and attaches it to this scope.
       * @returns Nothing if another worker already owns compilation.
       */
      const startPending: Effect.Effect<void> = Effect.suspend(() =>
        Effect.gen(function* () {
          const done = yield* Deferred.make<void>();
          const active = yield* Ref.modify(
            state,
            (current): readonly [ActiveCompile | undefined, WatcherState] => {
              if (
                current.disposed ||
                current.admission !== undefined ||
                current.active !== undefined ||
                current.pending === undefined
              )
                return [undefined, current];
              const next = { pending: current.pending, controller: new AbortController(), done };
              return [next, { ...current, pending: undefined, active: next }];
            },
          );
          if (active === undefined) return;
          const worker = runWatcherCompile(
            active.pending,
            active.controller,
            options.compile,
            state,
            machine,
          ).pipe(
            Effect.onExit((exit) =>
              Effect.gen(function* () {
                if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause))
                  yield* Effect.sync(() =>
                    machine.compileFailed(active.pending.token, "Supervisor watcher disposed."),
                  );
                yield* Ref.update(state, (current) =>
                  current.active?.pending === active.pending
                    ? { ...current, active: undefined }
                    : current,
                );
                yield* Deferred.succeed(done, undefined);
                const latest = yield* Ref.get(state);
                if (
                  !latest.disposed &&
                  latest.pending !== undefined &&
                  !(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause))
                )
                  yield* schedule;
              }),
            ),
          );
          const fiber = yield* Effect.forkIn(worker, scope, { startImmediately: true });
          yield* Ref.update(state, (current) =>
            current.active?.pending === active.pending
              ? { ...current, active: { ...active, fiber } }
              : current,
          );
        }),
      );

      /** Stops source admission before invoking native abort callbacks. @returns Once scheduling is retired. */
      const dispose = Effect.gen(function* () {
        const current = yield* Ref.get(state);
        if (current.disposed) return;
        yield* observeExecution(
          "supervisor",
          "watcher.stopAdmission",
          Effect.gen(function* () {
            yield* Ref.set(state, {
              ...current,
              disposed: true,
              pending: undefined,
              admission: undefined,
            });
            yield* clearTimer;
            yield* Effect.sync(() => {
              const token =
                current.pending?.token ??
                current.active?.pending.token ??
                (current.admission === undefined ? undefined : machine.snapshot().candidate);
              if (token !== undefined) machine.compileFailed(token, "Supervisor watcher disposed.");
              current.active?.controller.abort(new Error("Supervisor watcher disposed."));
            });
          }),
          () => ({ generations: 1 }),
        );
      });
      yield* Effect.addFinalizer(() => dispose);

      return SupervisorSourceWatcher.of({
        version: Ref.get(state).pipe(Effect.map((current) => current.version)),
        notify: createWatcherNotify(state, machine, schedule),
        flush: observeExecution(
          "supervisor",
          "watcher.flush",
          Effect.fn("SupervisorWatcher.flush")(function* () {
            yield* clearTimer;
            while (true) {
              const current = yield* Ref.get(state);
              if (
                current.disposed ||
                (current.pending === undefined && current.active === undefined)
              )
                return;
              if (current.active !== undefined) yield* Deferred.await(current.active.done);
              else yield* startPending;
            }
          })(),
          () => ({ generations: 1 }),
        ),
        dispose,
      });
    }),
  );
}
