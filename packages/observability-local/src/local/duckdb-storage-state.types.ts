/** Retention/redaction policy captured by one serialized native history store. */
import type { Semaphore } from "effect";
import type { RedactionPolicy, TelemetryLocalRetentionPolicy } from "@relkit/observability";
import type { DuckdbConnectionPort } from "./duckdb-driver.types.js";
/** Mutable configuration shares the same permit as writes and queries. */
export interface DuckdbStorageState {
  readonly connection: DuckdbConnectionPort;
  readonly permit: Semaphore.Semaphore;
  retention: TelemetryLocalRetentionPolicy;
  redaction: RedactionPolicy | undefined;
}
