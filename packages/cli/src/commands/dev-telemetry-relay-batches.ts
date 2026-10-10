/** Owns ordered idempotent early persistence and bounded shutdown flushing. */
import { Cause, Effect, Exit } from "effect";
import { mapErrorCause } from "../services/map-error-cause.js";
import { CliAdapterError, cliAdapterError } from "../cli-errors.js";
import type { EarlyRetainedRecord } from "@relkit/observability/early";
import type { DevTelemetryEffects } from "./dev-telemetry.types.js";
import type { DevTelemetryRelayState } from "./dev-telemetry-relay.types.js";

/**
 * Retries only a singleton expected persistence failure using stable producer keys.
 * @param state - Session buffer and captured HTTP authority.
 * @param store - Acquired canonical idempotent persistent endpoint.
 * @param batch - Immutable prefix reused byte-for-byte across at most three attempts.
 * @returns Complete acknowledgement within five seconds; mixed Causes never retry.
 */
export const commitEarlyBatch = Effect.fn("DevTelemetry.commitEarlyBatch")(
  (
    state: DevTelemetryRelayState,
    store: DevTelemetryEffects,
    batch: readonly EarlyRetainedRecord[],
  ) =>
    Effect.gen(function* () {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const result = yield* Effect.exit(persistBatch(state, store, batch));
        if (Exit.isSuccess(result)) return;
        const reason = result.cause.reasons[0];
        if (
          attempt === 3 ||
          result.cause.reasons.length !== 1 ||
          reason?._tag !== "Fail" ||
          !(reason.error instanceof CliAdapterError)
        )
          return yield* Effect.failCause(result.cause);
        yield* Effect.logWarning("Retrying acknowledged-key telemetry batch", { attempt });
        yield* Effect.sleep(25);
      }
    }).pipe(
      Effect.timeout(5_000),
      Effect.catchCause((cause) => Effect.failCause(normalizeBatchCause(cause))),
    ),
);

/**
 * Commits a stable producer batch before advancing its retention cursor.
 * @param state - Captured HTTP authority and session producer identity.
 * @param store - Acquired canonical storage endpoint, not the early relay itself.
 * @param batch - Immutable redacted prefix; later arrivals cannot mutate it.
 * @returns Complete persistent acknowledgement; ambiguous responses never retire the prefix.
 */
const persistBatch = Effect.fn("DevTelemetry.persistEarlyBatch")(
  (
    state: DevTelemetryRelayState,
    store: DevTelemetryEffects,
    batch: readonly EarlyRetainedRecord[],
  ) =>
    Effect.scoped(
      Effect.gen(function* () {
        const records = batch.map((entry) => ({
          ...(entry.identity ?? {
            key: `${state.source}:${entry.sequence}`,
            origin: "relkit" as const,
          }),
          record: entry.record,
        }));
        const response = yield* state.http.request(
          `${store.environment.RELKIT_TELEMETRY_URL}/records`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${store.environment.RELKIT_TELEMETRY_TOKEN}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ records }),
          },
        );
        const body = yield* state.http.text(response, 65_536);
        if (response.status !== 200 || body !== '{"ok":true}')
          return yield* cliAdapterError(
            "dev.telemetry.handoff-response",
            new Error("Persistence did not acknowledge the early batch."),
          );
      }),
    ).pipe(
      Effect.timeout(5_000),
      Effect.catchCause((cause) => Effect.failCause(normalizeBatchCause(cause))),
    ),
);

/**
 * Drains the remaining finite queue before canonical storage's Scope closes.
 * @param state - Session ingress buffer after backend producer shutdown.
 * @param store - Still-owned canonical store and idempotent transport identity.
 * @returns Bounded physical persistence or a retained timeout/failure; no queued prefix is discarded.
 */
export const flushEarlyRecords = Effect.fn("DevTelemetry.flushEarlyRecords")(
  (state: DevTelemetryRelayState, store: DevTelemetryEffects) =>
    Effect.gen(function* () {
      while (true) {
        const batch = (yield* state.buffer.snapshot()).slice(0, 256);
        if (batch.length === 0) return;
        yield* commitEarlyBatch(state, store, batch);
        yield* retireBatch(state, batch);
      }
    }).pipe(Effect.timeout(5_000)),
);

/**
 * Retires only the immutable batch whose complete persistent response was accepted.
 * @param state - Current retention state, including concurrent later admissions.
 * @param batch - Complete acknowledged prefix.
 * @returns Cursor receipt; a malformed cursor retains its typed failure evidence.
 */
export function retireBatch(state: DevTelemetryRelayState, batch: readonly EarlyRetainedRecord[]) {
  const last = batch.at(-1);
  if (last === undefined) return Effect.void;
  return state.buffer
    .acknowledge(last.sequence)
    .pipe(mapErrorCause((error) => cliAdapterError("dev.telemetry.handoff-cursor", error)));
}

/**
 * Translates timeout failures while retaining every defect and interruption sibling.
 * @param cause - Complete batch/timeout Cause, never a typed failure extracted from it.
 * @returns Precise adapter failures without changing existing error identities or sibling reasons.
 */
function normalizeBatchCause(
  cause: Cause.Cause<CliAdapterError | Cause.TimeoutError>,
): Cause.Cause<CliAdapterError> {
  return Cause.map(cause, (error) =>
    error instanceof CliAdapterError ? error : cliAdapterError("dev.telemetry.handoff", error),
  );
}
