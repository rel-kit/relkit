import type { ApplicationGraph } from "@relkit/graph";
import {
  ProviderRegistryError,
  type ProviderRegistryErrorCode,
} from "./provider-registry-types.js";

type ModelReadinessCode = Extract<ProviderRegistryErrorCode, `RELKIT_MODEL_${string}`>;
const modelCodes = new Set<ModelReadinessCode>([
  "RELKIT_MODEL_PROVIDER_CONFIGURATION_INVALID",
  "RELKIT_MODEL_PROVIDER_UNSUPPORTED",
  "RELKIT_MODEL_PROVIDER_ENVIRONMENT_INVALID",
  "RELKIT_MODEL_PROVIDER_MODEL_UNAVAILABLE",
  "RELKIT_MODEL_SELECTOR_INVALID",
  "RELKIT_MODEL_PROVIDER_UNKNOWN",
  "RELKIT_MODEL_PROVIDER_DEFAULT_MISSING",
]);

export function validateModelReadiness(
  graph: ApplicationGraph,
  registryFor: (profile: string) => unknown,
): void {
  const agents = graph.nodes.filter((node) => node.kind === "agent");
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

function modelCode(value: unknown): ModelReadinessCode {
  const code = isRecord(value) && typeof value.code === "string" ? value.code : undefined;
  return code !== undefined && modelCodes.has(code as ModelReadinessCode)
    ? (code as ModelReadinessCode)
    : "RELKIT_MODEL_PROVIDER_MODEL_UNAVAILABLE";
}

function modelMessage(value: unknown): string {
  const code = modelCode(value);
  const message = isRecord(value) && typeof value.message === "string" ? value.message : undefined;
  return message === undefined ? `${code}: Agent model is not ready.` : message;
}

function isRegistry(
  value: unknown,
): value is { readonly resolveModel: (selector?: string) => unknown } {
  return isRecord(value) && typeof value.resolveModel === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
