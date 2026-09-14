import type { JsonValue } from "@relkit/contracts";
import {
  deploymentRoleProjections,
  environmentMetadata,
  selectedProviderProfile,
} from "./normalize-graph-app.js";
import { eventConfig, httpConfig } from "./normalize-graph-config.js";
import { clean } from "./normalize-graph-utils.js";
import { serviceNodeData } from "./normalize-graph-services.js";
import { channelNodeData } from "./normalize-graph-channel.js";
import { agentNodeData } from "./normalize-graph-agent.js";
import type { GraphNode, NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import { isRecord, refId, taskSchemaKey } from "./normalize-utils.js";
import { graphIdForDescriptor } from "./normalize-graph-id.js";
import { computeJobBuildId, serviceGenerationFor } from "./jobs/build-id.js";

export function graphNodeFor(
  descriptor: NormalizedDescriptor,
  work: NormalizationWork,
  middlewareOrder: ReadonlyMap<string, number>,
): GraphNode | undefined {
  const value = isRecord(descriptor.value) ? descriptor.value : {};
  const base = {
    id: graphIdForDescriptor(descriptor),
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
        defaults: clean(value.defaults),
        ...(value.telemetry === undefined ? {} : { telemetry: clean(value.telemetry) }),
        deploymentRoles: deploymentRoleProjections(value.deployment),
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
        invocationMode: value.invocationMode === "event-only" ? "event-only" : "callable",
        ...(descriptor.exposure === undefined ? {} : { exposure: descriptor.exposure }),
        input: schema(work, descriptor, "input"),
        output: schema(work, descriptor, "output"),
        ...(value.progress === undefined ? {} : { progress: schema(work, descriptor, "progress") }),
        errors: clean(value.errors),
        dependencies: dependencyMetadata(value.dependencies),
        publishes: clean(value.publishes ?? []),
        timeoutMs: clean(value.timeoutMs),
        concurrency: clean(value.concurrency),
        generated: clean(value.generated),
      };
    case "task":
      return {
        ...base,
        kind: "task",
        taskId: descriptor.id,
        version: typeof value.version === "string" ? value.version : "",
        execution: value.execution === "retryable" ? "retryable" : "durable",
        input: schema(work, descriptor, "input"),
        output: schema(work, descriptor, "output"),
        schemaHashes: schemaHashes(work, descriptor.id, ["input", "output", "progress"]),
        errors: clean(value.errors),
        dependencies: dependencyMetadata(value.dependencies),
        publishes: clean(value.publishes ?? []),
        policy: clean({ retry: value.retry, maxDuration: value.maxDuration, maxElapsed: value.maxElapsed, logging: value.logging }),
        resources: clean(value.resources),
        concurrency: clean(value.concurrency),
        capabilities: clean({ execution: value.execution, observation: value.observation }),
      };
    case "job":
      if (isRecord(value.task) && refId(value.task) !== undefined) {
        const taskValue = value.task;
        const taskId = refId(taskValue)!;
        const taskVersion = typeof taskValue.version === "string" ? taskValue.version : typeof value.version === "string" ? value.version : "";
        const buildId = typeof value.buildId === "string" && value.buildId.length > 0 ? value.buildId : computeJobBuildId(descriptor, work);
        return {
          ...base,
          kind: "job",
          executionModel: "task",
          name: typeof value.name === "string" ? value.name : "",
          jobId: descriptor.id,
          taskId,
          taskVersion,
          ...(buildId === undefined ? {} : { buildId }),
          profile: selectedProviderProfile(application, "job", text(value.service ?? value.profile)) ?? "default",
          serviceGeneration: serviceGenerationFor(work, descriptor),
          implicit: value.implicit === true,
          default: value.default === true,
          input: schema(work, descriptor, "input"),
          output: schema(work, descriptor, "output"),
          schemaHashes: schemaHashes(work, taskId, ["input", "output", "progress"]),
          errors: clean(value.errors),
          progress: schema(work, descriptor, "progress"),
          streams: clean(value.streams),
          policy: clean(value.policy ?? { admission: value.admission }),
          schedules: clean(value.schedules ?? value.schedule),
          admission: clean(value.admission),
          client: clean(value.client),
          capabilities: clean(value.capabilities),
          compatibility: clean(value.compatibility),
        };
      }
      return {
        ...base,
        kind: "job",
        input: schema(work, descriptor, "input"),
        targetFunctionId: refId(value.target) ?? "",
        profile: selectedProviderProfile(application, "job", text(value.profile)) ?? "default",
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
        input: schema(work, descriptor, "input"),
        sensitiveFields: clean(value.sensitiveFields),
        profile: selectedProviderProfile(application, "event", text(value.profile)) ?? "default",
      };
    case "bucket":
      return {
        ...base,
        kind: "bucket",
        profile: selectedProviderProfile(application, "bucket", text(value.profile)) ?? "default",
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
      return { ...base, kind: "agent", ...agentNodeData(value, descriptor, work, application) };
    case "channel":
      return { ...base, kind: "channel", ...channelNodeData(value, descriptor, work, application) };
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

function dependencyMetadata(value: unknown): JsonValue {
  const cleaned = clean(value);
  if (!isRecord(value) || !isRecord(value.agents) || !isRecord(cleaned)) return cleaned;
  const agents = Object.fromEntries(
    Object.entries(value.agents).flatMap(([name, agent]) => {
      const id = refId(agent);
      return id === undefined ? [] : [[name, { ref: { kind: "agent", id } }]];
    }),
  );
  return { ...cleaned, agents };
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function schema(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  field: string,
): JsonValue {
  if (descriptor.kind === "task") {
    const direction = field === "input" ? "input" : "output";
    return work.schemas.get(taskSchemaKey(descriptor.id, field, direction)) ?? null;
  }
  if (descriptor.kind === "job" && isRecord(descriptor.value) && isRecord(descriptor.value.task)) {
    const taskId = refId(descriptor.value.task);
    if (taskId !== undefined) {
      const direction = field === "input" ? "input" : "output";
      return work.schemas.get(taskSchemaKey(taskId, field, direction)) ?? null;
    }
  }
  return work.schemas.get(`${descriptor.id}:${field}`) ?? null;
}

function schemaHashes(
  work: NormalizationWork,
  taskId: string,
  fields: readonly string[],
): JsonValue {
  const result: Record<string, string> = {};
  for (const field of fields) {
    for (const direction of ["input", "output"] as const) {
      const key = taskSchemaKey(taskId, field, direction);
      const hash = work.schemaHashes.get(key);
      if (hash !== undefined) result[`${field}:${direction}`] = hash;
    }
  }
  return result;
}
