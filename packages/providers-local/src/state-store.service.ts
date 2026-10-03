import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rmdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Clock, Effect, Schedule } from "effect";
import { ensureOwnedDirectory } from "./state.js";
import { localOperation, localPromise, localSync } from "./local-effect.js";
import type { LocalStateStore, LocalStateStoreOptions } from "./state-store.types.js";

/**
 * Creates a transactional snapshot store with cross-process lock ownership.
 * @param options - Domain file names, decoder and receipt pruning policy.
 * @returns A lazy store; initialization is shared by all operations.
 * @typeParam State - Validated persisted snapshot.
 * @remarks Acquired locks are always released. Only atomic file commit is masked.
 */
export const makeLocalStateStore = <State>(options: LocalStateStoreOptions<State>) =>
  Effect.gen(function* () {
    const root = yield* localSync(() => ensureOwnedDirectory(options.root));
    const path = join(root, options.filename);
    const lock = join(root, options.lockname);
    /**
     * Reads validated state through the owning storage or cache boundary.
     * @returns A lazy read effect retaining the existing value and error contract.
     */
    const read = Effect.fn("LocalStateStore.read")(function* () {
      const contents = yield* localPromise((signal) =>
        readFile(path, { encoding: "utf8", signal }),
      );
      return yield* localSync(() => options.decode(JSON.parse(contents)));
    });
    const initialize = yield* Effect.cached(
      withLock(
        lock,
        Effect.gen(function* () {
          const result = yield* Effect.result(read());
          if (result._tag === "Success") return;
          if (!hasCode(result.failure.cause, "ENOENT")) return yield* Effect.fail(result.failure);
          yield* writeState(path, options.empty());
        }),
      ),
    );
    return {
      read: Effect.fn("LocalStateStore.readReady")(
        function* () {
          yield* initialize;
          return yield* read();
        },
        (effect) => localOperation("LocalStateStore.read", effect),
      ),
      update: <A>(change: (state: State) => readonly [State, A]) =>
        localOperation(
          "LocalStateStore.update",
          Effect.gen(function* () {
            yield* initialize;
            return yield* withLock(
              lock,
              Effect.gen(function* () {
                const current = yield* read();
                const now = yield* Clock.currentTimeMillis;
                const pruned = yield* Effect.sync(() => options.prune(current, now));
                const [next, value] = yield* localSync(() => change(pruned)).pipe(
                  Effect.catch((error) =>
                    options.isExpectedFailure(error.cause)
                      ? Effect.fail(error)
                      : Effect.die(error.cause),
                  ),
                );
                yield* writeState(path, next);
                return value;
              }),
            );
          }),
        ),
    } satisfies LocalStateStore<State>;
  });

/**
 * Commits one complete snapshot and removes an uncommitted temporary file.
 * @param path - Owned destination file.
 * @param state - Complete snapshot to serialize.
 * @returns A commit effect with cleanup on every exit.
 */
function writeState(path: string, state: unknown) {
  return Effect.gen(function* () {
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
    const contents = yield* localSync(() => JSON.stringify(state));
    yield* localPromise(() => writeFile(temporary, contents, { flag: "wx", mode: 0o600 })).pipe(
      Effect.andThen(localPromise(() => rename(temporary, path))),
      Effect.ensuring(localPromise(() => rm(temporary, { force: true })).pipe(Effect.ignore)),
      Effect.uninterruptible,
    );
  });
}

/**
 * Holds the filesystem lock across one state transaction.
 * @param path - Directory used as the cross-process lock.
 * @param action - Transaction, run only after acquiring ownership.
 * @returns The transaction result; waits are interruptible and bounded.
 * @typeParam A - Transaction success value.
 * @typeParam E - Transaction failure.
 * @typeParam R - Transaction dependencies.
 */
function withLock<A, E, R>(path: string, action: Effect.Effect<A, E, R>) {
  return Effect.scoped(
    Effect.gen(function* () {
      const started = yield* Clock.currentTimeMillis;
      const acquire = Effect.gen(function* () {
        // Mask each native claim until its release is registered; the schedule remains interruptible.
        const acquired = yield* Effect.acquireRelease(claimLock(path), (owned) =>
          owned ? localPromise(() => rmdir(path)).pipe(Effect.ignore) : Effect.void,
        );
        if (acquired) return true;
        if ((yield* Clock.currentTimeMillis) - started >= 5_000)
          return yield* localSync(() => {
            throw new Error("Local state lock timed out.");
          });
        return false;
      }).pipe(
        Effect.repeat({ schedule: Schedule.spaced("10 millis"), until: (acquired) => acquired }),
      );
      yield* acquire;
      return yield* action;
    }),
  );
}

/**
 * Claims a lock or removes a stale lock left by a terminated process.
 * @param path - Cross-process lock directory.
 * @returns Whether this call acquired the lock.
 */
function claimLock(path: string) {
  return Effect.gen(function* () {
    const result = yield* Effect.result(localPromise(() => mkdir(path)));
    if (result._tag === "Success") return true;
    if (!hasCode(result.failure.cause, "EEXIST")) return yield* Effect.fail(result.failure);
    const info = yield* Effect.result(localPromise(() => stat(path)));
    if (info._tag === "Failure") {
      if (!hasCode(info.failure.cause, "ENOENT")) return yield* Effect.fail(info.failure);
    } else if ((yield* Clock.currentTimeMillis) - info.success.mtimeMs > 30_000) {
      yield* localPromise(() => rmdir(path)).pipe(Effect.ignore);
    }
    return false;
  });
}

/**
 * Checks a native filesystem error without asserting its runtime shape.
 * @param value - Rejected native value.
 * @param code - Expected filesystem error code.
 * @returns Whether the error carries that code.
 */
function hasCode(value: unknown, code: string): boolean {
  return value !== null && typeof value === "object" && "code" in value && value.code === code;
}
