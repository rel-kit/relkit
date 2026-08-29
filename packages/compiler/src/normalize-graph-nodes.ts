import { environmentNodes } from "./normalize-graph-app.js";
import { providerNodes } from "./normalize-graph-providers.js";
import { generatedFunctionNode } from "./normalize-generated-function.js";
import { graphNodeFor } from "./normalize-graph-node.js";
import type { GraphNode, NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import { isRecord } from "./normalize-utils.js";
export function buildGraphNodes(work: NormalizationWork): GraphNode[] {
  const nodes: GraphNode[] = [];
  const middlewareOrder = new Map(
    [...work.middlewareReferences.keys()].sort().map((id, order) => [id, order]),
  );
  for (const descriptor of work.descriptors) {
    const node = graphNodeFor(descriptor, work, middlewareOrder);
    if (node !== undefined) nodes.push(node);
    nodes.push(...hookNodes(descriptor));
    if (descriptor.kind === "agent") nodes.push(generatedFunctionNode(descriptor, work));
    if (descriptor.kind === "app") {
      nodes.push(...environmentNodes(descriptor));
      nodes.push(...providerNodes(descriptor));
    }
  }
  return nodes;
}
function hookNodes(descriptor: NormalizedDescriptor): GraphNode[] {
  if (descriptor.kind !== "function" && descriptor.kind !== "tool") return [];
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  return (["before", "after"] as const).flatMap((phase) => {
    const hook = value[phase === "before" ? "onBefore" : "onAfter"];
    if (!isExecutableMarker(hook)) return [];
    return [
      {
        kind: "hook",
        id: `${descriptor.id}.${phase}`,
        source: descriptor.source,
        ...(descriptor.domainId === undefined ? {} : { domainId: descriptor.domainId }),
        ownerId: descriptor.id,
        ownerKind: descriptor.kind,
        phase,
      },
    ];
  });
}
function isExecutableMarker(value: unknown): boolean {
  return typeof value === "function" || (isRecord(value) && value.$relkit === "function");
}
