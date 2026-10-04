import type { JsonValue } from "@relkit/contracts";
import type { RunListQuery } from "@relkit/contracts/jobs";

/** Validated native run selectors and page bounds retained in signed cursor identity. */
export interface InspectorRunFilters extends RunListQuery {
  readonly jobName?: string;
  readonly failure?: string;
  readonly attempt?: number;
  readonly timezone?: string;
  readonly nativeQuery?: string;
}

/** Signed continuation identity binding kind, generation, graph, filters and position. */
export interface InspectorCursor {
  readonly kind: "definitions" | "runs" | "schedules";
  readonly generationId: string;
  readonly graphHash: string;
  readonly filters: JsonValue;
  readonly position: JsonValue;
}
