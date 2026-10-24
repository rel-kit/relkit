/**
 * Retains redacted diagnostic records independently of UI, history and exporters.
 * Collection is finite pull batches, so no subscriber queue can grow behind a
 * slow tool. Only an authenticated durable ACK retires a captured prefix.
 */
import { Context, Effect, Ref, Schema } from "effect";
import { EarlyRetention, type EarlyRetentionOperations } from "@relkit/observability/early";
import {
  admitObservabilityRecordEffect,
  normalizeTelemetryConfigurationEffect,
} from "@relkit/observability";
import { validateLocalRecord, type LocalRecord } from "@relkit/observability/local/record";
import type { ObservabilityRecord, TelemetryConfiguration } from "@relkit/observability";
import type { InspectionCaptureOperations } from "./capture.types.js";
import { readInspectionBody } from "./bridge-body.js";
import { InspectionConnectionError } from "./connection-error.js";
import { observeExecution } from "@relkit/contracts/operation";
import { collectCapture } from "./capture-collection.js";
import { makeCaptureLoss } from "./capture-loss.js";

const envelope = Schema.declare<LocalRecord>((value): value is LocalRecord => {
  try {
    validateLocalRecord(value);
    return true;
  } catch (cause) {
    if (cause instanceof TypeError) return false;
    throw cause;
  }
});
const producerBatch = Schema.fromJsonString(
  Schema.Struct({ records: Schema.Array(envelope).check(Schema.isMaxLength(256)) }),
);

/** Fresh session capture; make never touches history or loads a database module. */
export class InspectionCapture extends Context.Service<
  InspectionCapture,
  InspectionCaptureOperations
>()("relkit/inspection/Capture", {
  make: (configuration: TelemetryConfiguration) =>
    Effect.gen(function* () {
      const policy = yield* normalizeTelemetryConfigurationEffect(configuration).pipe(
        Effect.mapError(failure),
      );
      const current = yield* Ref.make(policy);
      const buffer = yield* EarlyRetention.make(retentionOptions(policy)).pipe(
        Effect.mapError(failure),
      );
      const closed = yield* Ref.make(false);
      const incomplete = yield* Ref.make(false);
      const append = captureAppender(Ref.get(current), Ref.get(closed), buffer);
      const loss = yield* makeCaptureLoss(append);
      return {
        append,
        records: (request) =>
          Effect.gen(function* () {
            const failed = yield* Ref.get(incomplete);
            const counters = yield* loss.status;
            return yield* collectCapture(buffer, request, failed, counters);
          }),
        producer: (request) =>
          observeExecution(
            "inspector",
            "capture.ingress",
            new URL(request.url).pathname === "/producer-status" && request.method === "POST"
              ? loss.report(request)
              : producerRequest(append, request),
            () => ({}),
          ),
        configure: (next) =>
          Effect.gen(function* () {
            const config = yield* normalizeTelemetryConfigurationEffect(next).pipe(
              Effect.mapError(failure),
            );
            yield* buffer.configure(retentionOptions(config)).pipe(Effect.mapError(failure));
            yield* Ref.set(current, config);
          }),
        close: Ref.set(closed, true),
        markIncomplete: Ref.set(incomplete, true),
      } satisfies InspectionCaptureOperations;
    }),
}) {}

/** Keeps producer deduplication bounded and borrows the caller's observation context. */
function captureAppender(
  configuration: Effect.Effect<TelemetryConfiguration>,
  closed: Effect.Effect<boolean>,
  buffer: EarlyRetentionOperations,
): InspectionCaptureOperations["append"] {
  const seen = new Set<string>();
  return (record, identity) =>
    observeExecution(
      "inspector",
      "capture.admit",
      Effect.gen(function* () {
        const config = yield* configuration;
        if (yield* closed) return;
        if (config.capture?.signals && !config.capture.signals.includes(record.signal)) return;
        if (identity && seen.has(identity.key)) return;
        const safe = yield* admitObservabilityRecordEffect(record, config.redaction).pipe(
          Effect.mapError(failure),
        );
        if (safe === undefined) return;
        yield* buffer.admit(safe, identity).pipe(Effect.mapError(failure));
        if (identity) {
          seen.add(identity.key);
          if (seen.size > 2048) seen.delete(seen.values().next().value!);
        }
      }),
      () => ({ records: 1 }),
    );
}

/** Shares validated count/byte/redaction policy with the existing retention owner. */
function retentionOptions(config: TelemetryConfiguration) {
  return {
    ...config.localRetention,
    ...(config.redaction === undefined ? {} : { redaction: config.redaction }),
  };
}

/** Converts only declared support failures; defects and interruption retain their channels. */
function failure<Cause extends Error>(cause: Cause): InspectionConnectionError {
  return new InspectionConnectionError({ operation: "capture.invalid", cause });
}

/** Validates foreign producer envelopes before their records reach capture. */
const producerRequest = Effect.fn("Inspection.producer")(function* (
  append: InspectionCaptureOperations["append"],
  request: Request,
) {
  if (new URL(request.url).pathname !== "/records" || request.method !== "POST")
    return new Response("Not found", { status: 404 });
  const bytes = yield* readInspectionBody(request);
  const batch = yield* Schema.decodeUnknownEffect(producerBatch)(
    new TextDecoder().decode(bytes),
  ).pipe(Effect.mapError(failure));
  yield* Effect.forEach(
    batch.records,
    (entry) => append(entry.record, { key: entry.key, origin: entry.origin }),
    { concurrency: 1, discard: true },
  );
  return Response.json({ ok: true, durability: "memory" });
});
