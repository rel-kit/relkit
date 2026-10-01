import { generatedAgentMarker } from "./normalize-generated-function.js";
import { requestedProviderProfile, selectedProviderProfile } from "./normalize-graph-app.js";
import { clean } from "./normalize-graph-utils.js";
import type { NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import { isRecord, refId, refKind } from "./normalize-utils.js";
import { agentResources, agentSubagents, workflowTopology } from "./normalize-agent-topology.js";

/**
 * Projects agent tools, backend, workflow, and provider metadata.
 * @param value - Declared metadata inspected without coercion.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param application - Application descriptor metadata.
 * @returns Serializable tool, backend, workflow, and provider metadata.
 */
export function agentNodeData(
  value: Record<string, unknown>,
  descriptor: NormalizedDescriptor,
  work: NormalizationWork,
  application: unknown,
) {
  const backendBucketId = refKind(value.backend) === "bucket" ? refId(value.backend) : undefined;
  const profile =
    selectedProviderProfile(
      application,
      "model",
      requestedProviderProfile(descriptor.kind, value),
    ) ?? "default";
  const stateProfile =
    typeof value.stateProfile === "string"
      ? (selectedProviderProfile(application, "agent-state", value.stateProfile) ??
        value.stateProfile)
      : undefined;
  const topology = workflowTopology(value.workflow);
  const subagents = agentSubagents(value.subagents);
  const resources = agentResources(value, profile, stateProfile);
  return {
    input: work.schemas.get(`${descriptor.id}:input`) ?? null,
    output: work.schemas.get(`${descriptor.id}:output`) ?? null,
    ...(typeof value.model === "string" ? { model: value.model } : {}),
    ...(value.model !== undefined && typeof value.model !== "string"
      ? { modelSource: "native" as const }
      : {}),
    instructions:
      isRecord(value.instructions) && value.instructions.kind === "prompt"
        ? { promptId: refId(value.instructions) ?? "" }
        : clean(value.instructions),
    toolIds: toolIds(value.tools),
    limits: clean(value.limits),
    generatedFunction: generatedAgentMarker(descriptor.id),
    profile,
    ...(value.client === undefined ? {} : { client: agentClient(value.client) }),
    ...(stateProfile === undefined ? {} : { stateProfile }),
    ...(value.chat === undefined ? {} : { chat: clean(value.chat) }),
    ...(value.controls === undefined ? {} : { controls: clean(value.controls) }),
    ...(value.execution === "graph" ? { execution: "graph" as const } : {}),
    ...(value.workflow === undefined ? {} : { workflow: clean(value.workflow) }),
    ...(topology === undefined ? {} : { workflowTopology: topology }),
    ...(subagents === undefined ? {} : { subagents }),
    ...(resources.length === 0 ? {} : { resourceDependencies: resources }),
    ...(value.clientContract === undefined ? {} : { clientContract: clean(value.clientContract) }),
    ...(backendBucketId === undefined ? {} : { backendBucketId }),
  };
}

/**
 * Collects stable tool references from agent metadata.
 * @param value - Declared metadata inspected without coercion.
 * @returns Stable tool IDs declared by the agent.
 */
function toolIds(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
        const id = refId(entry);
        return id === undefined ? [] : [id];
      })
    : [];
}

/**
 * Classifies public or protected client agent exposure.
 * @param value - Declared metadata inspected without coercion.
 * @returns The public or protected agent exposure.
 */
function agentClient(value: unknown): "public" | "protected" {
  return isRecord(value) && value.public === true ? "public" : "protected";
}
