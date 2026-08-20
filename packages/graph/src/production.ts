import type { ApplicationGraph, HttpTriggerConfig } from "./model.js";

/** Rejects development-only runtime fallbacks before production activation. */
export function assertProductionGraph(graph: ApplicationGraph): void {
  for (const node of graph.nodes) {
    if (node.kind !== "trigger" || node.triggerType !== "http") continue;
    const config = node.config as unknown as HttpTriggerConfig;
    if (
      config.rateLimit !== undefined &&
      config.rateLimit !== null &&
      config.rateLimit.storeId === undefined
    ) {
      throw new Error(`Route "${node.id}" requires a shared rate-limit cache store in production.`);
    }
  }
}
