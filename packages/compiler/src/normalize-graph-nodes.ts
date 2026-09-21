import { environmentNodes } from "./normalize-graph-app.js";
import { providerNodes } from "./normalize-graph-providers.js";
import { generatedFunctionNode } from "./normalize-generated-function.js";
import { graphNodeFor } from "./normalize-graph-node.js";
import type { GraphNode, NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import { isRecord } from "./normalize-utils.js";
import { graphIdForDescriptor } from "./normalize-graph-id.js";
import { add } from "./normalize-pass-utils.js";
import { NORMALIZE_CODES } from "./normalize-codes.js";
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
  validateGraphIds(work, nodes);
  return nodes;
}

function validateGraphIds(work: NormalizationWork, nodes: readonly GraphNode[]): void {
  const seen = new Map<string, GraphNode>();
  for (const node of nodes) {
    const previous = seen.get(node.id);
    if (previous !== undefined && previous.kind !== node.kind) {
      const owner =
        work.descriptors.find((descriptor) => graphIdForDescriptor(descriptor) === node.id) ??
        work.descriptors[0];
      if (owner !== undefined) {
        add(
          work,
          owner,
          NORMALIZE_CODES.graphIdCollision,
          `Graph identity "${node.id}" collides with ${previous.kind} and ${node.kind} nodes.`,
        );
      }
    } else if (previous === undefined) seen.set(node.id, node);
  }
}
function hookNodes(descriptor: NormalizedDescriptor): GraphNode[] {
  if (descriptor.kind === "task") return taskHookNodes(descriptor);
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

function taskHookNodes(descriptor: NormalizedDescriptor): GraphNode[] {
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  const ownerId = graphIdForDescriptor(descriptor);
  return (["start", "success", "failure"] as const).flatMap((phase) => {
    const field = phase === "start" ? "onStart" : phase === "success" ? "onSuccess" : "onFailure";
    if (!isExecutableMarker(value[field])) return [];
    return [
      {
        kind: "hook",
        id: `${ownerId}.${phase}`,
        source: descriptor.source,
        ...(descriptor.domainId === undefined ? {} : { domainId: descriptor.domainId }),
        ownerId,
        ownerKind: "task" as const,
        phase,
      },
    ];
  });
}
function isExecutableMarker(value: unknown): boolean {
  return typeof value === "function" || (isRecord(value) && value.$relkit === "function");
}
