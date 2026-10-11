/**
 * Implements early retention in the owning Effect context. Redaction precedes
 * both memory admission and byte accounting, and loss diagnostics use an
 * independent counter instead of entering the buffer they describe.
 */
import { Clock, Effect, Ref, Schema } from "effect";
import { admitObservabilityRecordEffect } from "./record-admission.js";
import { OBSERVABILITY_MODEL_VERSION } from "./model.js";
import { EarlyRetentionError } from "./early-records-error.js";
import {
  acknowledgeEarlyRecords,
  resizeEarlyRetention,
  retainEarlyRecord,
} from "./early-records-state.js";
import { observeEarlyRetention } from "./early-records-observer.js";
import { validateEarlyRetentionOptions } from "./early-records-policy.js";
import { EarlyRecordIdentity as IdentitySchema } from "./early-records.schemas.js";
import type {
  EarlyRetentionOperations,
  EarlyRetentionOptions,
  EarlyRetentionState,
  EarlyRecordIdentity,
} from "./early-records.types.js";
import type { ObservabilityRecord } from "./model.js";

/**
 * Creates methods borrowing only state and redaction policy owned by the service.
 * @param state - Session-owned reference, never shared across Layer acquisitions.
 * @param options - Validated retention bounds and supplied redaction policy.
 * @returns Lazy methods; their execution context supplies clocks and instrumentation.
 */
export function earlyRetentionOperations(
  state: Ref.Ref<EarlyRetentionState>,
  policy: Ref.Ref<
    EarlyRetentionOptions & { readonly maxRecords: number; readonly maxBytes: number }
  >,
): EarlyRetentionOperations {
  return {
    configure: Effect.fn("EarlyRetention.configure")((options: EarlyRetentionOptions) =>
      observeEarlyRetention(
        "configure",
        Effect.gen(function* () {
          const next = yield* validateEarlyRetentionOptions(options);
          yield* Ref.update(state, (value) =>
            resizeEarlyRetention(value, next.maxRecords, next.maxBytes),
          );
          yield* Ref.set(policy, next);
        }),
      ),
    ),
    admit: Effect.fn("EarlyRetention.admit")(
      (record: ObservabilityRecord, identity?: EarlyRecordIdentity) =>
        observeEarlyRetention("admit", admit(state, policy, record, identity)),
    ),
    snapshot: Effect.fn("EarlyRetention.snapshot")(() =>
      observeEarlyRetention(
        "snapshot",
        Ref.get(state).pipe(Effect.map((value) => Object.freeze([...value.entries]))),
      ),
    ),
    status: Effect.fn("EarlyRetention.status")(() =>
      observeEarlyRetention(
        "status",
        Ref.get(state).pipe(
          Effect.map((value) =>
            Object.freeze({
              bufferedRecords: value.entries.length,
              bufferedBytes: value.bytes,
              droppedRecords: value.droppedRecords,
              droppedBytes: value.droppedBytes,
              incomplete: value.droppedRecords > 0,
            }),
          ),
        ),
      ),
    ),
    acknowledge: Effect.fn("EarlyRetention.acknowledge")((through: number) =>
      observeEarlyRetention("acknowledge", acknowledge(state, through)),
    ),
    overflow: Effect.fn("EarlyRetention.overflow")(() =>
      observeEarlyRetention("overflow", overflow(state)),
    ),
  };
}

/**
 * Redacts before atomically accounting for and retaining a submitted record.
 * @param state - Acquired session state.
 * @param options - Validated count/byte policy and redaction configuration.
 * @param record - Submitted model record; malformed admission returns absence.
 * @returns Admitted safe record even if too large to retain, with loss recorded.
 */
const admit = Effect.fn("EarlyRetention.redact")(function* (
  state: Ref.Ref<EarlyRetentionState>,
  policy: Ref.Ref<
    EarlyRetentionOptions & { readonly maxRecords: number; readonly maxBytes: number }
  >,
  record: ObservabilityRecord,
  identity?: EarlyRecordIdentity,
) {
  if (identity !== undefined && !Schema.is(IdentitySchema)(identity))
    return yield* new EarlyRetentionError({ operation: "identity.invalid" });
  const options = yield* Ref.get(policy);
  const safe = yield* admitObservabilityRecordEffect(record, options.redaction);
  if (safe === undefined) return undefined;
  const retained = identity === undefined ? {} : { identity: Object.freeze({ ...identity }) };
  const bytes = Buffer.byteLength(
    JSON.stringify(identity === undefined ? safe : { record: safe, ...retained }),
    "utf8",
  );
  yield* Ref.update(state, (value) =>
    retainEarlyRecord(
      value,
      Object.freeze({ sequence: value.sequence + 1, bytes, record: safe, ...retained }),
      options.maxRecords,
      options.maxBytes,
    ),
  );
  return safe;
});

/**
 * Validates a handoff cursor before retiring only its prefix.
 * @param state - Owning session reference.
 * @param through - Persistence acknowledgement in this session's sequence space.
 * @returns Completion or a typed cursor failure; later records remain buffered.
 */
const acknowledge = Effect.fn("EarlyRetention.retire")(function* (
  state: Ref.Ref<EarlyRetentionState>,
  through: number,
) {
  const current = yield* Ref.get(state);
  if (!Number.isSafeInteger(through) || through < 0 || through > current.sequence)
    return yield* new EarlyRetentionError({ operation: "acknowledge.cursor" });
  yield* Ref.update(state, (value) => acknowledgeEarlyRecords(value, through));
});

/**
 * Coalesces cumulative loss outside the retained record queue.
 * @param state - Session-owned loss evidence and last diagnostic totals.
 * @returns A safe diagnostic once per changed total, independent of saturation.
 */
const overflow = Effect.fn("EarlyRetention.loss")(function* (state: Ref.Ref<EarlyRetentionState>) {
  const timestamp = new Date(yield* Clock.currentTimeMillis).toISOString();
  return yield* Ref.modify(state, (value) => {
    if (
      value.reportedRecords === value.droppedRecords &&
      value.reportedBytes === value.droppedBytes
    )
      return [undefined, value] as const;
    const diagnostic = {
      version: OBSERVABILITY_MODEL_VERSION,
      signal: "diagnostic" as const,
      code: "RELKIT_EARLY_TELEMETRY_OVERFLOW",
      severity: "warning" as const,
      message: `Early telemetry lost ${value.droppedRecords} records (${value.droppedBytes} bytes); observation is incomplete.`,
      occurredAt: timestamp,
    };
    return [
      diagnostic,
      { ...value, reportedRecords: value.droppedRecords, reportedBytes: value.droppedBytes },
    ] as const;
  });
});
