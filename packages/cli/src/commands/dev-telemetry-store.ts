import { Effect, Ref, Schema } from "effect";
import {
  admitObservabilityRecordEffect,
  normalizeTelemetryConfigurationEffect,
  type TelemetryConfiguration,
} from "@relkit/observability";
import type { LocalRecord, LocalWorkerEffects } from "@relkit/observability/local";
import { cliAdapterError, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { telemetryEnvelopeSchema, telemetryStoredSchema } from "./dev-telemetry.schemas.js";
import { telemetryWorkerCall } from "./dev-telemetry-native.service.js";
import { streamTypeForRecord } from "./dev-telemetry-stream.js";
import type { ObservabilityStream } from "@relkit/observability";
import type { TelemetryState } from "./dev-telemetry.types.js";

/**
 * Persists an ordered bounded batch after owner validation and redaction.
 * @param worker - Scope-owned IPC authority.
 * @param stream - Scope-owned Inspector stream.
 * @param state - Session-owned counts and policy.
 * @param failure - Best-effort notification after state publication.
 * @returns Native append operation; transient failures are never cached.
 */
export function telemetryAppendEffect(
  worker: LocalWorkerEffects,
  stream: ObservabilityStream,
  state: TelemetryState,
  failure: (reason: unknown) => void,
) {
  return Effect.fn("DevTelemetry.append")(
    function* (records: readonly LocalRecord[]) {
      const config = yield* Ref.get(state.configuration);
      const safe = yield* Effect.forEach(records, (item) =>
        Effect.gen(function* () {
          const envelope = yield* decodeTelemetry(telemetryEnvelopeSchema, item);
          const record = yield* admitObservabilityRecordEffect(
            envelope.record,
            config.redaction,
          ).pipe(
            Effect.mapError((error) =>
              cliAdapterError("dev.telemetry.record", new TypeError(error.message)),
            ),
          );
          if (!record)
            return yield* Effect.fail(
              cliAdapterError("dev.telemetry.record", new TypeError("Invalid telemetry record")),
            );
          return { ...envelope, record };
        }),
      );
      const reply = yield* telemetryWorkerCall(worker, { type: "append", records: safe });
      const stored = yield* decodeTelemetry(Schema.Array(telemetryStoredSchema), reply);
      yield* Ref.update(state.committed, (count) => count + stored.length);
      yield* cliTry("dev.telemetry.publish", () => {
        for (const record of stored) {
          const type = streamTypeForRecord(record);
          if (type && !Ref.getUnsafe(state.streamClosed)) stream.publishRecord(type, record);
        }
      });
    },
    (effect) =>
      observeCli("dev.telemetry.append", effect).pipe(
        Effect.tapError((error) => Effect.sync(() => failure(error.cause))),
      ),
  );
}

/**
 * Applies native retention after policy normalization, preserving existing failure reporting.
 * @param worker - Current worker authority.
 * @param state - Current session state.
 * @param failure - Existing best-effort failure sink.
 * @returns Native configure operation; invalid settings fail before mutation.
 */
export function telemetryConfigureEffect(
  worker: LocalWorkerEffects,
  state: TelemetryState,
  failure: (reason: unknown) => void,
) {
  return Effect.fn("DevTelemetry.configure")(
    function* (configuration: TelemetryConfiguration) {
      const next = yield* normalizeTelemetryConfigurationEffect(configuration).pipe(
        Effect.mapError((error) =>
          cliAdapterError("dev.telemetry.configure", new TypeError(error.message)),
        ),
      );
      yield* Ref.set(state.configuration, next);
      yield* telemetryWorkerCall(worker, {
        type: "retention",
        retention: next.localRetention ?? {},
        ...(next.redaction ? { redaction: next.redaction } : {}),
      }).pipe(
        Effect.catchTag("CliAdapterError", (error) => Effect.sync(() => failure(error.cause))),
      );
    },
    (effect) => observeCli("dev.telemetry.configure", effect),
  );
}

/**
 * Decodes untrusted transport values without manufacturing model authority.
 * @typeParam S - Declared boundary Schema.
 * @param schema - Existing protocol/model shape.
 * @param value - Unknown native transport value.
 * @returns Owner-validated value or the original TypeError compatibility category.
 */
export function decodeTelemetry<S extends Schema.Top & { readonly DecodingServices: never }>(
  schema: S,
  value: unknown,
) {
  return Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError((error) =>
      cliAdapterError("dev.telemetry.schema", new TypeError(error.message)),
    ),
  );
}
