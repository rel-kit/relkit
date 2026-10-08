import { assertRuntimeIntegrationPlanVersion } from "@relkit/contracts";
import { assertLocalServicePlanVersion } from "@relkit/local-service";

/**
 * Checks generated plan versions and graph identities before copying a local cohort.
 * @param graphHash - Accepted compiled graph identity.
 * @param runtimeIntegrationsSource - Compiler-produced versioned integration bytes.
 * @param localServicesSource - Compiler-produced versioned local-service bytes.
 * @returns Original local plan bytes when services exist, otherwise absence.
 */
export function selectedLocalServicePlan(
  graphHash: string,
  runtimeIntegrationsSource: string,
  localServicesSource: string,
): string | undefined {
  const runtimeIntegrations: unknown = JSON.parse(runtimeIntegrationsSource);
  assertRuntimeIntegrationPlanVersion(runtimeIntegrations);
  if (runtimeIntegrations.graphHash !== graphHash)
    throw new TypeError("Runtime-integration plan does not match the compiled graph.");
  const localServices: unknown = JSON.parse(localServicesSource);
  assertLocalServicePlanVersion(localServices);
  if (localServices.graphHash !== graphHash)
    throw new TypeError("Local-service plan does not match the compiled graph.");
  return localServices.services.length === 0 ? undefined : localServicesSource;
}
