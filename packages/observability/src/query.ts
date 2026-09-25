import { Effect } from "effect";
import type { QueryIndex } from "./query-utils.types.js";
import type { ObservabilityQuery, ObservabilityQueryOptions } from "./query-types.js";
import { ObservabilityQueryError } from "./query-types.js";
import { QueryDetailError, makeObservabilityQueryEffect } from "./query-effect.js";
import { QueryReadError, queryIndexLayer } from "./query-read-effect.js";
import type { QueryValidationError } from "./query-validation-effect.js";
export * from "./query-types.js";
export { QueryDetailError, makeObservabilityQueryEffect } from "./query-effect.js";
function legacy(error: QueryDetailError | QueryReadError | QueryValidationError): unknown {
  if (error._tag === "QueryReadError") return error.cause;
  if (error._tag === "QueryValidationError")
    return new ObservabilityQueryError(error.code, error.message);
  return new TypeError(error.message);
}
/**
 * Creates the local query API over a borrowed segment index.
 * @param index - Index used to page and read admitted records.
 * @param options - Page bounds and redaction policy.
 * @returns Request, log, and trace Promise operations.
 * @throws {TypeError} If a query bound is invalid.
 * @example
 * const query = createObservabilityQuery(index, { maxPageSize: 100 });
 * const page = await query.logs({ limit: 10 });
 */
export function createObservabilityQuery(
  index: QueryIndex,
  options: ObservabilityQueryOptions = {},
): ObservabilityQuery {
  const effects = Effect.runSync(
    makeObservabilityQueryEffect(options).pipe(
      Effect.provide(queryIndexLayer(index)),
      Effect.mapError(legacy),
    ),
  );
  return Object.freeze({
    requests: (query) => Effect.runPromise(effects.requests(query).pipe(Effect.mapError(legacy))),
    logs: (query) => Effect.runPromise(effects.logs(query).pipe(Effect.mapError(legacy))),
    traces: (query) => Effect.runPromise(effects.traces(query).pipe(Effect.mapError(legacy))),
    request: (id) => Effect.runPromise(effects.request(id).pipe(Effect.mapError(legacy))),
    log: (cursor) => Effect.runPromise(effects.log(cursor).pipe(Effect.mapError(legacy))),
    trace: (id) => Effect.runPromise(effects.trace(id).pipe(Effect.mapError(legacy))),
  } satisfies ObservabilityQuery);
}
