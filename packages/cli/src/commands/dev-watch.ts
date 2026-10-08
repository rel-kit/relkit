import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { Cause, Effect, Exit, MutableRef, Queue, Ref, Scope } from "effect";
import { cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliCleanup, cleanupEffect } from "../services/cleanup.service.js";
import { CliSourceWatch } from "../services/source-watch.service.js";
import type { DevSession } from "./dev-session.js";
import type { EffectDevSourceWatcher, DevSourceWatcher } from "./dev-watch.types.js";
export type { DevSourceWatcher } from "./dev-watch.types.js";

/**
 * Owns native file watchers and a debounced FIFO activation worker.
 * @param session - Session-local activator and generation lifetime.
 * @returns A scoped watcher; native callbacks only enqueue bounded events.
 */
export const makeDevSourceWatcherEffect = Effect.fn("Dev.watch")(
  function* (session: DevSession) {
    const cleanup = yield* CliCleanup;
    const native = yield* CliSourceWatch;
    const events = yield* Queue.make<readonly string[]>({ capacity: 256, strategy: "sliding" });
    const nativeFailures = yield* Ref.make<readonly unknown[]>([]);
    const releaseFailures = yield* Ref.make<readonly unknown[]>([]);
    const open = yield* Ref.make(true);
    const scope = yield* Scope.make();
    const sourceRoot = yield* cliTry("dev.watch.root", () =>
      existsSync(join(session.projectRoot, "src"))
        ? join(session.projectRoot, "src")
        : session.projectRoot,
    );
    const notify = (files: readonly string[]): void => {
      if (Ref.getUnsafe(open)) Queue.offerUnsafe(events, files);
    };
    const failure = (reason: unknown): void => {
      if (!Ref.getUnsafe(open) || Ref.getUnsafe(nativeFailures).length) return;
      MutableRef.set(nativeFailures.ref, [reason]);
      session.nativeEngine.requestStop(reason);
    };
    const stops: Array<() => void> = [];
    const close = (): void => {
      if (!Ref.getUnsafe(open)) return;
      MutableRef.set(open.ref, false);
      for (const stop of stops) {
        try {
          stop();
        } catch (reason) {
          MutableRef.update(releaseFailures.ref, (previous) => [...previous, reason]);
        }
      }
      Queue.shutdownUnsafe(events);
    };
    const closeEffect = observeCli(
      "dev.watch.close",
      Effect.sync(close).pipe(
        Effect.andThen(Ref.getAndSet(nativeFailures, [])),
        Effect.flatMap((failures) =>
          Effect.forEach(
            failures,
            (reason) => cleanup.record("dev.watch.native", Cause.fail(reason)),
            { discard: true },
          ),
        ),
        Effect.andThen(Ref.getAndSet(releaseFailures, [])),
        Effect.flatMap((failures) =>
          Effect.forEach(
            failures,
            (reason) => cleanup.record("dev.watch.registration.release", Cause.fail(reason)),
            { discard: true },
          ),
        ),
        Effect.ensuring(
          cleanupEffect("dev.watch.worker.release", Scope.close(scope, Exit.void)).pipe(
            Effect.provideService(CliCleanup, cleanup),
          ),
        ),
        Effect.uninterruptible,
      ),
    );
    yield* Effect.addFinalizer(() => closeEffect);
    const register = (
      acquisition: Effect.Effect<() => void, import("../cli-errors.js").CliAdapterError>,
    ) =>
      acquisition.pipe(
        Effect.tap((stop) =>
          Effect.sync(() => {
            stops.push(stop);
          }),
        ),
        Effect.uninterruptible,
      );
    yield* register(
      native.watch(
        sourceRoot,
        true,
        (filename) => {
          const file = relative(session.projectRoot, join(sourceRoot, filename));
          if (!ignored(file) && file !== relative(session.projectRoot, sourceRoot)) notify([file]);
        },
        failure,
      ),
    );
    if (sourceRoot !== session.projectRoot)
      yield* register(
        native.watch(
          session.projectRoot,
          false,
          (filename) => {
            if (["relkit.config.ts", "package.json", "bun.lock"].includes(filename))
              notify([filename]);
          },
          failure,
        ),
      );
    for (const file of [".env", ".env.local"])
      yield* register(native.poll(join(session.projectRoot, file), () => notify([file])));
    yield* Effect.forkIn(
      Effect.forever(
        Effect.gen(function* () {
          const first = yield* Queue.take(events);
          yield* Effect.sleep(75);
          const batch = yield* Queue.takeBetween(events, 0, 256);
          if (Ref.getUnsafe(nativeFailures).length) return;
          const files = Object.freeze([...new Set([...first, ...batch.flat()])].sort().slice(-256));
          while (yield* cliTry("dev.watch.scaffold", () => scaffolding(session.projectRoot))) {
            if (!Ref.getUnsafe(open)) return;
            yield* Effect.sleep(75);
          }
          if (Ref.getUnsafe(open)) {
            if (session.options.sourceChangedEffect)
              yield* session.options.sourceChangedEffect(files);
            yield* session.nativeEngine.activate(undefined, files);
          }
        }),
      ).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.void
            : cleanup
                .record("dev.watch.worker", cause)
                .pipe(
                  Effect.andThen(
                    Effect.sync(() => session.nativeEngine.requestStop(Cause.squash(cause))),
                  ),
                ),
        ),
      ),
      scope,
    );
    return { close, closeEffect } satisfies EffectDevSourceWatcher;
  },
  (effect, _session: DevSession) => observeCli("dev.watch.start", effect),
);

/** Acquires watching through the manual owner's retained synchronous edge.
 * @param session - Started manual session.
 * @returns Existing synchronous close facade.
 */
export function startDevSourceWatcher(session: DevSession): DevSourceWatcher {
  return session.runSynchronous(session.nativeEngine.watch);
}
/** Excludes generated, dependency and scaffold transaction paths from source activation.
 * @param file - Project-relative native watch path.
 * @returns Whether the path must not trigger a generation.
 */
function ignored(file: string): boolean {
  return (
    file === "" ||
    file === ".env" ||
    file === ".env.local" ||
    file.startsWith("node_modules/") ||
    file.startsWith(".relkit/") ||
    /^\.relkit-scaffold-/.test(file) ||
    /\.relkit-[\da-f-]+\.tmp$/.test(file)
  );
}
/** Checks whether a live scaffold transaction currently fences publication.
 * @param root - Authored project root.
 * @returns Whether a live scaffold transaction owns its publication fence.
 */
function scaffolding(root: string): boolean {
  return readdirSync(root).some((file) => {
    const match = /^\.relkit-scaffold-(\d+)-[\da-f-]+\.tmp$/.exec(file);
    if (!match || Number(match[1]) <= 0) return false;
    try {
      process.kill(Number(match[1]), 0);
      return true;
    } catch (error) {
      return !(error instanceof Error && "code" in error && error.code === "ESRCH");
    }
  });
}
