/** Version of the JSON-safe observability record contracts. */
export const OBSERVABILITY_MODEL_VERSION = 2 as const;
export const OBSERVABILITY_VERSION = OBSERVABILITY_MODEL_VERSION;

/** Request outcomes defined by the v3 HTTP contract. */
export const REQUEST_OUTCOMES = [
  "success",
  "declared-error",
  "validation-error",
  "timeout",
  "cancelled",
  "defect",
  // The framework answered before any handler ran: no route (404), a method the path does not
  // accept (405) or a body over the limit (413).
  "refused",
] as const;
