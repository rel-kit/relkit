import type { InspectorActiveGeneration } from "@relkit/inspector-api";
import type { ObservabilityQueryRequest } from "@relkit/observability";
import type { Hono } from "hono";

/** Poisoned generation data owned by one benchmark replay. */
export interface PerformanceGeneration {
  readonly generation: InspectorActiveGeneration;
  readonly secret: string;
  readonly getForbiddenReads: () => number;
}

/** Public Inspector router and query counters owned by one benchmark replay. */
export interface PerformanceInspector extends Omit<PerformanceGeneration, "generation"> {
  readonly app: Hono;
  readonly seen: ObservabilityQueryRequest[];
}
