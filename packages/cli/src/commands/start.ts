import { Cause, Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { runExecutionPromise } from "@relkit/contracts/operation";
import { createLoggerLayer } from "@relkit/runtime-effect";
import { cliOriginalError, cliPromise, type CliAdapterError } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliCleanup, cleanupLayer } from "../services/cleanup.service.js";
import {
  cliCleanupFailures,
  cliCleanupSnapshotUnsafe,
  retainCliCleanupFailures,
} from "../cli-cleanup-evidence.js";
import { CliStart, startLiveLayer } from "./start.service.js";
import type { StartedProject, StartOptions } from "./start.types.js";
export type { StartedProject, StartOptions } from "./start.types.js";
export { CliStart, startLive, startLiveLayer } from "./start.service.js";

/**
 * Starts production in an explicitly provided lifetime scope.
 * @param options - Build and native startup settings.
 * @returns Lazy ready handle requiring CliStart and Scope; its stop remains owned by that scope.
 */
export const startProjectEffect = Effect.fn("Start.project")(
  (options: StartOptions = {}) => CliStart.use((start) => start.start(options)),
  (effect, _options: StartOptions = {}) => observeCli("start.project", effect),
);

/**
 * Runs production until native exit with one scope owning the complete lifetime.
 * @param options - Build, port, health and cancellation settings.
 * @returns The child's native exit status after process/reader cleanup.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * await Effect.runPromise(runStartEffect({ port: 0 }).pipe(Effect.provide(startLiveLayer())));
 * ```
 */
export const runStartEffect = Effect.fn("Start.command")(
  (options: StartOptions = {}) =>
    Effect.scoped(
      Effect.gen(function* () {
        const server = yield* startProjectEffect(options);
        return yield* cliPromise("start.wait", () => server.exited);
      }),
    ),
  (effect, _options: StartOptions = {}) => observeCli("start.command", effect),
);

/**
 * Preserves the production exit Promise while owning finite scope disposal.
 * @param options - Existing production settings.
 * @returns Native exit status; interruption stops and reaps the child before rejection.
 */
export function runStart(options: StartOptions = {}): Promise<number> {
  return runCliEffect(runStartEffect(options), startLiveLayer(options), options.signal);
}

/**
 * Transfers an explicit scope to the existing caller-owned production handle.
 * @param options - Build, native settings and optional continuing cancellation signal.
 * @returns A ready handle that remains alive until stop, caller abort, or native exit.
 * @remarks One ManagedRuntime owns the service graph; one manual Scope owns the child.
 * Native completion callbacks only close that same memoized lifetime. They do not
 * run background domain workflows or acquire another runtime.
 * @example
 * ```ts
 * const project = await startProject({ port: 0 });
 * try { await fetch(`http://127.0.0.1:${project.port}/_relkit/v1/health/live`); }
 * finally { await project.stop(); }
 * ```
 */
export async function startProject(options: StartOptions = {}): Promise<StartedProject> {
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      startLiveLayer(options),
      cleanupLayer,
      createLoggerLayer({ component: "cli", human: false, json: false }),
    ),
  );
  const scope = await runtime.runPromise(Scope.make());
  const cleanup = await runtime.runPromise(CliCleanup);
  let result: StartedProject | undefined;
  let closing: Promise<void> | undefined;
  let abort: (() => void) | undefined;
  let stopOwned: Effect.Effect<void, CliAdapterError> | undefined;
  const close = (): Promise<void> =>
    (closing ??= (async () => {
      if (abort !== undefined) options.signal?.removeEventListener("abort", abort);
      let failed = false;
      let failure: unknown;
      try {
        await runtime.runPromise(
          Effect.gen(function* () {
            const stopped = yield* Effect.exit(stopOwned ?? Effect.void);
            yield* Scope.close(scope, Exit.void);
            if (Exit.isFailure(stopped)) return yield* Effect.failCause(stopped.cause);
          }).pipe(
            Effect.catchCause((cause) =>
              CliCleanup.use((cleanup) => cleanup.record("start.owner.release", cause)).pipe(
                Effect.andThen(Effect.failCause(cause)),
              ),
            ),
            Effect.mapError(cliOriginalError),
          ),
        );
      } catch (error) {
        failed = true;
        failure = error;
      }
      try {
        await runtime.dispose();
      } catch (error) {
        if (failed) {
          retainCliCleanupFailures(failure, [
            { operation: "start.owner.dispose", cause: Cause.fail(error) },
          ]);
        } else {
          failed = true;
          failure = error;
        }
      }
      const evidence = cliCleanupSnapshotUnsafe(cleanup);
      if (result !== undefined) retainCliCleanupFailures(result, evidence);
      if (failed) {
        retainCliCleanupFailures(failure, evidence);
        throw failure;
      }
    })());
  try {
    const handle = await runExecutionPromise(
      runtime,
      startProjectEffect(options).pipe(
        Effect.provideService(Scope.Scope, scope),
        Effect.mapError(cliOriginalError),
      ),
      options.signal === undefined ? undefined : { signal: options.signal },
    );
    stopOwned = handle.stopEffect;
    abort = (): void => {
      void close().catch(() => undefined);
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) throw options.signal.reason ?? new Error("Start was aborted.");
    // The physical native exit is the completion authority for automatic scope disposal.
    // Both branches admit failures; callers still receive the original exited Promise.
    void handle.exited.then(close, close).catch(() => undefined);
    result = Object.freeze({
      projectRoot: handle.projectRoot,
      buildDirectory: handle.buildDirectory,
      hostname: handle.hostname,
      port: handle.port,
      process: handle.process,
      exited: handle.exited,
      stop: close,
    });
    return result;
  } catch (error) {
    const primary = options.signal?.aborted ? (options.signal.reason ?? error) : error;
    // close publishes its separate cause to the bounded invocation cleanup ledger.
    // Native cancellation preserves the caller's reason after physical child release.
    await close().catch((secondary) =>
      retainCliCleanupFailures(primary, [
        { operation: "start.owner.release", cause: Cause.fail(secondary) },
        ...cliCleanupFailures(secondary),
      ]),
    );
    retainCliCleanupFailures(primary, cliCleanupSnapshotUnsafe(cleanup));
    throw primary;
  }
}
