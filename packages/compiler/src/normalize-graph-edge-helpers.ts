import { middlewareForRoute } from "./middleware-coverage.js";
import { requestedProviderProfile, selectedProviderProfile } from "./normalize-graph-app.js";
import type { NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import { isRecord, refId } from "./normalize-utils.js";

const dependencyEdges: Readonly<Record<string, string>> = {
  jobs: "enqueues-job",
  buckets: "uses-bucket",
  cache: "uses-cache",
  agents: "invokes-agent",
};

export type GraphEdgeAdder = (
  kind: string,
  from: string,
  to: string,
  metadata?: string | Record<string, unknown>,
) => void;

export function addProviderEdge(
  add: GraphEdgeAdder,
  descriptor: NormalizedDescriptor,
  value: Record<string, unknown>,
  work: NormalizationWork,
): void {
  const capability = providerCapability(descriptor.kind);
  if (capability === undefined) return;
  const application = work.descriptors.find((entry) => entry.kind === "app")?.value;
  const profile =
    selectedProviderProfile(
      application,
      capability,
      requestedProviderProfile(descriptor.kind, value),
    ) ?? "default";
  const bindingId = `provider.${capability}.${profile}`;
  if (work.nodes.some((node) => node.kind === "provider" && node.id === bindingId)) {
    add("uses-provider-profile", descriptor.id, bindingId);
  }
}

export function addHookEdges(
  add: GraphEdgeAdder,
  descriptor: NormalizedDescriptor,
  value: Record<string, unknown>,
): void {
  for (const phase of ["before", "after"] as const) {
    const hook = value[phase === "before" ? "onBefore" : "onAfter"];
    if (typeof hook === "function" || (isRecord(hook) && hook.$relkit === "function")) {
      add("uses-hook", descriptor.id, `${descriptor.id}.${phase}`, { phase });
    }
  }
}

export function addEventEdges(
  add: GraphEdgeAdder,
  descriptor: NormalizedDescriptor,
  work: NormalizationWork,
): void {
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  if (typeof value.eventId === "string") add("listens-to-event", descriptor.id, value.eventId);
}

export function addPublicationEdges(
  add: GraphEdgeAdder,
  descriptor: NormalizedDescriptor,
  publishes: unknown,
): void {
  if (!Array.isArray(publishes)) return;
  for (const eventId of publishes) {
    if (typeof eventId === "string") add("publishes-event", descriptor.id, eventId);
  }
}

export function addDependencyEdges(
  add: GraphEdgeAdder,
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

export function addToolEdges(add: GraphEdgeAdder, agentId: string, tools: unknown): void {
  if (!Array.isArray(tools)) return;
  for (const tool of tools) {
    const toolId = refId(tool);
    if (toolId) add("uses-tool", agentId, toolId);
  }
}

export function addRouteEdges(
  add: GraphEdgeAdder,
  descriptor: NormalizedDescriptor,
  value: Record<string, unknown>,
  work: NormalizationWork,
): void {
  for (const middleware of middlewareForRoute(descriptor, work)) {
    add("uses-middleware", descriptor.id, middleware.id, {
      order: middleware.order,
      match: middleware.match,
    });
  }
  const store = isRecord(value.rateLimit) ? refId(value.rateLimit.store) : undefined;
  if (store !== undefined) add("uses-cache", descriptor.id, store);
  const mountedService = isRecord(value.auth) ? refId(value.auth.service) : undefined;
  if (mountedService !== undefined) add("mounts-service", descriptor.id, mountedService);
}

export function isTargetingDescriptor(kind: string): boolean {
  return kind === "route" || kind === "event-trigger" || kind === "job" || kind === "tool";
}

function providerCapability(kind: string): string | undefined {
  return (
    {
      bucket: "bucket",
      cache: "cache",
      job: "job",
      event: "event",
      "event-trigger": "event",
      agent: "model",
    } as Record<string, string>
  )[kind];
}
