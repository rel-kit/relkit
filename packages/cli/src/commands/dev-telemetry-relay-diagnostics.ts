/**
 * Reports telemetry loss independently from its saturated producer buffer.
 * Fixed terminal events bypass relay admission. Once storage exists, overflow
 * diagnostics go directly to its canonical queue without recursive early loss.
 */
import { Effect, Exit, Ref } from "effect";
import { cliTry } from "../cli-errors.js";
import type { ObservabilityRecord } from "@relkit/observability";
import type { DevLog, DevLogEvent } from "./dev.types.js";
import type { DevTelemetryRelayState } from "./dev-telemetry-relay.types.js";

/**
 * Identifies only owner-created telemetry diagnostics that must bypass early admission.
 * @param record - Already projected CLI record; application origins are checked by its caller.
 * @returns Whether admitting this event could amplify the loss it reports.
 */
export function isRelayDiagnostic(record: ObservabilityRecord): boolean {
  return (
    record.signal === "log" &&
    record.component === "cli.dev" &&
    record.message.startsWith("dev.telemetry.")
  );
}

/**
 * Isolates the native diagnostic sink while retaining its complete failure evidence.
 * @param state - Session cleanup authority; diagnostics never enter its bounded buffer.
 * @param log - Existing configured terminal/query event sink.
 * @param event - Fixed safe lifecycle event containing no producer payload.
 * @returns Completion even if presentation fails, with failure retained for cleanup reporting.
 */
export const relayDiagnostic = Effect.fn("DevTelemetry.diagnostic")(
  (state: DevTelemetryRelayState, log: DevLog, event: DevLogEvent) =>
    cliTry("dev.telemetry.diagnostic", () => log(event)).pipe(
      Effect.catchCause((cause) => state.cleanup.record("dev.telemetry.diagnostic", cause)),
    ),
);

/**
 * Reports changed cumulative loss outside retention and to canonical storage when ready.
 * @param state - Session retention and current persistent projection.
 * @param log - Independent terminal event sink.
 * @returns Coalesced diagnostic publication; diagnostic failure does not stop the backend.
 */
export const reportTelemetryLoss = Effect.fn("DevTelemetry.reportEarlyLoss")(function* (
  state: DevTelemetryRelayState,
  log: DevLog,
) {
  const diagnostic = yield* state.buffer.overflow();
  if (diagnostic !== undefined) {
    yield* Ref.set(state.pendingLoss, diagnostic);
    yield* relayDiagnostic(state, log, {
      level: "warn",
      event: "dev.telemetry.overflow",
      fields: { code: diagnostic.code, message: diagnostic.message },
    });
  }
  const pending = yield* Ref.get(state.pendingLoss);
  const store = Ref.getUnsafe(state.store);
  if (pending === undefined || store === undefined) return;
  const appended = yield* Effect.exit(
    cliTry("dev.telemetry.persist-loss", () => store.append(pending)),
  );
  if (Exit.isFailure(appended))
    yield* state.cleanup.record("dev.telemetry.persist-loss", appended.cause);
  else yield* Ref.update(state.pendingLoss, (value) => (value === pending ? undefined : value));
});

/**
 * Reports retained but uncommitted records when their owner finishes closing ingress.
 * @param state - Closed session ingress after producer/support shutdown has joined.
 * @returns Explicit bounded loss evidence; payload bytes remain redacted and unprinted.
 */
export const reportUncommittedTelemetry = Effect.fn("DevTelemetry.reportUncommitted")(function* (
  state: DevTelemetryRelayState,
) {
  const log = Ref.getUnsafe(state.diagnostic);
  if (log === undefined) return;
  yield* reportTelemetryLoss(state, log);
  const status = yield* state.buffer.status();
  if (status.bufferedRecords === 0) return;
  yield* relayDiagnostic(state, log, {
    level: "warn",
    event: "dev.telemetry.uncommitted",
    fields: {
      code: "RELKIT_EARLY_TELEMETRY_UNCOMMITTED",
      records: status.bufferedRecords,
      bytes: status.bufferedBytes,
      incomplete: true,
    },
  });
});
