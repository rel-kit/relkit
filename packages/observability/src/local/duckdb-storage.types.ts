import type { Effect } from "effect";
import type { RedactionPolicy } from "../redaction.js";
import type { TelemetryLocalRetentionPolicy } from "../telemetry-config.js";
import type { LocalRecord, StoredLocalRecord } from "./types.types.js";
import type { DuckdbError } from "./duckdb-error.js";
/**
 * Effect operations that persist and retain local telemetry.
 * All methods serialize access to one native connection.
 *
 * @example
 * const stored = yield* storage.append(records);
 */
export interface DuckdbStorageEffects {
  /**
   * Appends at most 256 idempotent records in one transaction.
   * @param records - Valid local telemetry envelopes.
   * @returns An Effect with committed records or a tagged DuckdbError.
   * @example
   * const stored = yield* storage.append(records);
   */
  readonly append: (
    records: readonly LocalRecord[],
  ) => Effect.Effect<StoredLocalRecord[], DuckdbError>;
  /**
   * Reconfigures retention and redaction, then checkpoints.
   * @param retention - New retention limits.
   * @param redaction - New admission policy.
   * @returns An Effect completing after checkpoint or a DuckdbError.
   * @example
   * yield* storage.configure({ maxEntries: 100 });
   */
  readonly configure: (
    retention: TelemetryLocalRetentionPolicy,
    redaction?: RedactionPolicy,
  ) => Effect.Effect<void, DuckdbError>;
  /**
   * Applies retention and checkpoints.
   * @returns An Effect completing after the flush or a DuckdbError.
   * @example
   * yield* storage.flush();
   */
  readonly flush: () => Effect.Effect<void, DuckdbError>;
}
