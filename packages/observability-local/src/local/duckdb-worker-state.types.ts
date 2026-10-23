/** Physical database scope and serialization state owned by one storage worker. */
import type { Scope, Semaphore } from "effect";
import type { DuckdbDriver } from "./duckdb-driver.types.js";
import type { DuckdbDatabaseEffects } from "./duckdb-database.types.js";

/** Open transfers its database scope here; close clears authority before release. */
export interface DuckdbWorkerState {
  readonly driver: DuckdbDriver;
  readonly permit: Semaphore.Semaphore;
  database: DuckdbDatabaseEffects | undefined;
  databaseScope: Scope.Closeable | undefined;
}
