/**
 * Registers canonical worker, stream, queue and router releases with one owner.
 * Acquisition masking covers only the resource-to-finalizer transfer. DuckDB's
 * native library is imported exclusively by the isolated Node worker.
 */
import { Cause, Effect, MutableRef, Ref } from "effect";
import { mapErrorCause } from "../services/map-error-cause.js";
import { runExecutionPromiseWith } from "@relkit/contracts/operation";
import { makeLocalBatchQueueEffect } from "@relkit/observability/local/queue";
import { cliAdapterError, cliOriginalError, cliPromise, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { telemetryWorkerCall } from "./dev-telemetry-native.service.js";
import { decodeTelemetry } from "./dev-telemetry-store.js";
import { telemetryImportSchema } from "./dev-telemetry.schemas.js";
import { telemetryOpenFailure } from "./dev-telemetry-error.js";
import type { Context } from "effect";
import type { CliCleanup } from "../services/cleanup.service.js";
import type {
  ObservabilityQuery,
  ObservabilityStream,
  TelemetryConfiguration,
} from "@relkit/observability";
import type { LocalRecord } from "@relkit/observability/local/record";
import type { CliAdapterError } from "../cli-errors.js";
import type { TelemetryState } from "./dev-telemetry.types.js";
import type { TelemetryNativeOperations } from "./dev-telemetry-native.types.js";
import type { TelemetryLifetime } from "./dev-telemetry-acquisition.types.js";
import type { telemetryFailureCallback } from "./dev-telemetry-state.js";

/** Opens the registered worker; a failed open leaves its physical release owned. */
export const acquireTelemetryWorker = Effect.fn("DevTelemetry.acquireWorker")(
  function* (
    lifetime: TelemetryLifetime,
    native: TelemetryNativeOperations,
    root: string,
    config: TelemetryConfiguration,
    failure: ReturnType<typeof telemetryFailureCallback>,
  ) {
    const worker = yield* Effect.uninterruptible(
      Effect.gen(function* () {
        const value = yield* native.worker(failure);
        yield* lifetime.register("dev.telemetry.worker.release", native.closeWorker(value));
        return value;
      }),
    );
    const imported = yield* telemetryWorkerCall(worker, {
      type: "open",
      root,
      ...(config.localRetention ? { retention: config.localRetention } : {}),
      ...(config.redaction ? { redaction: config.redaction } : {}),
    }).pipe(
      Effect.flatMap((value) => decodeTelemetry(telemetryImportSchema, value)),
      Effect.catchCause((cause) =>
        Effect.failCause(
          Cause.map(cause, (error) =>
            cliAdapterError(
              "dev.telemetry.open",
              telemetryOpenFailure(root, cliOriginalError(error)),
            ),
          ),
        ),
      ),
    );
    return { worker, imported };
  },
  (effect) => observeCli("dev.telemetry.acquire-worker", effect),
);

/** Acquires one stream and installs its exactly-once synchronous close edge. */
export const acquireTelemetryStream = Effect.fn("DevTelemetry.acquireStream")(
  (lifetime: TelemetryLifetime, native: TelemetryNativeOperations, state: TelemetryState) =>
    observeCli(
      "dev.telemetry.acquire-stream",
      Effect.uninterruptible(
        Effect.gen(function* () {
          const value = yield* native.stream();
          const close = (): void => {
            if (Ref.getUnsafe(state.streamClosed)) return;
            MutableRef.set(state.streamClosed.ref, true);
            value.close();
          };
          yield* Ref.set(lifetime.streamClose, close);
          yield* lifetime.register(
            "dev.telemetry.stream.release",
            cliTry("dev.telemetry.stream.release", close),
          );
          return value;
        }),
      ),
    ),
);

/** Registers the bounded canonical queue before any producer can enqueue records. */
export const acquireTelemetryQueue = Effect.fn("DevTelemetry.acquireQueue")(
  (
    lifetime: TelemetryLifetime,
    context: Context.Context<CliCleanup>,
    append: (records: readonly LocalRecord[]) => Effect.Effect<void, CliAdapterError>,
    failure: ReturnType<typeof telemetryFailureCallback>,
  ) =>
    observeCli(
      "dev.telemetry.acquire-queue",
      Effect.uninterruptible(
        Effect.gen(function* () {
          const value = yield* makeLocalBatchQueueEffect(
            (records, signal) =>
              runExecutionPromiseWith(
                context,
                append(records).pipe(mapErrorCause(cliOriginalError)),
                signal === undefined ? undefined : { signal },
              ),
            failure,
          );
          yield* lifetime.register("dev.telemetry.queue.release", value.close());
          return value;
        }),
      ),
    ),
);

/** Registers inspector endpoints whose consumers close before the worker retires. */
export const acquireTelemetryRouter = Effect.fn("DevTelemetry.acquireRouter")(
  (lifetime: TelemetryLifetime, query: ObservabilityQuery, stream: ObservabilityStream) =>
    observeCli(
      "dev.telemetry.acquire-router",
      Effect.uninterruptible(
        Effect.gen(function* () {
          const [hono, inspector] = yield* cliPromise("dev.telemetry.inspector.import", () =>
            Promise.all([import("hono"), import("@relkit/inspector-api")]),
          );
          const router = yield* cliTry("dev.telemetry.inspector", () => {
            const value = new hono.Hono();
            inspector.installObservabilityEndpoints(value, { query, stream });
            return value;
          });
          yield* lifetime.register(
            "dev.telemetry.inspector.release",
            cliPromise("dev.telemetry.inspector.release", () =>
              inspector.disposeInspectorEndpoints(router),
            ),
          );
          return router;
        }),
      ),
    ),
);
