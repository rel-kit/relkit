import { assertRuntimeIntegrationPlanVersion } from "@relkit/contracts";
import { assertLocalServicePlanVersion } from "@relkit/local-service";

export function selectedLocalServicePlan(
  graphHash: string,
  runtimeIntegrationsSource: string,
  localServicesSource: string,
): string | undefined {
  const runtimeIntegrations = JSON.parse(runtimeIntegrationsSource) as unknown;
  assertRuntimeIntegrationPlanVersion(runtimeIntegrations);
  if (runtimeIntegrations.graphHash !== graphHash)
    throw new TypeError("Runtime-integration plan does not match the compiled graph.");
  const localServices = JSON.parse(localServicesSource) as unknown;
  assertLocalServicePlanVersion(localServices);
  if (localServices.graphHash !== graphHash)
    throw new TypeError("Local-service plan does not match the compiled graph.");
  return localServices.services.length === 0 ? undefined : localServicesSource;
}
