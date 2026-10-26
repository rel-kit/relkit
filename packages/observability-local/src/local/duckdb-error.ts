/**
 * Owns duckdb error for the optional local history store.
 * Shared records and query contracts come from lightweight observability; native
 * handles and worker lifetimes remain owned by this storage package.
 */
import { Schema } from "effect";

/**
 * Expected local DuckDB IO or schema failure with a stable operation label.
 *
 * @example
 * const failure = new DuckdbError({ operation: "connect", message: "failed", cause });
 */
export class DuckdbError extends Schema.TaggedError<DuckdbError>()("DuckdbError", {
  operation: Schema.String,
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * Converts a native DuckDB failure to the local storage error channel.
 *
 * @typeParam Cause - Native rejection type retained in the error cause.
 * @param operation - Stable operation name without SQL or user values.
 * @param cause - Native failure value.
 * @returns A tagged storage failure preserving the cause.
 * @example
 * const error = duckdbError("connect", cause);
 */
export function duckdbError<Cause>(operation: string, cause: Cause): DuckdbError {
  return new DuckdbError({
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
