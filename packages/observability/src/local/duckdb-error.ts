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
 * @param operation - Stable operation name without SQL or user values.
 * @param cause - Native failure value.
 * @returns A tagged storage failure preserving the cause.
 * @example
 * const error = duckdbError("connect", cause);
 */
export function duckdbError(operation: string, cause: unknown): DuckdbError {
  return new DuckdbError({
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
