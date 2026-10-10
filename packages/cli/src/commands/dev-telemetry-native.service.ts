import { createObservabilityStream, ObservabilityQueryError } from "@relkit/observability";
import {
  startLocalWorkerEffect,
  type LocalWorkerError,
  type LocalWorkerEffects,
  type LocalWorkerCommand,
} from "@relkit/observability/local/worker";
import { Cause, Clock, Context, Effect, Exit, Layer } from "effect";
import { cliAdapterError, cliPromise, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import type { TelemetryNativeOperations } from "./dev-telemetry-native.types.js";

/** Native DuckDB/stream/listener authority, substitutable before any resource acquisition. */
export class CliTelemetryNative extends Context.Service<
  CliTelemetryNative,
  TelemetryNativeOperations
>()("relkit/cli/TelemetryNative", {
  make: Effect.sync(
    () =>
      ({
        worker: (failure) =>
          observeCli(
            "dev.telemetry.worker-start",
            startLocalWorkerEffect(failure).pipe(
              Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, workerFailure))),
            ),
          ),
        stream: () =>
          observeCli(
            "dev.telemetry.stream-create",
            cliTry("dev.telemetry.stream-create", () => createObservabilityStream()),
          ),
        listen: telemetryListener,
        closeWorker: (worker) =>
          observeCli("dev.telemetry.worker-close", closeWorkerEffect(worker)),
      }) satisfies TelemetryNativeOperations,
  ),
}) {}

/** Live native factories; construction never opens a process, listener, or stream. */
export const telemetryNativeLayer = Layer.effect(CliTelemetryNative, CliTelemetryNative.make);

/**
 * Acquires a loopback listener whose caller retains its stop operation.
 * @param handler - Owner-captured authenticated ingress callback.
 * @returns Actual listener URL and joined physical stop, without importing DuckDB.
 */
const telemetryListener: TelemetryNativeOperations["listen"] = (handler) =>
  observeCli(
    "dev.telemetry.listen",
    cliTry("dev.telemetry.listen", () => {
      const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        maxRequestBodySize: 2 * 1024 * 1024,
        fetch: handler,
      });
      return {
        url: `http://127.0.0.1:${server.port}`,
        stop: observeCli(
          "dev.telemetry.listener-stop",
          cliPromise("dev.telemetry.listener-stop", () => server.stop(true)).pipe(
            Effect.asVoid,
            Effect.uninterruptible,
          ),
        ),
      };
    }),
  );

/**
 * Restores established public query errors from the native worker's typed failure.
 * @param error - Worker-owned IPC/response diagnostic.
 * @returns Adapter cause with the original public query code and constructor.
 */
function workerFailure(error: LocalWorkerError) {
  return cliAdapterError(
    "dev.telemetry.worker",
    error.code ? new ObservabilityQueryError(error.code, error.message) : new Error(error.message),
  );
}

/**
 * Executes one native IPC command without a Promise workflow wrapper.
 * @param worker - Captured native worker authority.
 * @param command - Existing declared IPC request.
 * @returns Untrusted reply requiring the domain's Schema boundary.
 */
export function telemetryWorkerCall(worker: LocalWorkerEffects, command: LocalWorkerCommand) {
  return observeCli(
    "dev.telemetry.worker-call",
    worker
      .call(command)
      .pipe(Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, workerFailure)))),
  );
}

/**
 * Joins the worker SDK's close acknowledgement and the actual native process exit.
 * @param worker - Scope-owned worker; closing remains the only termination authority.
 * @returns Physical completion or the finite native exit diagnostic.
 */
const closeWorkerEffect = Effect.fn("DevTelemetry.closeWorker")(function* (
  worker: LocalWorkerEffects,
) {
  const closed = yield* Effect.exit(
    worker
      .close()
      .pipe(Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, workerFailure)))),
  );
  const reaped = yield* Effect.exit(
    worker.pid === undefined ? Effect.void : reapWorkerEffect(worker.pid),
  );
  if (Exit.isFailure(closed))
    return yield* Effect.failCause(
      Exit.isFailure(reaped) ? Cause.combine(closed.cause, reaped.cause) : closed.cause,
    );
  if (Exit.isFailure(reaped)) return yield* Effect.failCause(reaped.cause);
});

/**
 * Joins the native worker PID after its IPC owner has requested close.
 * @param pid - Exact acquired worker process identity.
 * @returns Physical exit or a finite reap diagnostic, separate from the IPC close cause.
 */
const reapWorkerEffect = Effect.fn("DevTelemetry.reapWorker")(function* (pid: number) {
  const deadline = (yield* Clock.currentTimeMillis) + 5_000;
  while (true) {
    const alive = yield* cliTry("dev.telemetry.worker-exit", () => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (cause) {
        if (cause instanceof Error && "code" in cause && cause.code === "ESRCH") return false;
        throw cause;
      }
    });
    if (!alive) break;
    if ((yield* Clock.currentTimeMillis) >= deadline)
      return yield* Effect.fail(
        cliAdapterError(
          "dev.telemetry.worker-exit",
          new Error("Telemetry worker did not exit within its cleanup deadline."),
        ),
      );
    yield* Effect.sleep(10);
  }
});
