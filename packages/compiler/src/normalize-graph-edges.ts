import { isRecord, refId } from "./normalize-utils.js";
import type { GraphEdge, NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";

const dependencyEdges: Readonly<Record<string, string>> = {
  jobs: "enqueues-job",
  events: "publishes-event",
  buckets: "uses-bucket",
  cache: "uses-cache",
  agents: "invokes-agent",
};

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
    if (descriptor.kind === "route") {
      addMiddlewareEdges(add, value.middleware, work, descriptor.id);
      const store = isRecord(value.rateLimit) ? refId(value.rateLimit.store) : undefined;
      if (store !== undefined) add("uses-cache", descriptor.id, store);
    }
    if (descriptor.kind === "event-trigger") addEventEdges(add, descriptor, work);
    if (descriptor.kind === "tool" && target) add("exposes-as-tool", target, descriptor.id);
    if (descriptor.kind === "agent") addToolEdges(add, descriptor.id, value.tools);
    if (descriptor.kind === "service") addServiceEdges(add, descriptor.id, value);
    if (descriptor.kind === "function") addDependencyEdges(add, descriptor, value.dependencies);
    addProviderEdge(add, descriptor, value, work);
  }
  return edges;
}

function addProviderEdge(
  add: (
    kind: string,
    from: string,
    to: string,
    metadata?: string | Record<string, unknown>,
  ) => void,
  descriptor: NormalizedDescriptor,
  value: Record<string, unknown>,
  work: NormalizationWork,
): void {
  const profile =
    descriptor.kind === "agent"
      ? "default"
      : ["bucket", "cache", "job", "event-trigger"].includes(descriptor.kind)
        ? (value.profile ?? "default")
        : undefined;
  if (typeof profile !== "string") return;
  if (work.nodes.some((node) => node.kind === "provider" && node.id === profile)) {
    add("uses-provider-profile", descriptor.id, profile);
  }
}

function isTargetingDescriptor(kind: string): boolean {
  return kind === "route" || kind === "event-trigger" || kind === "job" || kind === "tool";
}

function addMiddlewareEdges(
  add: (
    kind: string,
    from: string,
    to: string,
    metadata?: string | Record<string, unknown>,
  ) => void,
  value: unknown,
  work: NormalizationWork,
  routeId: string,
): void {
  if (!Array.isArray(value)) return;
  for (const entry of value) {
    const middlewareId = refId(entry);
    const middleware =
      middlewareId === undefined ? undefined : work.middlewareReferences.get(middlewareId);
    const target = isRecord(middleware?.value) ? refId(middleware.value.target) : undefined;
    if (target) add("targets-function", routeId, target, "middleware");
  }
}

function addEventEdges(
  add: (
    kind: string,
    from: string,
    to: string,
    metadata?: string | Record<string, unknown>,
  ) => void,
  descriptor: NormalizedDescriptor,
  work: NormalizationWork,
): void {
  const expansion = work.selectorExpansions.get(descriptor.id) ?? [];
  for (const pair of expansion) {
    const at = pair.lastIndexOf("@");
    add("listens-to-event", descriptor.id, at < 0 ? pair : pair.slice(0, at));
  }
}

function addDependencyEdges(
  add: (
    kind: string,
    from: string,
    to: string,
    metadata?: string | Record<string, unknown>,
  ) => void,
  descriptor: NormalizedDescriptor,
  dependencies: unknown,
): void {
  if (!isRecord(dependencies)) return;
  for (const [name, refs] of Object.entries(dependencies)) {
    const kind = dependencyEdges[name];
    if (kind === undefined || !isRecord(refs)) continue;
    for (const reference of Object.values(refs)) {
      const target = refId(reference);
      if (target) add(kind, descriptor.id, target);
    }
  }
}

function addToolEdges(
  add: (
    kind: string,
    from: string,
    to: string,
    metadata?: string | Record<string, unknown>,
  ) => void,
  agentId: string,
  tools: unknown,
): void {
  if (!Array.isArray(tools)) return;
  for (const tool of tools) {
    const toolId = refId(tool);
    if (toolId) add("uses-tool", agentId, toolId);
  }
}

function addServiceEdges(
  add: (
    kind: string,
    from: string,
    to: string,
    metadata?: string | Record<string, unknown>,
  ) => void,
  serviceId: string,
  value: Record<string, unknown>,
): void {
  if (isRecord(value.functions)) {
    for (const [order, [member, target]] of Object.entries(value.functions).entries()) {
      const functionId = refId(target);
      if (functionId !== undefined)
        add("contains-function", serviceId, functionId, { member, order });
    }
  }
  if (Array.isArray(value.middleware)) {
    for (const [order, entry] of value.middleware.entries()) {
      const middlewareId = refId(entry);
      if (middlewareId !== undefined)
        add("uses-service-middleware", serviceId, middlewareId, { order });
    }
  }
}
