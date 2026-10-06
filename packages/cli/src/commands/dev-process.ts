import { Deferred, Effect, Exit, Fiber, Layer, Option, Ref, Scope } from "effect";
import { cliPromise, cliTry } from "../cli-errors.js";
import { observeCli, runCliEffect } from "../cli-runtime.js";
import { CliCleanup, cleanupEffect, cleanupLayer } from "../services/cleanup.service.js";
import { cliCleanupSnapshotUnsafe, retainCliCleanupFailures } from "../cli-cleanup-evidence.js";
import type { CleanupCapabilities } from "../services/cleanup.types.js";
import { CliPortProbe, portProbeLayer } from "./port-availability.service.js";
import type { DevLog } from "./dev.types.js";
import type { DevInspector, DevInspectorOptions, EffectDevInspector } from "./dev-process.types.js";
import { captureInspectorOutputEffect, stopInspectorChildEffect } from "./dev-process-output.js";
export type { DevInspector, DevInspectorOptions, EffectDevInspector } from "./dev-process.types.js";

/**
 * Starts a session-owned inspector with joined output fibers and bounded process termination.
 * @param options - Inspector process policy.
 * @param backendPort - Stable backend proxy port.
 * @param log - Existing structured sink.
 * @param spawn - Optional native process factory.
 * @returns A native owner whose release belongs to the caller Scope.
 */
export const startInspectorEffect = Effect.fn("Dev.inspector")(
  function* (
    options: DevInspectorOptions,
    backendPort: number,
    log: DevLog,
    spawn: typeof Bun.spawn = Bun.spawn,
  ) {
    const ports = yield* CliPortProbe;
    const cleanup = yield* CliCleanup;
    yield* cliTry("dev.inspector.options", () => {
      if (!options.command.length) throw new TypeError("Inspector command cannot be empty.");
      if (
        !Number.isSafeInteger(options.port ?? 3210) ||
        (options.port ?? 3210) < 0 ||
        (options.port ?? 3210) > 65_535
      )
        throw new RangeError("Inspector port must be between 0 and 65535.");
      if (
        !Number.isSafeInteger(options.stopTimeoutMs ?? 1_000) ||
        (options.stopTimeoutMs ?? 1_000) < 0
      )
        throw new RangeError("Inspector stop timeout must be a non-negative safe integer.");
    });
    const hostname = options.hostname ?? "127.0.0.1";
    const requested = options.port ?? 3210;
    const port =
      requested === 0
        ? yield* Effect.scoped(
            Effect.gen(function* () {
              const probe = yield* Effect.acquireRelease(
                cliTry("dev.inspector.allocate", () =>
                  Bun.serve({ hostname, port: 0, fetch: () => new Response() }),
                ),
                (probe) =>
                  cleanupEffect(
                    "dev.inspector.probe.close",
                    cliPromise("dev.inspector.probe.close", () => probe.stop(true)),
                  ),
              );
              return yield* cliTry("dev.inspector.port", () => {
                if (probe.port === undefined)
                  throw new Error("Bun did not allocate an inspector port.");
                return probe.port;
              });
            }),
          )
        : (yield* ports.check(requested, hostname, "--inspector-port"), requested);
    const outputScope = yield* Scope.make();
    const closing = yield* Ref.make(false);
    const closed = yield* Deferred.make<void>();
    const child = yield* cliTry("dev.inspector.spawn", () =>
      spawn([...options.command], {
        ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
        env: {
          ...process.env,
          ...options.environment,
          PORT: String(port),
          HOSTNAME: hostname,
          RELKIT_INSPECTOR_PORT: String(port),
          RELKIT_BACKEND_PORT: String(backendPort),
          RELKIT_BACKEND_URL: `http://127.0.0.1:${backendPort}`,
          NEXT_PUBLIC_RELKIT_BACKEND_URL: `http://${hostname}:${port}/_relkit/backend`,
        },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      }),
    );
    const outputs = yield* Effect.forkIn(
      Effect.all(
        [
          captureInspectorOutputEffect(
            child.stdout,
            "stdout",
            options.maxOutputBytes ?? 64 * 1024,
            log,
          ),
          captureInspectorOutputEffect(
            child.stderr,
            "stderr",
            options.maxOutputBytes ?? 64 * 1024,
            log,
          ),
        ],
        { concurrency: 2, discard: true },
      ),
      outputScope,
    );
    const stop = observeCli(
      "dev.inspector.stop",
      Effect.uninterruptible(
        Effect.gen(function* () {
          if (!(yield* Ref.getAndSet(closing, true))) {
            yield* Deferred.complete(
              closed,
              cleanupEffect(
                "dev.inspector.child.release",
                stopInspectorChildEffect(child, options.stopTimeoutMs ?? 1_000),
              ).pipe(
                Effect.andThen(
                  cleanupEffect(
                    "dev.inspector.output.release",
                    Fiber.join(outputs).pipe(
                      Effect.interruptible,
                      Effect.timeoutOption(5_000),
                      Effect.flatMap((result) =>
                        Option.isSome(result)
                          ? Effect.void
                          : cliTry("dev.inspector.output.deadline", () => {
                              throw new Error(
                                "Inspector output did not close within the cleanup deadline.",
                              );
                            }),
                      ),
                    ),
                  ),
                ),
                Effect.ensuring(
                  cleanupEffect("dev.inspector.output.scope", Scope.close(outputScope, Exit.void)),
                ),
                Effect.provideService(CliCleanup, cleanup),
              ),
            );
          }
          yield* Deferred.await(closed);
        }),
      ),
    );
    yield* Effect.addFinalizer(() => stop);
    return Object.freeze({
      port,
      process: child,
      output: observeCli("dev.inspector.output.join", Fiber.join(outputs)),
      stop,
    }) satisfies EffectDevInspector;
  },
  (
    effect,
    _options: DevInspectorOptions,
    _port: number,
    _log: DevLog,
    _spawn: typeof Bun.spawn = Bun.spawn,
  ) => observeCli("dev.inspector.start", effect.pipe(Effect.uninterruptible)),
);

