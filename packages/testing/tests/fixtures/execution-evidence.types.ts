import type { Layer, Metric } from "effect";

/** Isolated observability services for a consumer's live or deterministic test run. */
export interface ExecutionEvidence {
  readonly registry: Metric.MetricRegistry;
  readonly layer: Layer.Layer<never>;
}
