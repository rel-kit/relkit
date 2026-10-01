import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import {
  deploymentRoleProjections,
  environmentMetadata,
  selectedProviderProfile,
} from "./normalize-graph-app.js";
import { eventConfig, httpConfigEffect } from "./normalize-graph-config.js";
import { clean } from "./normalize-graph-utils.js";
import { serviceNodeData } from "./normalize-graph-services.js";
import { channelNodeData } from "./normalize-graph-channel.js";
import { agentNodeData } from "./normalize-graph-agent.js";
import type { GraphNode, NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import { isRecord, refId } from "./normalize-utils.js";
import { graphIdForDescriptor } from "./normalize-graph-id.js";
import {
  dependencyMetadata,
  schema,
  schemaHashes,
  text,
  jobGraphNodeEffect,
} from "./normalize-graph-node-support.js";

/**
 * Projects one descriptor into its graph node variant.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param middlewareOrder - Normalized middleware execution order for this graph node.
 * @returns A lazy effect that projects one descriptor into its graph node variant; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const graphNodeForEffect = Effect.fn("Compiler.graphNodeFor")(
  function* (
    descriptor: NormalizedDescriptor,
    work: NormalizationWork,
    middlewareOrder: ReadonlyMap<string, number>,
  ) {
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
          config: yield* httpConfigEffect(descriptor, value, work),
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
          ...(value.progress === undefined
            ? {}
            : { progress: schema(work, descriptor, "progress") }),
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
          policy: clean({
            retry: value.retry,
            maxDuration: value.maxDuration,
            maxElapsed: value.maxElapsed,
            logging: value.logging,
          }),
          resources: clean(value.resources),
          concurrency: clean(value.concurrency),
          capabilities: clean({ execution: value.execution, observation: value.observation }),
        };
      case "job":
        return yield* jobGraphNodeEffect(base, value, descriptor, work, application);
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
        return {
          ...base,
          kind: "channel",
          ...channelNodeData(value, descriptor, work, application),
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
  },
  (effect, descriptor, work, middlewareOrder) =>
    observeCompiler("normalization", "graphNodeFor", effect, () => ({})),
);

/**
 * Projects one descriptor into its graph node variant.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param middlewareOrder - Normalized middleware execution order for this graph node.
 * @returns The descriptor's graph node, or undefined for non-graph kinds.
 */
export function graphNodeFor(
  descriptor: NormalizedDescriptor,
  work: NormalizationWork,
  middlewareOrder: ReadonlyMap<string, number>,
): GraphNode | undefined {
  return runCompilerSync(graphNodeForEffect(descriptor, work, middlewareOrder));
}
