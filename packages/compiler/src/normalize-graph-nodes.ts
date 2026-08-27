import type { JsonValue } from "@relkit/contracts";
import { clean } from "./normalize-graph-utils.js";
import {
  environmentMetadata,
  environmentNodes,
  providerBindingIds,
} from "./normalize-graph-app.js";
import { eventConfig, httpConfig } from "./normalize-graph-config.js";
import { providerNodes } from "./normalize-graph-providers.js";
import { selectedProviderProfile } from "./normalize-graph-app.js";
import { generatedAgentMarker, generatedFunctionNode } from "./normalize-generated-function.js";
import { serviceNodeData } from "./normalize-graph-services.js";
import type { GraphNode, NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import { isRecord, refId } from "./normalize-utils.js";
export function buildGraphNodes(work: NormalizationWork): GraphNode[] {
  const nodes: GraphNode[] = [];
  const middlewareOrder = new Map(
    [...work.middlewareReferences.keys()].sort().map((id, order) => [id, order]),
  );
  for (const descriptor of work.descriptors) {
    const node = nodeFor(descriptor, work, middlewareOrder);
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
function nodeFor(
  descriptor: NormalizedDescriptor,
  work: NormalizationWork,
  middlewareOrder: ReadonlyMap<string, number>,
): GraphNode | undefined {
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  const base = { id: descriptor.id, source: descriptor.source };
  const application = work.descriptors.find((entry) => entry.kind === "app")?.value;
  switch (descriptor.kind) {
    case "app":
      return {
        ...base,
        kind: "app",
        environment: environmentMetadata(value.env),
        providerBindings: providerBindingIds(value),
        defaults: clean(value.defaults),
      };
    case "route":
      return {
        ...base,
        kind: "trigger",
        triggerType: "http",
        targetFunctionId: value.raw === true ? descriptor.id : (refId(value.target) ?? ""),
        config: httpConfig(descriptor, value, work),
      };
    case "event-trigger":
      return {
        ...base,
        kind: "trigger",
        triggerType: "event",
        targetFunctionId: refId(value.target) ?? "",
        config: eventConfig(descriptor, value, work),
      };
    case "function":
      return {
        ...base,
        kind: "function",
        input: schema(work, descriptor, "input"),
        output: schema(work, descriptor, "output"),
        errors: clean(value.errors),
        dependencies: clean(value.dependencies),
        timeoutMs: clean(value.timeoutMs),
        concurrency: clean(value.concurrency),
        generated: clean(value.generated),
      };
    case "job":
      return {
        ...base,
        kind: "job",
        input: schema(work, descriptor, "input"),
        targetFunctionId: refId(value.target) ?? "",
        profile: selectedProviderProfile(application, "jobs", text(value.profile)) ?? "default",
        retry: clean(value.retry),
        timeoutMs: clean(value.timeoutMs),
        concurrency: clean(value.concurrency),
        schedule: clean(value.schedule),
        idempotency: clean(value.idempotency),
      };
    case "event":
      return {
        ...base,
        kind: "event",
        version: typeof value.version === "number" ? value.version : 0,
        payload: schema(work, descriptor, "payload"),
        sensitiveFields: clean(value.sensitiveFields),
        profile: selectedProviderProfile(application, "events", text(value.profile)) ?? "default",
      };
    case "bucket":
      return {
        ...base,
        kind: "bucket",
        profile: selectedProviderProfile(application, "buckets", text(value.profile)) ?? "default",
        visibility: value.visibility ?? "private",
        maxObjectBytes: clean(value.maxObjectBytes),
        allowedContentTypes: clean(value.allowedContentTypes),
      };
    case "cache":
      return {
        ...base,
        kind: "cache",
        key: schema(work, descriptor, "key"),
        value: schema(work, descriptor, "value"),
        profile: selectedProviderProfile(application, "cache", text(value.profile)) ?? "default",
        defaultTtlMs: clean(value.defaultTtlMs),
        maxTtlMs: clean(value.maxTtlMs),
      };
    case "tool":
      return {
        ...base,
        kind: "tool",
        targetFunctionId: refId(value.target) ?? "",
        description: typeof value.description === "string" ? value.description : "",
        sideEffect: value.sideEffect ?? "none",
        approval: value.approval ?? "never",
        mcp: value.mcp !== false,
        timeoutMs: clean(value.timeoutMs),
      };
    case "agent":
      return {
        ...base,
        kind: "agent",
        input: schema(work, descriptor, "input"),
        output: schema(work, descriptor, "output"),
        ...(typeof value.model === "string" ? { model: value.model } : {}),
        instructions:
          isRecord(value.instructions) && value.instructions.kind === "prompt"
            ? { promptId: refId(value.instructions) ?? "" }
            : clean(value.instructions),
        toolIds: toolIds(value.tools),
        limits: clean(value.limits),
        generatedFunction: generatedAgentMarker(descriptor.id),
        profile: selectedProviderProfile(application, "models", text(value.profile)) ?? "default",
      };
    case "service":
      return { ...base, kind: "service", ...serviceNodeData(value) };
    case "middleware":
      return {
        ...base,
        kind: "middleware",
        path: typeof value.path === "string" ? value.path : "",
        order: middlewareOrder.get(descriptor.id) ?? 0,
      };
    default:
      return undefined;
  }
}
function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
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
function schema(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  field: string,
): JsonValue {
  return work.schemas.get(`${descriptor.id}:${field}`) ?? null;
}
function toolIds(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
        const id = refId(entry);
        return id === undefined ? [] : [id];
      })
    : [];
}
