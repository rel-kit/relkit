import { isRecord, refId } from "./normalize-utils.js";
import type { GraphEdge, NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import {
  addDependencyEdges,
  addEventEdges,
  addHookEdges,
  addProviderEdge,
  addRouteEdges,
  addToolEdges,
  isTargetingDescriptor,
} from "./normalize-graph-edge-helpers.js";
import { serviceEntries } from "./normalize-graph-services.js";
export function buildGraphEdges(work: NormalizationWork): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const add = (
    kind: string,
    from: string,
    to: string,
    metadata?: string | Record<string, unknown>,
  ): void => {
    if (!to) return;
    const key = `${kind}\0${from}\0${to}\0${JSON.stringify(metadata ?? null)}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({
      kind,
      from,
      to,
      ...(typeof metadata === "string" ? { role: metadata } : (metadata ?? {})),
    });
  };
  for (const descriptor of work.descriptors) {
    const value = isRecord(descriptor.value) ? descriptor.value : {};
    const target = refId(value.target);
    if (target && isTargetingDescriptor(descriptor.kind))
      add("targets-function", descriptor.id, target, "primary");
    if (descriptor.kind === "route") addRouteEdges(add, descriptor, value, work);
    if (descriptor.kind === "event-trigger") addEventEdges(add, descriptor, work);
    if (descriptor.kind === "tool" && target) add("exposes-as-tool", target, descriptor.id);
    if (descriptor.kind === "agent") addToolEdges(add, descriptor.id, value.tools);
    if (descriptor.kind === "service") addServiceEdges(add, descriptor, value);
    if (descriptor.kind === "function") {
      addDependencyEdges(add, descriptor, value.dependencies);
      if (Array.isArray(value.errors)) {
        for (const error of value.errors) {
          const errorId = refId(error);
          if (errorId !== undefined) add("declares-error", descriptor.id, errorId);
        }
      }
    }
    if (descriptor.kind === "function" || descriptor.kind === "tool") {
      addHookEdges(add, descriptor, value);
    }
    addProviderEdge(add, descriptor, value, work);
  }
  for (const dependency of work.serviceDependencies) {
    add("depends-on-service", dependency.from, dependency.to);
  }
  const database = work.nodes.find(
    (node) =>
      node.kind === "service" && isRecord(node.capability) && node.capability.kind === "drizzle",
  );
  for (const service of work.nodes) {
    if (
      service.kind === "service" &&
      isRecord(service.capability) &&
      service.capability.kind === "better-auth"
    ) {
      add("depends-on-service", service.id, database?.id ?? "");
    }
  }
  return edges;
}
function addServiceEdges(
  add: (
    kind: string,
    from: string,
    to: string,
    metadata?: string | Record<string, unknown>,
  ) => void,
  descriptor: NormalizedDescriptor,
  value: Record<string, unknown>,
): void {
  let functionOrder = 0;
  let eventOrder = 0;
  for (const [member, target] of serviceEntries(value, descriptor)) {
    const targetId = refId(target);
    const kind = isRecord(target) && isRecord(target.ref) ? target.ref.kind : undefined;
    if (targetId !== undefined && kind === "function") {
      add("exposes-function", descriptor.id, targetId, { member, order: functionOrder++ });
    } else if (targetId !== undefined && kind === "event") {
      add("exposes-event", descriptor.id, targetId, { member, order: eventOrder++ });
    }
  }
}
