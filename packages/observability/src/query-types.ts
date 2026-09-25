import { PROTOCOL_VERSION } from "@relkit/contracts";
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
   * @param message - Human-readable explanation.
   * @example
   * throw new ObservabilityQueryError("RELKIT_OBSERVABILITY_QUERY_INVALID", "Invalid cursor");
   */
  constructor(
    readonly code:
      "RELKIT_OBSERVABILITY_QUERY_INVALID" | "RELKIT_OBSERVABILITY_QUERY_PROTOCOL_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "ObservabilityQueryError";
  }
}