/**
 * Retains the public manually closed inspector owner.
 * @param options - Inspector policy.
 * @param backendPort - Stable backend port.
 * @param log - Existing sink.
 * @param spawn - Optional native process factory.
 * @returns Public Promise facade; callers must stop it.
 */
export async function startInspector(
  options: DevInspectorOptions,
  backendPort: number,
  log: DevLog,
  spawn: typeof Bun.spawn = Bun.spawn,
): Promise<DevInspector> {
  const scope = Scope.makeUnsafe();
  let cleanup: CleanupCapabilities | undefined;
  try {
    const owner = await runCliEffect(
      Effect.gen(function* () {
        cleanup = yield* CliCleanup;
        return yield* startInspectorEffect(options, backendPort, log, spawn);
      }).pipe(Effect.provideService(Scope.Scope, scope)),
      Layer.merge(portProbeLayer, cleanupLayer),
    );
    const facade: DevInspector = {
      port: owner.port,
      process: owner.process,
      output: runCliEffect(owner.output, Layer.empty),
      stop: async () => {
        await runCliEffect(
          Scope.close(scope, Exit.void),
          cleanup ? Layer.succeed(CliCleanup, cleanup) : cleanupLayer,
        );
        if (cleanup) retainCliCleanupFailures(facade, cliCleanupSnapshotUnsafe(cleanup));
      },
    };
    return Object.freeze(facade);
  } catch (error) {
    await runCliEffect(
      cleanupEffect("dev.inspector.acquire.rollback", Scope.close(scope, Exit.void)),
      cleanup ? Layer.succeed(CliCleanup, cleanup) : cleanupLayer,
    );
    if (cleanup) retainCliCleanupFailures(error, cliCleanupSnapshotUnsafe(cleanup));
    throw error;
  }
}
