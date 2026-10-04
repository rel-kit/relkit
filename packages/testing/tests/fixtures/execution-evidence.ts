import { Layer, Logger, Metric } from "effect";
import type { ExecutionEvidence } from "./execution-evidence.types.ts";

/**
 * Supplies the standard metric service with an isolated registry and silent logger.
 * @returns Evidence and its substitutable Layer, owned by one test invocation.
 */
export function createExecutionEvidence(): ExecutionEvidence {
  const registry: Metric.MetricRegistry = new Map();
  return {
    registry,
    layer: Layer.mergeAll(Layer.succeed(Metric.MetricRegistry, registry), Logger.layer([])),
  };
}
