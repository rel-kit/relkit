/**
 * Holds canonical persistence in a support Scope independent of backend readiness.
 * The latest policy is serialized with storage publication. Ordered byte-stable
 * batches retire only after acknowledgement; complete failure Causes remain evidence.
 */
import { Cause, Effect, Ref, Schedule } from "effect";
import { observeCli } from "../cli-runtime.js";
import { commitEarlyBatch, flushEarlyRecords, retireBatch } from "./dev-telemetry-relay-batches.js";
import { relayDiagnostic, reportTelemetryLoss } from "./dev-telemetry-relay-diagnostics.js";
import type { DevTelemetryRelayState } from "./dev-telemetry-relay.types.js";
import type { DevLog } from "./dev.types.js";
import type { TelemetryStorageOperations } from "./dev-telemetry-storage.types.js";
import { cliAdapterError, type CliAdapterError } from "../cli-errors.js";

/**
 * Acquires storage and joins its native resources when support is cancelled.
 * @param state - Session retention and captured adapter authorities.
 * @param storage - Substitutable delayed persistent authority.
 * @param log - Configured terminal sink; telemetry diagnostics bypass early admission.
 * @returns Scoped support lifetime, retaining every non-interruption failure for diagnostics.
 */
export const runTelemetryHandoff = Effect.fn("DevTelemetry.handoff")(
  (state: DevTelemetryRelayState, storage: TelemetryStorageOperations, log: DevLog) =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* Ref.set(state.diagnostic, log);
        yield* Effect.forkScoped(monitorTelemetryLoss(state, log));
        yield* storageLifetime(state, storage, log);
      }),
    ),
);

/**
 * Owns canonical resources while the independent loss monitor remains alive.
 * @param state - Session retention, policy gate and callback projection.
 * @param storage - Captured delayed persistent authority.
 * @param log - Safe session terminal sink.
 * @returns Joined canonical resource lifetime or an unavailable support wait.
 */
const storageLifetime = Effect.fn("DevTelemetry.storageLifetime")(
  (state: DevTelemetryRelayState, storage: TelemetryStorageOperations, log: DevLog) =>
    Effect.repeat(
      Effect.scoped(
        // Emit the operation's final observation before its persistence Scope closes.
        observeCli(
          "dev.telemetry.handoff",
          Effect.gen(function* () {
            yield* Ref.set(state.storageState, "starting");
            const store = yield* storage
              .acquire(state.root, Ref.getUnsafe(state.configuration), () =>
                log({
                  level: "error",
                  event: "dev.storage.failed",
                  fields: { message: "Telemetry storage unavailable." },
                }),
              )
              .pipe(
                Effect.timeout(5_000),
                Effect.mapError((error) =>
                  Cause.isTimeoutError(error)
                    ? cliAdapterError(
                        "dev.telemetry.storage-timeout",
                        new Error("Telemetry storage acquisition exceeded 5 seconds."),
                      )
                    : error,
                ),
              );
            yield* state.configurationGate.withPermit(
              Effect.gen(function* () {
                yield* store.configureEffect(Ref.getUnsafe(state.configuration));
                yield* Ref.set(state.store, store);
                yield* Ref.set(state.storageState, "ready");
              }),
            );
            yield* Effect.addFinalizer(() => Ref.set(state.store, undefined));
            yield* Effect.addFinalizer(() =>
              flushEarlyRecords(state, store).pipe(
                Effect.catchCause((cause) =>
                  state.cleanup.record("dev.telemetry.early-flush", cause),
                ),
              ),
            );
            yield* relayDiagnostic(state, log, {
              level: "info",
              event: "dev.storage.ready",
              fields: store.imported,
            });
            while (true) {
              const batch = (yield* state.buffer.snapshot()).slice(0, 256);
              if (batch.length === 0) {
                yield* Effect.sleep(10);
                continue;
              }
              yield* commitEarlyBatch(state, store, batch);
              yield* retireBatch(state, batch);
            }
          }),
        ),
      ).pipe(Effect.catchCause((cause) => supportFailure(state, log, cause))),
      Schedule.spaced(1_000),
    ).pipe(Effect.asVoid),
);

/**
 * Keeps the backend available after support failure without losing mixed Cause reasons.
 * @param state - Session cleanup evidence and still-bounded early retention.
 * @param log - Configured safe diagnostic sink.
 * @param cause - Complete original support failure or cancellation.
 * @returns Interruption propagation, or completion that permits a bounded-delay retry.
 */
const supportFailure = Effect.fn("DevTelemetry.supportFailure")(function* (
  state: DevTelemetryRelayState,
  log: DevLog,
  cause: Cause.Cause<CliAdapterError>,
) {
  if (Cause.hasInterruptsOnly(cause)) return yield* Effect.failCause(cause);
  yield* Ref.set(state.storageState, "unavailable");
  yield* state.cleanup.record("dev.telemetry.support", cause);
  yield* relayDiagnostic(state, log, {
    level: "error",
    event: "dev.storage.failed",
    fields: { message: "Telemetry storage unavailable; backend remains serving." },
  });
});

/**
 * Reports loss even when storage acquisition has not completed or has failed.
 * @param state - Independent retention counters and cleanup evidence.
 * @param log - Existing terminal diagnostic sink, isolated from producer admission.
 * @returns Session-owned monitor; its failure cannot close the serving backend.
 */
const monitorTelemetryLoss = Effect.fn("DevTelemetry.monitorLoss")(
  (state: DevTelemetryRelayState, log: DevLog) =>
    Effect.forever(reportTelemetryLoss(state, log).pipe(Effect.andThen(Effect.sleep(25)))).pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.void
          : state.cleanup.record("dev.telemetry.loss-monitor", cause),
      ),
    ),
);
