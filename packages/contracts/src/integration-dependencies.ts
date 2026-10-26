/**
 * Selects integration requirements from already validated declarative metadata.
 * Compiler and runtime use the same capability/phase intersection; this portable
 * contract never resolves packages, evaluates configuration or installs SDKs.
 */
import type {
  IntegrationDependencyPhase,
  IntegrationDependencyRequirement,
} from "./integration-dependencies.types.js";

export {
  IntegrationDependencyPhase as IntegrationDependencyPhaseSchema,
  IntegrationDependencyRequirement as IntegrationDependencyRequirementSchema,
  IntegrationDependencyRequirements,
} from "./integration-dependencies.schemas.js";
export type {
  IntegrationDependencyPhase,
  IntegrationDependencyRequirement,
} from "./integration-dependencies.types.js";

/**
 * Filters SDK requirements without activating unrelated advertised capabilities.
 * @param requirements - Decoded declarations from the selected integration.
 * @param capabilities - Capabilities actually required by the application graph.
 * @param phase - Operation whose readiness is being validated.
 * @returns Deterministically ordered matching declarations; inputs stay unchanged.
 */
export function selectedIntegrationRequirements(
  requirements: readonly IntegrationDependencyRequirement[],
  capabilities: readonly string[],
  phase: IntegrationDependencyPhase,
): readonly IntegrationDependencyRequirement[] {
  return requirements
    .filter(
      (entry) =>
        entry.phases.includes(phase) &&
        entry.capabilities.some((capability) => capabilities.includes(capability)),
    )
    .sort((left, right) => left.package.localeCompare(right.package));
}
