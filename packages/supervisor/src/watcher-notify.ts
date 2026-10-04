import { observeExecution } from "@relkit/contracts/operation";
import { Effect, Ref, Schema } from "effect";
import { SourceVersionSchema } from "./watcher.schemas.js";
import type { WatcherState, SupervisorSourceChange } from "./watcher.types.js";
import type { SupervisorStateMachine } from "./state-machine.js";

/** Creates the watcher admission workflow before native callbacks can reenter it.
 * @param state - Authoritative watcher state. @param machine - Borrowed activation authority.
 * @param schedule - Owned debounce replacement. @returns An observed synchronous admission method. */
export function createWatcherNotify(
  state: Ref.Ref<WatcherState>,
  machine: SupervisorStateMachine,
  schedule: Effect.Effect<void>,
) {
  return Effect.fn("SupervisorWatcher.notify")((change: SupervisorSourceChange) =>
    observeExecution(
      "supervisor",
      "watcher.notify",
      Effect.gen(function* () {
        const current = yield* Ref.get(state);
        if (current.disposed)
          return yield* Effect.fail(new Error("Supervisor watcher is disposed."));
        if (!Schema.is(SourceVersionSchema)(change.version))
          return yield* Effect.fail(
            new TypeError("Supervisor source versions must be non-negative safe integers."),
          );
        if (current.version !== undefined && change.version < current.version) return undefined;
        const admission = {
          identity: Symbol(),
          changedFiles: Object.freeze([
            ...new Set([
              ...(current.admission?.changedFiles ?? current.pending?.changedFiles ?? []),
              ...(change.changedFiles ?? []),
            ]),
          ]),
        };
        yield* Ref.set(state, {
          ...current,
          version: change.version,
          pending: undefined,
          admission,
        });
        const token = machine.requestSourceChange();
        const applied = yield* Ref.modify(state, (latest) => {
          if (latest.disposed || latest.admission !== admission) return [false, latest];
          return [
            true,
            {
              ...latest,
              admission: undefined,
              pending: { token, version: change.version, changedFiles: admission.changedFiles },
            },
          ];
        });
        if (!applied) return token;
        yield* Effect.sync(() =>
          current.active?.controller.abort(
            new Error("Source changed before compilation completed."),
          ),
        );
        yield* schedule;
        return token;
      }),
      () => ({ files: change.changedFiles?.length ?? 0 }),
    ).pipe(Effect.uninterruptible),
  );
}
