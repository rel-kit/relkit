import type { EventTriggerConfig, GraphNode } from "@relkit/graph";
import type { FromGraphOptions } from "./from-graph-validation.js";
import { byLogical, isManaged, nodes } from "./from-graph-validation.js";
import { accessActions } from "./from-graph-providers.js";
import { base, type PlanContext } from "./from-graph-context.js";

export function events(context: PlanContext) {
  return nodes(context.graph.nodes, "event")
    .filter((event) => isManaged(context.providers, "event", event.profile))
    .map((event) => ({
      ...base(
        context,
        event.id,
        "event",
        "event",
        event.profile,
        actions(context, "event", event.profile),
      ),
      version: event.version,
      input: event.input,
    }))
    .sort(byLogical);
}

export function eventTriggers(context: PlanContext) {
  return context.graph.nodes
    .filter(
      (node): node is Extract<GraphNode, { kind: "trigger" }> =>
        node.kind === "trigger" && node.triggerType === "event",
    )
    .filter((node) => {
      const config = node.config as unknown as EventTriggerConfig;
      return isManaged(context.providers, "event", config.profile ?? "default");
    })
    .map((node) => {
      const config = node.config as unknown as EventTriggerConfig;
      const profile = config.profile ?? "default";
      return {
        ...base(
          context,
          node.id,
          "event-trigger",
          "event",
          profile,
          config.delivery === "durable" ? actions(context, "job", "default") : [],
        ),
        targetFunctionId: node.targetFunctionId,
        eventId: config.eventId,
        eventVersion: config.eventVersion,
        delivery: config.delivery,
        ...(defined(config.retry) ? { retry: config.retry } : {}),
        ...(defined(config.concurrency) ? { concurrency: config.concurrency } : {}),
        ...(defined(config.timeoutMs) ? { timeoutMs: config.timeoutMs } : {}),
      };
    })
    .sort(byLogical);
}

export function buckets(context: PlanContext) {
  return nodes(context.graph.nodes, "bucket")
    .filter((bucket) => isManaged(context.providers, "bucket", bucket.profile))
    .map((bucket) => ({
      ...base(
        context,
        bucket.id,
        "bucket",
        "bucket",
        bucket.profile,
        actions(context, "bucket", bucket.profile),
      ),
      profile: bucket.profile,
      visibility: bucket.visibility,
      ...(defined(bucket.maxObjectBytes) ? { maxObjectBytes: bucket.maxObjectBytes } : {}),
      ...(defined(bucket.allowedContentTypes)
        ? { allowedContentTypes: [...bucket.allowedContentTypes].sort() }
        : {}),
    }))
    .sort(byLogical);
}

export function caches(context: PlanContext) {
  return nodes(context.graph.nodes, "cache")
    .filter((cache) => isManaged(context.providers, "cache", cache.profile))
    .map((cache) => ({
      ...base(
        context,
        cache.id,
        "cache",
        "cache",
        cache.profile,
        actions(context, "cache", cache.profile),
      ),
      profile: cache.profile,
      ...(defined(cache.defaultTtlMs) ? { defaultTtlMs: cache.defaultTtlMs } : {}),
      ...(defined(cache.maxTtlMs) ? { maxTtlMs: cache.maxTtlMs } : {}),
    }))
    .sort(byLogical);
}

export function routes(graphNodes: readonly GraphNode[]) {
  return graphNodes
    .filter(
      (node): node is Extract<GraphNode, { kind: "trigger" }> =>
        node.kind === "trigger" && node.triggerType === "http",
    )
    .map((node) => {
      const config = node.config as { readonly method: string; readonly path: string };
      return {
        id: node.id,
        method: config.method,
        path: config.path,
        targetFunctionId: node.targetFunctionId,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function defined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function actions(context: PlanContext, capability: string, profile: string): readonly string[] {
  const provider = context.providers.get(`provider.${capability}.${profile}`);
  return provider === undefined ? [] : accessActions(provider);
}
