import type { GraphNode } from "./normalize-types.js";
import type { NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";

export function generatedFunctionNode(
  descriptor: NormalizedDescriptor,
  work: NormalizationWork,
): GraphNode {
  const generated = generatedAgentMarker(descriptor.id);
  return {
    kind: "function",
    id: generated.functionId,
    source: descriptor.source,
    input: work.schemas.get(`${descriptor.id}:input`) ?? null,
    output: work.schemas.get(`${descriptor.id}:output`) ?? null,
    generated,
  };
}

export function generatedAgentMarker(agentId: string): {
  readonly generated: true;
  readonly generatedBy: "agent";
  readonly agentId: string;
  readonly functionId: string;
} {
  return {
    generated: true,
    generatedBy: "agent",
    agentId,
    functionId: `relkit.agent.${agentId}.invoke`,
  };
}
