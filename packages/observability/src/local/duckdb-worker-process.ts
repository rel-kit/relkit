import { Effect, Exit, Scope } from "effect";
import { makeDuckdbWorkerEffect } from "./duckdb-worker-effect.js";
import { duckdbDriverLayer } from "./duckdb-driver.js";
import { DuckdbQueryError } from "./duckdb-query-error.js";
import { observeDuckdb } from "./duckdb-metrics.js";
import type { DuckdbWorkerMessage } from "./duckdb-worker-process.types.js";
/**
 * Registers IPC, signal, disconnect, and maintenance resources in one Scope.
 * The process entrypoint keeps that Scope alive until disconnect.
 *
 * @returns An Effect completing when listeners and timer are registered.
 * @example
 * yield* startDuckdbWorkerProcessEffect();
 */
export const startDuckdbWorkerProcessEffect = Effect.fn("ObservabilityDuckdb.worker.process")(
  function* () {
    return yield* observeDuckdb(
      "worker-process",
      Effect.gen(function* () {
        const scope = yield* Scope.Scope;
        const worker = yield* Effect.acquireRelease(
          makeDuckdbWorkerEffect().pipe(Effect.provide(duckdbDriverLayer)),
          (owned) => Effect.ignore(owned.close()),
        );
        let opened = false;
        const message = (envelope: DuckdbWorkerMessage): void => {
          void Effect.runPromise(worker.execute(envelope.command))
            .then(
              (value) => {
                if (envelope.command.type === "open") opened = true;
                if (envelope.command.type === "close") opened = false;
                process.send?.({ id: envelope.id, value });
                if (envelope.command.type === "close") process.disconnect?.();
              },
              (error: unknown) => {
                process.send?.({
                  id: envelope.id,
                  error: error instanceof Error ? error.message : String(error),
                  ...(error instanceof DuckdbQueryError ? { code: error.code } : {}),
                });
              },
            )
            .catch(() => {
              process.exitCode = 1;
              try {
                process.disconnect?.();
              } catch {
                /* The IPC channel may already be gone. */
              }
            });
        };
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            process.on("message", message);
            return message;
          }),
          (owned) =>
            Effect.sync(() => {
              process.off("message", owned);
            }),
        );
        const sigint = (): void => undefined;
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            process.on("SIGINT", sigint);
            return sigint;
          }),
          (owned) =>
            Effect.sync(() => {
              process.off("SIGINT", owned);
            }),
        );
        const disconnect = (): void => {
          void Effect.runPromise(Scope.close(scope, Exit.void)).then(
            () => process.exit(),
            () => process.exit(1),
          );
        };
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            process.on("disconnect", disconnect);
            return disconnect;
          }),
          (owned) =>
            Effect.sync(() => {
              process.off("disconnect", owned);
            }),
        );
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            const timer = setInterval(() => {
              if (!opened) return;
              void Effect.runPromise(worker.execute({ type: "flush" })).catch((error: unknown) => {
                process.send?.({
                  id: 0,
                  fatal: true,
                  error: `Telemetry cleanup failed: ${String(error)}`,
                });
                process.exitCode = 1;
                process.disconnect?.();
              });
            }, 60_000);
            timer.unref();
            return timer;
          }),
          (timer) =>
            Effect.sync(() => {
              clearInterval(timer);
            }),
        );
      }),
    );
  },
);
