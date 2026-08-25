import type { EventTriggerConfig, GraphNode } from "@zsys/graph";
import type { FromGraphOptions } from "./from-graph-validation.js";
import { byLogical, isManaged, nodes } from "./from-graph-validation.js";
import { iam } from "./from-graph-aws.js";
import { base, type PlanContext } from "./from-graph-context.js";

export function events(context: PlanContext) {
  return nodes(context.graph.nodes, "event")
    .filter(() => isManaged(context.providers, "events", "default"))
    .map((event) => ({
      ...base(
        context,
        event.id,
        "event",
        "events",
        "default",
        iam("events", event.id, context.graph.edges),
      ),
      version: event.version,
      payload: event.payload,
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
      return isManaged(context.providers, "events", config.profile ?? "default");
    })
    .map((node) => {
      const config = node.config as unknown as EventTriggerConfig;
      const profile = config.profile ?? "default";
      return {
        ...base(
          context,
          node.id,
          "event-trigger",
          "events",
          profile,
          config.delivery === "durable" ? iam("jobs", node.id, context.graph.edges) : [],
        ),
        targetFunctionId: node.targetFunctionId,
        expansion: [...config.expansion].sort(),
        delivery: config.delivery,
        ...(defined(config.retry) ? { retry: config.retry } : {}),
        ...(defined(config.concurrency) ? { concurrency: config.concurrency } : {}),
      };
    })
    .sort(byLogical);
}

export function buckets(context: PlanContext) {
  return nodes(context.graph.nodes, "bucket")
    .filter((bucket) => isManaged(context.providers, "buckets", bucket.profile))
    .map((bucket) => ({
      ...base(
        context,
        bucket.id,
        "bucket",
        "buckets",
        bucket.profile,
        iam("buckets", bucket.id, context.graph.edges),
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
        iam("cache", cache.id, context.graph.edges),
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
