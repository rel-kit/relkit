import { Context, Deferred, Effect, Exit, Layer, Option, Ref } from "effect";
import { cliAdapterError, cliPromise, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliCleanup, cleanupEffect } from "../services/cleanup.service.js";
import type { StartProcessOperations } from "./start.types.js";
import type { OwnedStartedProcess } from "./start-process.types.js";

/** Native production child capability; each spawn requires an explicit lifetime scope. */
export class CliStartProcess extends Context.Service<CliStartProcess, StartProcessOperations>()(
  "relkit/cli/StartProcess",
) {}

/**
 * Captures the selected native spawn boundary without starting a child.
 * @param spawn - Native Bun spawn or a contract-compatible test adapter.
 * @returns A Layer requiring cleanup authority; individual children require caller Scope.
 */
export function startProcessLive(spawn: typeof Bun.spawn = Bun.spawn) {
  return Layer.effect(
    CliStartProcess,
    Effect.gen(function* () {
      const cleanup = yield* CliCleanup;
      return CliStartProcess.of({
        spawn: Effect.fn("StartProcess.spawn")(
          function* (request) {
            const stopping = yield* Ref.make(false);
            const stopped = yield* Deferred.make<
              void,
              import("../cli-errors.js").CliAdapterError
            >();
            const drains = yield* Ref.make<readonly Promise<void>[]>([]);
            const owned = yield* Effect.acquireRelease(
              cliTry("start.spawn", () => ({
                child: spawn([...request.command], {
                  cwd: request.cwd,
                  env: { ...request.environment },
                  stdin: "ignore",
                  stdout: "pipe",
                  stderr: "pipe",
                }),
                stopping,
                stopped,
                drains,
              })),
              (owned) =>
                cleanupEffect(
                  "start.process.release",
                  stopOwnedEffect(owned, request.stopTimeoutMs),
                ).pipe(Effect.provideService(CliCleanup, cleanup)),
            );
            // Only piped output belongs to this owner. A compatible custom spawn may
            // inherit either stream; that borrowed terminal has no reader to release.
            // Pipe failures are observed immediately and release joins their receipts.
            yield* Effect.forEach(
              [owned.child.stdout, owned.child.stderr].filter(
                (stream) => stream instanceof ReadableStream,
              ),
              (stream) =>
                cliTry("start.readers", () => {
                  const drained = stream.pipeTo(new WritableStream<Uint8Array>({ write() {} }));
                  void drained.catch(() => undefined);
                  return drained;
                }).pipe(
                  Effect.tap((receipt) => Ref.update(drains, (previous) => [...previous, receipt])),
                  Effect.uninterruptible,
                ),
              { discard: true },
            );
            return { child: owned.child, stop: stopOwnedEffect(owned, request.stopTimeoutMs) };
          },
          (effect) => observeCli("start.process.spawn", effect),
        ),
      });
    }),
  );
}

/**
 * Elects one finite shutdown owner and publishes its full completion to every waiter.
 * @param owned - Child and completion state installed before startup.
 * @param timeoutMs - Grace period before SIGKILL.
 * @returns A lazy shared stop, retaining cleanup failures in the typed channel.
 */
const stopOwnedEffect = Effect.fn("StartProcess.stop")(
  function* (owned: OwnedStartedProcess, timeoutMs: number) {
    const already = yield* Ref.getAndSet(owned.stopping, true);
    if (already) return yield* Deferred.await(owned.stopped);
    const exit = yield* Effect.exit(
      Effect.gen(function* () {
        if (owned.child.exitCode === null)
          yield* cliTry("start.terminate", () => owned.child.kill("SIGTERM"));
        const graceful = yield* cliPromise("start.exit", () => owned.child.exited).pipe(
          Effect.interruptible,
          Effect.timeoutOption(timeoutMs),
        );
        if (Option.isNone(graceful) && owned.child.exitCode === null) {
          yield* cliTry("start.kill", () => owned.child.kill("SIGKILL"));
          const reaped = yield* cliPromise("start.reap", () => owned.child.exited).pipe(
            Effect.interruptible,
            Effect.timeoutOption(5_000),
          );
          if (Option.isNone(reaped))
            return yield* Effect.fail(
              cliAdapterError(
                "start.reap",
                new Error("Built server did not exit within the cleanup deadline."),
              ),
            );
        }
        const readers = yield* Ref.get(owned.drains);
        const drained = yield* Effect.forEach(
          readers,
          (receipt) => cliPromise("start.drain", () => receipt),
          { concurrency: 2, discard: true },
        ).pipe(Effect.interruptible, Effect.timeoutOption(5_000));
        if (Option.isNone(drained))
          return yield* Effect.fail(
            cliAdapterError(
              "start.drain",
              new Error("Built server output did not close within the cleanup deadline."),
            ),
          );
      }),
    );
    yield* Deferred.done(owned.stopped, exit);
    if (Exit.isFailure(exit)) return yield* Effect.failCause(exit.cause);
  },
  (effect) => observeCli("start.process.stop", effect.pipe(Effect.uninterruptible)),
);
