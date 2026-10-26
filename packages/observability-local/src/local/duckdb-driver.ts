/**
 * Owns duckdb driver for the optional local history store.
 * Shared records and query contracts come from lightweight observability; native
 * handles and worker lifetimes remain owned by this storage package.
 */
import { DuckDBInstance } from "@duckdb/node-api";
import { Context, Effect, Layer } from "effect";
import { duckdbError } from "./duckdb-error.js";
import type { DuckdbDriver } from "./duckdb-driver.types.js";
/**
 * Injectable native DuckDB instance factory.
 *
 * @example
 * const driver = yield* DuckdbDriverService;
 * const instance = yield* driver.create(path);
 */
export class DuckdbDriverService extends Context.Service<DuckdbDriverService, DuckdbDriver>()(
  "@relkit/observability/DuckdbDriver",
  {
    make: Effect.sync((): DuckdbDriver => ({
      create: Effect.fn("ObservabilityDuckdb.driver.create")((path: string) =>
        Effect.tryPromise({
          try: () => DuckDBInstance.create(path),
          catch: (cause) => duckdbError("create", cause),
        }),
      ),
    })),
  },
) {}
/**
 * Live native driver for local observability storage.
 *
 * @example
 * const database = yield* openDuckdbDatabaseEffect(root).pipe(
 *   Effect.provide(duckdbDriverLayer),
 * );
 */
export const duckdbDriverLayer = Layer.effect(DuckdbDriverService, DuckdbDriverService.make);
