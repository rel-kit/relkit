/**
 * Admits authenticated early producer records into bounded redacted retention.
 * Ingress remains independent from persistent initialization. Inspector requests
 * receive explicit pending status until their existing canonical handler is ready.
 */
import { Cause, Effect, Ref, Schema } from "effect";
import { mapErrorCause } from "../services/map-error-cause.js";
import { admitObservabilityRecordEffect } from "@relkit/observability";
import { runExecutionPromiseWith, runExecutionSyncWith } from "@relkit/contracts/operation";
import { CliAdapterError, cliAdapterError, cliOriginalError } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { TelemetryRelayBatch } from "./dev-telemetry-relay.schemas.js";
import { isRelayDiagnostic } from "./dev-telemetry-relay-diagnostics.js";
import { streamTypeForRecord } from "./dev-telemetry-stream.js";
import type { ObservabilityRecord } from "@relkit/observability";
import type { LocalLogOrigin } from "@relkit/observability/local/record";
import type { DevTelemetryRelayState } from "./dev-telemetry-relay.types.js";

/**
 * Handles one native producer request using the owning session's captured context.
 * @param state - Session-local retention, authentication and bounded HTTP authority.
 * @param request - Foreign native request; its signal cancels bounded body consumption.
 * @returns Authenticated acceptance, explicit pending status or safe validation failure.
 */
export function telemetryRelayIngress(
  state: DevTelemetryRelayState,
  request: Request,
): Promise<Response> {
  if (request.headers.get("authorization") !== `Bearer ${state.token}`)
    return Promise.resolve(new Response("Unauthorized", { status: 401 }));
  return runExecutionPromiseWith(
    state.context,
    observeCli(
      "dev.telemetry.early-ingress",
      ingress(state, request).pipe(
        Effect.catchCause((cause) => {
          const reason = cause.reasons[0];
          if (
            cause.reasons.length === 1 &&
            reason?._tag === "Fail" &&
            reason.error instanceof CliAdapterError
          )
            return Effect.succeed(
              Response.json({ error: "Invalid telemetry request" }, { status: 400 }),
            );
          return Effect.failCause(cause);
        }),
        mapErrorCause(cliOriginalError),
      ),
    ),
    { signal: request.signal },
  );
}

/**
 * Validates and redacts a batch before acknowledging retained producer identities.
 * @param state - Current session state, never global callback state.
 * @param request - Authenticated native request.
 * @returns Existing producer acknowledgement or pending response; malformed records fail in E.
 */
const ingress = Effect.fn("DevTelemetry.earlyIngress")(function* (
  state: DevTelemetryRelayState,
  request: Request,
) {
  if (Ref.getUnsafe(state.closed)) return new Response("Telemetry is stopping", { status: 503 });
  const path = new URL(request.url).pathname;
  const store = Ref.getUnsafe(state.store);
  if (path !== "/records" || request.method !== "POST") {
    if (store !== undefined) return yield* forwardProducer(state, store.environment, request);
    return new Response("Telemetry storage is starting", { status: 503 });
  }
  const text = yield* state.http.text(
    new Response(request.body, { headers: request.headers }),
    2_097_152,
  );
  const batch = yield* Schema.decodeUnknownEffect(TelemetryRelayBatch)(text).pipe(
    mapErrorCause(() =>
      cliAdapterError("dev.telemetry.batch", new TypeError("Invalid telemetry batch")),
    ),
  );
  yield* Effect.forEach(
    batch.records,
    (entry) => admitRecord(state, entry.record, { key: entry.key, origin: entry.origin }),
    { concurrency: 1, discard: true },
  );
  return Response.json({ ok: true });
});

/**
 * Forwards non-record producer traffic only after canonical support exists.
 * @param state - Captured bounded/cancellable HTTP authority.
 * @param environment - Acquired canonical endpoint and internal token.
 * @param request - Authenticated original producer request.
 * @returns Complete bounded native response with canonical status.
 */
const forwardProducer = Effect.fn("DevTelemetry.forwardProducer")(
  (
    state: DevTelemetryRelayState,
    environment: {
      readonly RELKIT_TELEMETRY_URL: string;
      readonly RELKIT_TELEMETRY_TOKEN: string;
    },
    request: Request,
  ) =>
    Effect.scoped(
      Effect.gen(function* () {
        const response = yield* state.http.request(
          `${environment.RELKIT_TELEMETRY_URL}${new URL(request.url).pathname}`,
          {
            method: request.method,
            headers: { authorization: `Bearer ${environment.RELKIT_TELEMETRY_TOKEN}` },
            ...(request.body === null
              ? {}
              : { body: yield* state.http.text(new Response(request.body), 2_097_152) }),
          },
        );
        return new Response(yield* state.http.text(response, 2_097_152), {
          status: response.status,
          headers: response.headers,
        });
      }),
    ),
);

/**
 * Retains native CLI records synchronously at the logger's existing callback edge.
 * @param state - Owned early retention and native producer sequence.
 * @param record - Model record emitted by the session.
 * @returns No value after redaction/admission; producer identity remains stable during retries.
 */
export function appendRelayRecord(
  state: DevTelemetryRelayState,
  record: ObservabilityRecord,
  origin: LocalLogOrigin = "relkit",
): void {
  if (Ref.getUnsafe(state.closed) || (origin === "relkit" && isRelayDiagnostic(record))) return;
  runExecutionSyncWith(
    state.context,
    Effect.gen(function* () {
      const key = `${state.source}:${yield* Ref.updateAndGet(state.sequence, (previous) => previous + 1)}`;
      yield* admitRecord(state, record, { key, origin });
    }).pipe(
      Effect.catchCause((cause) => state.cleanup.record("dev.telemetry.cli-admission", cause)),
    ),
  );
}

/**
 * Applies current capture/redaction policy before any bounded session retention.
 * @param state - Owning configuration and retention authority.
 * @param record - Owner-validated producer/model record.
 * @param identity - Bounded stable producer key and origin.
 * @returns Admission completion; expected redaction failures retain their typed adapter channel.
 */
const admitRecord = Effect.fn("DevTelemetry.admitEarlyRecord")(
  (
    state: DevTelemetryRelayState,
    record: ObservabilityRecord,
    identity: { readonly key: string; readonly origin: "application" | "relkit" | "inspector" },
  ) =>
    Effect.gen(function* () {
      const config = Ref.getUnsafe(state.configuration);
      if (config.capture?.signals !== undefined && !config.capture.signals.includes(record.signal))
        return;
      const safe = yield* admitObservabilityRecordEffect(record, config.redaction).pipe(
        mapErrorCause((error) => cliAdapterError("dev.telemetry.redact", error)),
      );
      if (safe !== undefined) {
        const admitted = yield* state.buffer
          .admit(safe, identity)
          .pipe(mapErrorCause((error) => cliAdapterError("dev.telemetry.admit", error)));
        const type = admitted === undefined ? undefined : streamTypeForRecord(admitted);
        if (type !== undefined && admitted !== undefined)
          state.stream.publishRecord(type, admitted);
      }
    }),
);
