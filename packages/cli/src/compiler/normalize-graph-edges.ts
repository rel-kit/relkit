import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import { generatedAgentMarker } from "./normalize-generated-function.js";
import { isRecord, refId, refKind } from "./normalize-utils.js";
import type { GraphEdge, NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import {
  addDependencyEdges,
  addEventEdges,
  addHookEdges,
  addProviderEdge,
  addPublicationEdges,
  addRouteEdgesEffect,
  addToolEdges,
  isTargetingDescriptor,
} from "./normalize-graph-edge-helpers.js";
import { serviceEntries } from "./normalize-graph-services.js";
import { graphIdForDescriptor, graphIdForReference } from "./normalize-graph-id.js";

/**
 * Collects and deduplicates graph-visible dependency edges.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A lazy effect that collects and deduplicates graph-visible dependency edges; unexpected access failures remain defects.
 * @see {@link normalizeCompilationEffect} for shared lazy composition and the execution boundary.
 */
export const buildGraphEdgesEffect = Effect.fn("Compiler.buildGraphEdges")(
  function* (work: NormalizationWork) {
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
    yield* Effect.forEach(
      work.descriptors,
      (descriptor) =>
        Effect.gen(function* () {
          const value = isRecord(descriptor.value) ? descriptor.value : {};
          const target = refId(value.target);
          const taskTarget = graphIdForReference(work, value.task);
          if (target && isTargetingDescriptor(descriptor.kind))
            add("targets-function", graphIdForDescriptor(descriptor), target, "primary");
          if (descriptor.kind === "job" && taskTarget && refKind(value.task) === "task")
            add("targets-task", graphIdForDescriptor(descriptor), taskTarget, "primary");
          if (descriptor.kind === "route") yield* addRouteEdgesEffect(add, descriptor, value, work);
          if (descriptor.kind === "event-trigger") addEventEdges(add, descriptor, work);
          if (descriptor.kind === "tool" && target) add("exposes-as-tool", target, descriptor.id);
          if (descriptor.kind === "agent") {
            addToolEdges(add, descriptor.id, value.tools);
            addAgentBucketEdges(add, descriptor, value);
          }
          if (descriptor.kind === "service") addServiceEdges(add, descriptor, value, work);
          if (descriptor.kind === "function") {
            addDependencyEdges(add, descriptor, value.dependencies, work);
            addPublicationEdges(add, descriptor, value.publishes);
            if (Array.isArray(value.errors)) {
              for (const error of value.errors) {
                const errorId = refId(error);
                if (errorId !== undefined) add("declares-error", descriptor.id, errorId);
              }
            }
          }
          if (descriptor.kind === "task") {
            addDependencyEdges(add, descriptor, value.dependencies, work);
            addPublicationEdges(add, descriptor, value.publishes);
          }
          if (
            descriptor.kind === "function" ||
            descriptor.kind === "tool" ||
            descriptor.kind === "task"
          ) {
            addHookEdges(add, descriptor, value);
          }
          addProviderEdge(add, descriptor, value, work);
        }),
      { discard: true },
    );
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
  },
  (effect, work) =>
    observeCompiler("normalization", "buildGraphEdges", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Collects and deduplicates graph-visible dependency edges.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Deduplicated dependency edges in deterministic graph order.
 */
export function buildGraphEdges(work: NormalizationWork): GraphEdge[] {
  return runCompilerSync(buildGraphEdgesEffect(work));
}

/**
 * Adds bucket dependencies declared by an agent.
 * @param add - Graph edge accumulator owned by this operation.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param value - Declared metadata inspected without coercion.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
function addAgentBucketEdges(
  add: (kind: string, from: string, to: string) => void,
  descriptor: NormalizedDescriptor,
  value: Record<string, unknown>,
): void {
  const bucketId = refId(value.backend);
  if (refKind(value.backend) !== "bucket" || bucketId === undefined) return;
  add("uses-bucket", descriptor.id, bucketId);
  add("uses-bucket", generatedAgentMarker(descriptor.id).functionId, bucketId);
}

/**
 * Adds graph edges for functions and specialized service capabilities.
 * @param add - Graph edge accumulator owned by this operation.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param value - Declared metadata inspected without coercion.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
function addServiceEdges(
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
  let functionOrder = 0;
  let eventOrder = 0;
  let taskOrder = 0;
  let jobOrder = 0;
  for (const [member, target] of serviceEntries(value, descriptor)) {
    const targetId = refId(target);
    const kind = isRecord(target) && isRecord(target.ref) ? target.ref.kind : undefined;
    if (targetId !== undefined && kind === "function") {
      add("exposes-function", descriptor.id, targetId, { member, order: functionOrder++ });
    } else if (targetId !== undefined && kind === "event") {
      add("exposes-event", descriptor.id, targetId, { member, order: eventOrder++ });
    } else if (targetId !== undefined && kind === "task") {
      add("exposes-task", descriptor.id, graphIdForReference(work, target) ?? targetId, {
        member,
        order: taskOrder++,
      });
    } else if (targetId !== undefined && kind === "job") {
      add("exposes-job", descriptor.id, graphIdForReference(work, target) ?? targetId, {
        member,
        order: jobOrder++,
      });
    }
  }
}
