import type { JsonValue } from "@relkit/contracts";
import { generatedAgentMarker } from "./normalize-generated-function.js";
import {
  environmentMetadata,
  providerBindingIds,
  selectedProviderProfile,
} from "./normalize-graph-app.js";
import { eventConfig, httpConfig } from "./normalize-graph-config.js";
import { clean } from "./normalize-graph-utils.js";
import { serviceNodeData } from "./normalize-graph-services.js";
import type { GraphNode, NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import { isRecord, refId } from "./normalize-utils.js";

export function graphNodeFor(
  descriptor: NormalizedDescriptor,
  work: NormalizationWork,
  middlewareOrder: ReadonlyMap<string, number>,
): GraphNode | undefined {
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  const base = {
    id: descriptor.id,
    source: descriptor.source,
    ...(descriptor.domainId === undefined ? {} : { domainId: descriptor.domainId }),
  };
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
        ...(descriptor.exposure === undefined ? {} : { exposure: descriptor.exposure }),
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
        ...(descriptor.exposure === undefined ? {} : { exposure: descriptor.exposure }),
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
      return { ...base, kind: "service", ...serviceNodeData(value, descriptor, work) };
    case "error":
      return {
        ...base,
        kind: "error",
        exposure: descriptor.exposure ?? "internal",
        data: schema(work, descriptor, "data"),
        ...(isRecord(value.http) ? { http: clean(value.http) } : {}),
        retry: clean(value.retry),
        ...(typeof value.title === "string" ? { title: value.title } : {}),
        ...(typeof value.description === "string" ? { description: value.description } : {}),
        ...(Array.isArray(value.tags) ? { tags: clean(value.tags) } : {}),
      };
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
