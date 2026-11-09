/**
 * Owns duckdb database.types for the optional local history store.
 * Shared records and query contracts come from lightweight observability; native
 * handles and worker lifetimes remain owned by this storage package.
 */
import type { makeDuckdbQueryEffect } from "./duckdb-query-effect.js";
import type { DuckdbStorageEffects } from "./duckdb-storage.types.js";
import type { LegacyImportSummary } from "./import-history.types.js";

/**
 * Scoped local database operations; the owning Scope releases native handles.
 *
 * @example
 * const database = yield* openDuckdbDatabaseEffect(root);
 * const page = yield* database.list("logs");
 */
export type DuckdbDatabaseEffects = DuckdbStorageEffects &
  ReturnType<typeof makeDuckdbQueryEffect> & {
    readonly imported: LegacyImportSummary;
  };
