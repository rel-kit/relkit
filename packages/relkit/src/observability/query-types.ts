import { PROTOCOL_VERSION } from "../contracts/index.js";
export type * from "./query.types.js";

export const OBSERVABILITY_QUERY_PROTOCOL = "relkit.observability.query" as const;
export const OBSERVABILITY_QUERY_VERSION = PROTOCOL_VERSION;
export const DEFAULT_OBSERVABILITY_QUERY_LIMIT = 50;
export const MAX_OBSERVABILITY_QUERY_LIMIT = 100;

/**
 * Compatibility error for invalid query input or protocol versions.
 * Effect callers receive `QueryValidationError` instead.
 * @example
 * if (error instanceof ObservabilityQueryError) console.error(error.code);
 */
export class ObservabilityQueryError extends TypeError {
  /**
   * Creates a query validation error with a stable public code.
   * @param code - Invalid-input or protocol-mismatch code.
   * @param message - Human-readable explanation, written by the framework; it names the
   * parameter and the accepted values, never a value the caller did not send.
   * @param parameter - The query parameter that was rejected, when one is to blame.
   * @example
   * throw new ObservabilityQueryError("RELKIT_OBSERVABILITY_QUERY_INVALID", "Invalid cursor", "cursor");
   */
  constructor(
    readonly code:
      "RELKIT_OBSERVABILITY_QUERY_INVALID" | "RELKIT_OBSERVABILITY_QUERY_PROTOCOL_MISMATCH",
    message: string,
    readonly parameter?: string,
  ) {
    super(message);
    this.name = "ObservabilityQueryError";
  }
}
