import type { GraphNode } from "./normalize-types.js";
import type { NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import { clean } from "./normalize-graph-utils.js";
import { isRecord, refKind } from "./normalize-utils.js";

export function generatedFunctionNode(
  descriptor: NormalizedDescriptor,
  work: NormalizationWork,
): GraphNode {
  const generated = generatedAgentMarker(descriptor.id);
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  return {
    kind: "function",
    invocationMode: "callable",
    publishes: [],
    id: generated.functionId,
    source: descriptor.source,
    ...(descriptor.domainId === undefined ? {} : { domainId: descriptor.domainId }),
    exposure: "internal",
    input: work.schemas.get(`${descriptor.id}:input`) ?? null,
    output: work.schemas.get(`${descriptor.id}:output`) ?? null,
    ...(refKind(value.backend) === "bucket"
      ? { dependencies: { buckets: { backend: clean(value.backend) } } }
      : {}),
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
