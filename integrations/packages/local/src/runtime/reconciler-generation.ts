import type { LocalServiceInstance } from "@relkit/local-service";
import { LOCAL_RESOURCE_LABEL } from "./identity.js";

/** Refuses an unsafe source-generation swap while an older service is owned. */
export function assertHotSwapSafe(
  bindingId: string,
  instances: readonly LocalServiceInstance[],
  environment: string | undefined,
  serviceGeneration: string | undefined,
): void {
  if (serviceGeneration === undefined) return;
  const historical = instances.find((instance) =>
    (environment === undefined || instance.labels[LOCAL_RESOURCE_LABEL.environment] === environment) &&
    instance.labels[LOCAL_RESOURCE_LABEL.serviceGeneration] !== serviceGeneration,
  );
  if (historical === undefined) return;
  throw new Error(
    `Local service "${bindingId}" cannot hot-swap from service generation "${historical.labels[LOCAL_RESOURCE_LABEL.serviceGeneration] ?? "unknown"}" while accepted work may still depend on it. Drain or cancel that work, run "relkit local stop", then retry.`,
  );
}
