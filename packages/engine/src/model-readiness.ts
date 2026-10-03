import type { ApplicationGraph } from "@relkit/graph";
import type { ModelReadinessCode } from "./model-readiness.types.js";
import { ProviderRegistryError } from "./provider-registry-types.js";

const modelCodes = new Set<ModelReadinessCode>([
  "RELKIT_MODEL_PROVIDER_CONFIGURATION_INVALID",
  "RELKIT_MODEL_PROVIDER_UNSUPPORTED",
  "RELKIT_MODEL_PROVIDER_ENVIRONMENT_INVALID",
  "RELKIT_MODEL_PROVIDER_MODEL_UNAVAILABLE",
  "RELKIT_MODEL_SELECTOR_INVALID",
  "RELKIT_MODEL_PROVIDER_UNKNOWN",
  "RELKIT_MODEL_PROVIDER_DEFAULT_MISSING",
]);

/** Verify required model aliases and capabilities against ready runtime providers.
 * @returns Nothing; incompatible model capabilities throw safe provider diagnostics.
 * @param graph - Application graph being verified for this generation.
 * @param registryFor - Lookup of the already acquired model registry for a profile.
 */
export function validateModelReadiness(
  graph: ApplicationGraph,
  registryFor: (profile: string) => unknown,
): void {
  const agents = graph.nodes
    .filter((node) => node.kind === "agent")
    .filter((agent) => agent.execution !== "graph" && agent.modelSource !== "native");
  if (agents.length === 0) return;
  const issues = agents.flatMap((agent) => {
    const registry = registryFor(agent.profile);
    if (!isRegistry(registry)) {
      return [
        {
          code: "RELKIT_MODEL_PROVIDER_REGISTRY_INVALID" as const,
          message: `Agent model profile "${agent.profile}" has no active model registry.`,
          agentId: agent.id,
          source: agent.source,
        },
      ];
    }
    try {
      registry.resolveModel(agent.model);
      return [];
    } catch (cause) {
      return [
        {
          code: modelCode(cause),
          message: modelMessage(cause),
          agentId: agent.id,
          source: agent.source,
        },
      ];
    }
  });
  if (issues.length > 0) throw new ProviderRegistryError(issues);
}

/** Map native model readiness failures to bounded public diagnostic codes.
 * @returns A bounded public model readiness code.
 * @param value - Native value being validated or projected.
 */
function modelCode(value: unknown): ModelReadinessCode {
  const code = isRecord(value) && typeof value.code === "string" ? value.code : undefined;
  return code !== undefined && modelCodes.has(code as ModelReadinessCode)
    ? (code as ModelReadinessCode)
    : "RELKIT_MODEL_PROVIDER_MODEL_UNAVAILABLE";
}

/** Project a safe model readiness message without native credentials.
 * @returns A safe public model readiness message.
 * @param value - Native value being validated or projected.
 */
function modelMessage(value: unknown): string {
  const code = modelCode(value);
  const message = isRecord(value) && typeof value.message === "string" ? value.message : undefined;
  return message === undefined ? `${code}: Agent model is not ready.` : message;
}

/** Recognize a model-provider lookup capability.
 * @returns Whether the native value satisfies this guard.
 * @param value - Native value being validated or projected.
 */
function isRegistry(
  value: unknown,
): value is { readonly resolveModel: (selector?: string) => unknown } {
  return isRecord(value) && typeof value.resolveModel === "function";
}

/** Recognize non-null object records before reading native fields.
 * @returns Whether the native value satisfies this guard.
 * @param value - Native value being validated or projected.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
