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
] as const;
