import { resolve } from "node:path";
import { Hono } from "hono";
import { installObservabilityEndpoints, disposeInspectorEndpoints } from "@relkit/inspector-api";
import {
  admitObservabilityRecordEffect,
  normalizeTelemetryConfigurationEffect,
  type TelemetryConfiguration,
  type ObservabilityRecord,
} from "@relkit/observability";
import { makeLocalBatchQueueEffect, type LocalLogOrigin } from "@relkit/observability/local";
import { Effect, MutableRef, Ref } from "effect";
import { runExecutionPromiseWith, runExecutionSyncWith } from "@relkit/contracts/operation";
import { cliAdapterError, cliOriginalError, cliPromise, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliCleanup } from "../services/cleanup.service.js";
import { CliTelemetryNative, telemetryWorkerCall } from "./dev-telemetry-native.service.js";
import { telemetryLifetimeEffect } from "./dev-telemetry-lifetime.js";
import { telemetryStateEffect, telemetryFailureCallback } from "./dev-telemetry-state.js";
import {
  decodeTelemetry,
  telemetryAppendEffect,
  telemetryConfigureEffect,
} from "./dev-telemetry-store.js";
import { telemetryImportSchema } from "./dev-telemetry.schemas.js";
import { telemetryQuery } from "./dev-telemetry-query.js";
import { collectProducerStatus } from "./dev-telemetry-status.js";
import { telemetryOpenFailure } from "./dev-telemetry-error.js";
import {
  telemetryRequestAccess,
  telemetryServeEffect,
  telemetryUnauthorized,
} from "./dev-telemetry-http.js";
import type { DevTelemetryEffects, TelemetryStatus } from "./dev-telemetry.types.js";

/**
 * Acquires telemetry as native domain work in the caller's explicit scope.
 * @param projectRoot - Existing application root.
 * @param configuration - Initial model-owner settings.
 * @param onFailure - Existing best-effort error notification.
 * @returns Owned public/native handle; callbacks reuse the captured context.
 * @remarks Every acquired resource has one explicit release owner.
 */
export const makeDevTelemetryEffect = Effect.fn("DevTelemetry.acquire")(
  function* (
    projectRoot: string,
    configuration: TelemetryConfiguration = {},
    onFailure: (error: Error) => void = () => undefined,
  ) {
    const lifetime = yield* telemetryLifetimeEffect();
    return yield* Effect.gen(function* () {
      const native = yield* CliTelemetryNative;
      const config = yield* normalizeTelemetryConfigurationEffect(configuration).pipe(
        Effect.mapError((error) =>
          cliAdapterError("dev.telemetry.configuration", new TypeError(error.message)),
        ),
      );
      const state = yield* telemetryStateEffect(config);
      const failure = telemetryFailureCallback(state, onFailure);
      const context = yield* Effect.context<CliCleanup>();
      const root = resolve(
        projectRoot,
        process.env.RELKIT_OBSERVABILITY_ROOT ?? ".relkit/observability",
      );
      const token = yield* cliTry("dev.telemetry.token", () => crypto.randomUUID());
      const source = yield* cliTry("dev.telemetry.source", () => crypto.randomUUID());
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
        Effect.mapError((error) =>
          cliAdapterError(
            "dev.telemetry.open",
            telemetryOpenFailure(root, cliOriginalError(error)),
          ),
        ),
      );
      const stream = yield* Effect.uninterruptible(
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
      );
      const append = telemetryAppendEffect(worker, stream, state, failure);
      const queue = yield* Effect.uninterruptible(
        Effect.gen(function* () {
          const value = yield* makeLocalBatchQueueEffect(
            (records, signal) =>
              runExecutionPromiseWith(
                context,
                append(records).pipe(Effect.mapError(cliOriginalError)),
                signal === undefined ? undefined : { signal },
              ),
            failure,
          );
          yield* lifetime.register("dev.telemetry.queue.release", value.close());
          return value;
        }),
      );
      const query = telemetryQuery(worker, context);
      const app = yield* Effect.uninterruptible(
        Effect.gen(function* () {
          const router = yield* cliTry("dev.telemetry.inspector", () => {
            const value = new Hono();
            installObservabilityEndpoints(value, { query, stream });
            return value;
          });
          yield* lifetime.register(
            "dev.telemetry.inspector.release",
            cliPromise("dev.telemetry.inspector.release", () => disposeInspectorEndpoints(router)),
          );
          return router;
        }),
      );
      const producers = collectProducerStatus();
      const status = (): TelemetryStatus => {
        const producer = producers.snapshot();
        const stats = runExecutionSyncWith(context, queue.stats());
        const error = Ref.getUnsafe(state.error);
        return {
          protocol: "relkit.observability.query",
          version: 1,
          state: error || producer.failed || producer.dropped ? "degraded" : "ready",
          error,
          persisted: Ref.getUnsafe(state.committed),
          failed: stats.failed + producer.failed,
          dropped: stats.dropped + producer.dropped,
          root,
        };
      };
      // The worker is session-owned: a disconnected HTTP consumer cannot abort its IPC owner.
      // Inspector SSE separately consumes the original request signal for its live feed.
      const serve = (request: Request) =>
        runExecutionPromiseWith(
          context,
          telemetryServeEffect(request, {
            report: producers.report,
            status,
            append,
            flush: queue.flush(),
            api: (input) => app.fetch(input),
          }).pipe(Effect.mapError(cliOriginalError)),
        );
      const server = yield* Effect.uninterruptible(
        Effect.gen(function* () {
          const value = yield* native.listen((request) =>
            request.headers.get("authorization") === `Bearer ${token}`
              ? serve(request)
              : Promise.resolve(new Response("Unauthorized", { status: 401 })),
          );
          yield* lifetime.register("dev.telemetry.listener.release", value.stop);
          return value;
        }),
      );
      const configure = telemetryConfigureEffect(worker, state, failure);
      const handle: DevTelemetryEffects = {
        imported,
        root,
        query,
        status,
        closeStream: Ref.getUnsafe(lifetime.streamClose),
        environment: { RELKIT_TELEMETRY_URL: server.url, RELKIT_TELEMETRY_TOKEN: token },
        append: (record: ObservabilityRecord, origin: LocalLogOrigin = "relkit") =>
          runExecutionSyncWith(
            context,
            observeCli(
              "dev.telemetry.enqueue",
              Effect.gen(function* () {
                const current = yield* Ref.get(state.configuration);
                if (current.capture?.signals && !current.capture.signals.includes(record.signal))
                  return;
                const safe = yield* admitObservabilityRecordEffect(record, current.redaction);
                if (!safe) return;
                const sequence = yield* Ref.updateAndGet(
                  state.sequence,
                  (previous) => previous + 1,
                );
                yield* queue.enqueue({ key: `${source}:${sequence}`, origin, record: safe });
              }),
            ),
          ),
        configureEffect: configure,
        configure: (next) =>
          runExecutionPromiseWith(context, configure(next).pipe(Effect.mapError(cliOriginalError))),
        handle: (request) => {
          const access = telemetryRequestAccess(request);
          return access === undefined
            ? undefined
            : access
              ? serve(request)
              : Promise.resolve(telemetryUnauthorized());
        },
        closeEffect: lifetime.close,
        close: () => runExecutionPromiseWith(context, lifetime.close),
      };
      return handle;
    }).pipe(Effect.onError(() => lifetime.close));
  },
  (effect) => observeCli("dev.telemetry.acquire", effect),
);
