import type { ObservabilityQueryRequest } from "./query.types.js";

/** Validated page request with normalized limit and parsed time bounds. */
export interface NormalizedQuery extends ObservabilityQueryRequest {
  readonly limit: number;
  readonly fromMs?: number;
  readonly toMs?: number;
}
