/** SQL row reader shared by native list/detail query operations. */
import type { Effect } from "effect";
import type { DuckDBValue } from "@duckdb/node-api";
import type { StoredLocalRecord } from "@relkit/observability/local/record";
import type { DuckdbError } from "./duckdb-error.js";
/** Reads only fully decoded stored records from native SQL. */
export type DuckdbReadRows = (
  sql: string,
  values?: DuckDBValue[],
) => Effect.Effect<StoredLocalRecord[], DuckdbError>;
