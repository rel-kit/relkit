import type { JsonValue } from "@zsys/contracts";
import { clean } from "./normalize-graph-utils.js";
import { eventConfig, httpConfig } from "./normalize-graph-config.js";
import { providerNodes } from "./normalize-graph-providers.js";
import { generatedAgentMarker, generatedFunctionNode } from "./normalize-generated-function.js";
import type { GraphNode, NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import { isRecord, refId } from "./normalize-utils.js";

export function buildGraphNodes(work: NormalizationWork): GraphNode[] {
  const nodes: GraphNode[] = [];
  for (const descriptor of work.descriptors) {
    const node = nodeFor(descriptor, work);
    if (node !== undefined) nodes.push(node);
    if (descriptor.kind === "agent") nodes.push(generatedFunctionNode(descriptor, work));
    if (descriptor.kind === "app") {
      nodes.push(...environmentNodes(descriptor));
      nodes.push(...providerNodes(descriptor));
    }
  }
  return nodes;
}

function nodeFor(descriptor: NormalizedDescriptor, work: NormalizationWork): GraphNode | undefined {
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  const base = { id: descriptor.id, source: descriptor.source };
  switch (descriptor.kind) {
    case "app":
      return {
        ...base,
        kind: "app",
        environment: environmentMetadata(value.env),
        providerProfiles: profiles(value.providers),
        observability: clean(value.observability),
        defaults: clean(value.defaults),
      };
    case "route":
      return {
        ...base,
        kind: "trigger",
        triggerType: "http",
        targetFunctionId: refId(value.target) ?? "",
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
      };
    case "job":
      return {
        ...base,
        kind: "job",
        input: schema(work, descriptor, "input"),
        targetFunctionId: refId(value.target) ?? "",
        profile: value.profile === undefined ? "default" : value.profile,
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
      };
    case "bucket":
      return {
        ...base,
        kind: "bucket",
        profile: value.profile === undefined ? "default" : value.profile,
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
        profile: value.profile === undefined ? "default" : value.profile,
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
        timeoutMs: clean(value.timeoutMs),
      };
    case "agent":
      return {
        ...base,
        kind: "agent",
        input: schema(work, descriptor, "input"),
        output: schema(work, descriptor, "output"),
        modelProfile: typeof value.modelProfile === "string" ? value.modelProfile : "",
        instructions: clean(value.instructions),
        toolIds: toolIds(value.tools),
        limits: clean(value.limits),
        generatedFunction: generatedAgentMarker(descriptor.id),
      };
    default:
      return undefined;
  }
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

function environmentMetadata(value: unknown): JsonValue {
  return isRecord(value) && isRecord(value.metadata) ? clean(value.metadata) : {};
}

function profiles(value: unknown): readonly string[] {
  const names = new Set<string>(["default"]);
  if (!isRecord(value)) return ["default"];
  for (const provider of Object.values(value)) {
    const metadata =
      isRecord(provider) && isRecord(provider.metadata) ? provider.metadata : undefined;
    const profileMap = metadata && isRecord(metadata.profiles) ? metadata.profiles : undefined;
    if (profileMap) Object.keys(profileMap).forEach((name) => names.add(name));
  }
  return [...names].sort();
}

function environmentNodes(descriptor: NormalizedDescriptor): GraphNode[] {
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  const env = isRecord(value.env) && isRecord(value.env.metadata) ? value.env.metadata : {};
  return Object.entries(env).map(([name, metadata]) => {
    const data = isRecord(metadata) ? metadata : {};
    return {
      kind: "env",
      id: name,
      source: descriptor.source,
      name,
      type: typeof data.type === "string" ? data.type : "",
      requiredIn: textList(data.requiredIn),
      hasDefault: data.hasDefault === true,
      sensitive: data.sensitive === true,
      ...(typeof data.description === "string" ? { description: data.description } : {}),
    };
  });
}

function textList(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
