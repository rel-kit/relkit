/**
 * Owns duckdb query for the optional local history store.
 * Shared records and query contracts come from lightweight observability; native
 * handles and worker lifetimes remain owned by this storage package.
 */
import { Effect, Semaphore } from "effect";
import type { DuckdbConnectionPort } from "./duckdb-driver.types.js";
import { makeDuckdbQueryEffect } from "./duckdb-query-effect.js";
import { DuckdbQueryError } from "./duckdb-query-error.js";
import { ObservabilityQueryError } from "@relkit/observability";
import type { ObservabilityQueryRequest } from "@relkit/observability";
/**
 * Creates Promise query adapters for a scoped DuckDB connection.
 *
 * @param connection - Scoped database connection.
 * @returns Query operations retaining the public Promise signatures.
 * @example
 * const query = createDuckdbQuery(connection);
 * const page = await query.list("logs");
 */
export function createDuckdbQuery(connection: DuckdbConnectionPort) {
  const query = makeDuckdbQueryEffect(connection, Semaphore.makeUnsafe(1));
  const run = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
    Effect.runPromise(
      effect.pipe(
        Effect.mapError((error) =>
          error instanceof DuckdbQueryError
            ? new ObservabilityQueryError(error.code, error.message)
            : error,
        ),
      ),
    );
  return {
    list: (kind: "logs" | "requests" | "traces", input: ObservabilityQueryRequest = {}) =>
      run(query.list(kind, input)),
    detail: (kind: "log" | "request" | "trace", id: string) => run(query.detail(kind, id)),
  };
}
