/**
 * Owns duckdb query error for the optional local history store.
 * Shared records and query contracts come from lightweight observability; native
 * handles and worker lifetimes remain owned by this storage package.
 */
import { Schema } from "effect";
import { ObservabilityQueryError } from "@relkit/observability";
/**
 * Invalid local query input reported through the Effect error channel.
 *
 * @example
 * const failure = new DuckdbQueryError({
 *   code: "RELKIT_OBSERVABILITY_QUERY_INVALID", message: "Invalid cursor",
 * });
 */
export class DuckdbQueryError extends Schema.TaggedError<DuckdbQueryError>()("DuckdbQueryError", {
  code: Schema.Literals([
    "RELKIT_OBSERVABILITY_QUERY_INVALID",
    "RELKIT_OBSERVABILITY_QUERY_PROTOCOL_MISMATCH",
  ]),
  message: Schema.String,
}) {}
/**
 * Converts a query validation exception to a tagged Effect error.
 *
 * @param error - Compatibility query exception.
 * @returns Tagged query failure with its stable public code.
 * @example
 * const failure = duckdbQueryError(error);
 */
export function duckdbQueryError(error: ObservabilityQueryError): DuckdbQueryError {
  return new DuckdbQueryError({ code: error.code, message: error.message });
}
