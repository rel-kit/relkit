/** Composes serialized append, retention configuration and checkpoint operations for one native history owner. */
import { Effect, type Semaphore } from "effect";
import type { RedactionPolicy, TelemetryLocalRetentionPolicy } from "@relkit/observability";
import type { DuckdbConnectionPort } from "./duckdb-driver.types.js";
import type { DuckdbStorageEffects } from "./duckdb-storage.types.js";
import type { DuckdbStorageState } from "./duckdb-storage-state.types.js";
import { appendDuckdbRecords } from "./duckdb-transaction.js";
import { retainDuckdbRecords } from "./duckdb-retention.js";
import { runDuckdbSql } from "./duckdb-sql.js";
import { observeDuckdb } from "./duckdb-metrics.js";
/** @param connection - Scoped native connection. @param permit - Shared database serialization. @param configured - Retention policy. @param initialRedaction - Admission policy. @returns Native store capabilities. */
export function makeDuckdbStorage(
  connection: DuckdbConnectionPort,
  permit: Semaphore.Semaphore,
  configured: TelemetryLocalRetentionPolicy,
  initialRedaction?: RedactionPolicy,
): DuckdbStorageEffects {
  const state: DuckdbStorageState = {
    connection,
    permit,
    retention: configured,
    redaction: initialRedaction,
  };
  return {
    append: (records) => appendDuckdbRecords(state, records),
    configure: Effect.fn("ObservabilityDuckdb.configure")(function* (
      value: TelemetryLocalRetentionPolicy,
      nextRedaction?: RedactionPolicy,
    ) {
      yield* observeDuckdb(
        "configure",
        permit.withPermit(
          Effect.gen(function* () {
            state.retention = value;
            state.redaction = nextRedaction;
            yield* retainDuckdbRecords(state);
            yield* runDuckdbSql(connection, "checkpoint", "CHECKPOINT");
          }),
        ),
      );
    }),
    flush: Effect.fn("ObservabilityDuckdb.flush")(function* () {
      yield* observeDuckdb(
        "flush",
        permit.withPermit(
          Effect.gen(function* () {
            yield* retainDuckdbRecords(state);
            yield* runDuckdbSql(connection, "checkpoint", "CHECKPOINT");
          }),
        ),
      );
    }),
  };
}
