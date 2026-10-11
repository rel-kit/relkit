/**
 * Projects acquired canonical storage into the existing native development API.
 * Callback execution borrows the owner's context; listener acquisition and close
 * remain registered with the same Scope. No callback creates a new resource graph.
 */
import { Effect, Ref } from "effect";
import { mapErrorCause } from "../services/map-error-cause.js";
import { admitObservabilityRecordEffect } from "@relkit/observability";
import { runExecutionPromiseWith, runExecutionSyncWith } from "@relkit/contracts/operation";
import { cliOriginalError } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { telemetryConfigureEffect } from "./dev-telemetry-store.js";
import { collectProducerStatus } from "./dev-telemetry-status.js";
import {
  telemetryRequestAccess,
  telemetryServeEffect,
  telemetryUnauthorized,
} from "./dev-telemetry-http.js";
import type { TelemetryCore, TelemetryLifetime } from "./dev-telemetry-acquisition.types.js";
import type { DevTelemetryEffects, TelemetryStatus } from "./dev-telemetry.types.js";
import type { ObservabilityRecord } from "@relkit/observability";
import type { LocalLogOrigin } from "@relkit/observability/local/record";

/**
 * Registers ingress after its store, stream, queue and endpoints have been acquired.
 * @param core - Existing validated canonical resources.
 * @param lifetime - The same Scope that owns the worker and queue.
 * @returns Compatible development telemetry handle with exactly one release owner.
 */
export const acquireTelemetryFacade = Effect.fn("DevTelemetry.acquireFacade")(
  (core: TelemetryCore, lifetime: TelemetryLifetime) =>
    observeCli(
      "dev.telemetry.acquire-facade",
      Effect.gen(function* () {
        const producers = collectProducerStatus();
        const status = telemetryStatus(core, producers);
        // Native worker IPC belongs to its session; query disconnection cannot abort it.
        const serve = (request: Request) =>
          runExecutionPromiseWith(
            core.context,
            telemetryServeEffect(request, {
              report: producers.report,
              status,
              append: core.append,
              flush: core.queue.flush(),
              api: (input) => core.app.fetch(input),
            }).pipe(mapErrorCause(cliOriginalError)),
          );
        const server = yield* Effect.uninterruptible(
          Effect.gen(function* () {
            const value = yield* core.native.listen((request) => {
              if (request.headers.get("authorization") !== `Bearer ${core.token}`)
                return Promise.resolve(new Response("Unauthorized", { status: 401 }));
              return serve(request);
            });
            yield* lifetime.register("dev.telemetry.listener.release", value.stop);
            return value;
          }),
        );
        return telemetryPublicHandle(core, lifetime, server.url, status, serve);
      }),
    ),
);

/**
 * Reads canonical and producer counters without changing resource ownership.
 * @param core - Acquired state and synchronous queue projection.
 * @param producers - Existing per-session producer status authority.
 * @returns Native status callback reused by public and internal endpoints.
 */
function telemetryStatus(
  core: TelemetryCore,
  producers: ReturnType<typeof collectProducerStatus>,
): () => TelemetryStatus {
  return () => {
    const producer = producers.snapshot();
    const stats = runExecutionSyncWith(core.context, core.queue.stats());
    const error = Ref.getUnsafe(core.state.error);
    return {
      protocol: "relkit.observability.query",
      version: 1,
      state: error || producer.failed || producer.dropped ? "degraded" : "ready",
      error,
      persisted: Ref.getUnsafe(core.state.committed),
      failed: stats.failed + producer.failed,
      dropped: stats.dropped + producer.dropped,
      root: core.root,
    };
  };
}

/**
 * Constructs thin native callbacks over already acquired persistent resources.
 * @param core - Canonical storage and supplied execution context.
 * @param lifetime - Existing idempotent close authority.
 * @param url - Actual loopback listener address.
 * @param status - Shared canonical status projection.
 * @param serve - Owner-bound request runner; request streaming retains its original signal.
 * @returns Existing public callback shape; no listener or worker is opened here.
 */
function telemetryPublicHandle(
  core: TelemetryCore,
  lifetime: TelemetryLifetime,
  url: string,
  status: () => TelemetryStatus,
  serve: (request: Request) => Promise<Response>,
): DevTelemetryEffects {
  const configure = telemetryConfigureEffect(core.worker, core.state, core.failure);
  return {
    imported: core.imported,
    root: core.root,
    query: core.query,
    status,
    closeStream: Ref.getUnsafe(lifetime.streamClose),
    environment: { RELKIT_TELEMETRY_URL: url, RELKIT_TELEMETRY_TOKEN: core.token },
    append: (record, origin) => appendCliTelemetry(core, record, origin ?? "relkit"),
    configureEffect: configure,
    configure: (next) =>
      runExecutionPromiseWith(core.context, configure(next).pipe(mapErrorCause(cliOriginalError))),
    handle: (request) => {
      const access = telemetryRequestAccess(request);
      if (access === undefined) return;
      if (!access) return Promise.resolve(telemetryUnauthorized());
      return serve(request);
    },
    closeEffect: lifetime.close,
    close: () => runExecutionPromiseWith(core.context, lifetime.close),
  };
}

/**
 * Applies current policy before synchronous admission at the logger callback edge.
 * @param core - Canonical producer sequence, captured context and queue.
 * @param record - Owner-created model record.
 * @param origin - Declared process origin.
 * @returns Nothing after admission; persistence remains the queue's owned operation.
 */
function appendCliTelemetry(
  core: TelemetryCore,
  record: ObservabilityRecord,
  origin: LocalLogOrigin,
): void {
  runExecutionSyncWith(
    core.context,
    observeCli(
      "dev.telemetry.enqueue",
      Effect.gen(function* () {
        const current = yield* Ref.get(core.state.configuration);
        if (current.capture?.signals && !current.capture.signals.includes(record.signal)) return;
        const safe = yield* admitObservabilityRecordEffect(record, current.redaction);
        if (!safe) return;
        const sequence = yield* Ref.updateAndGet(core.state.sequence, (previous) => previous + 1);
        yield* core.queue.enqueue({ key: `${core.source}:${sequence}`, origin, record: safe });
      }),
    ),
  );
}
