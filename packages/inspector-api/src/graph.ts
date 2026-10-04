import type { GraphCollection } from "./graph.types.js";
export type { GraphCollection } from "./graph.types.js";
import { Effect, Schema } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import {
  runInspectorPromise as runExecutionPromise,
  runInspectorSync as runExecutionSync,
} from "./native-edge.js";
import { inspectorExecution } from "./execution.js";
import { projectionAttempt } from "./native-edge.js";
import { type JsonValue } from "@relkit/contracts";
import { identity, isRecord, page, type ResolvedActiveGeneration } from "./shared.js";
import { projectDescriptors, projectObservedEdges } from "./graph-utils.js";
import { projectIntegrationProvenance } from "./topology.js";

/** Declared public graph collection vocabulary; no arbitrary object paths are accepted. */
export const GRAPH_COLLECTIONS = Object.freeze([
  "descriptors",
  "routes",
  "middlewares",
  "functions",
  "jobs",
  "events",
  "buckets",
  "cache",
  "tools",
  "agents",
  "channels",
  "errors",
  "services",
  "providers",
] as const);

/** Selective graph availability/detail failure preserving the positional public constructor. */
export class InspectorGraphError extends Schema.TaggedError<InspectorGraphError>()(
  "InspectorGraphError",
  {
    code: Schema.Literals(["RELKIT_INSPECTOR_GRAPH_UNAVAILABLE", "RELKIT_INSPECTOR_NOT_FOUND"]),
    status: Schema.Literals([404, 503]),
    message: Schema.String,
  },
) {
  constructor(
    code: "RELKIT_INSPECTOR_GRAPH_UNAVAILABLE" | "RELKIT_INSPECTOR_NOT_FOUND",
    status: 404 | 503,
  ) {
    super({ code, status, message: code });
    this.name = "InspectorGraphError";
  }
}

/**
 * Projects the active graph with declared and observed topology evidence.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @returns Public graph JSON retaining existing identity and version fields.
 */
function graphSnapshotValue(generation: ResolvedActiveGeneration): JsonValue {
  const data = graphData(generation.graph);
  if (data === undefined) throw new InspectorGraphError("RELKIT_INSPECTOR_GRAPH_UNAVAILABLE", 503);
  const observedEdges = projectObservedEdges(generation.observedEdges);
  const integrations = projectIntegrationProvenance(generation.integrations);
  return {
    ...identity(generation),
    graph: {
      ...data,
      ...(observedEdges.length === 0 ? {} : { observedEdges }),
      ...(integrations.length === 0 ? {} : { integrations }),
    },
    ...data,
    ...(observedEdges.length === 0 ? {} : { observedEdges }),
    ...(integrations.length === 0 ? {} : { integrations }),
  } as JsonValue;
}

/**
 * Projects the active graph with declared and observed topology evidence.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @returns A lazy observed Effect containing public graph JSON retaining existing identity and version fields.
 */
export const graphSnapshotEffect = Effect.fn("Inspector.graphSnapshot")(
  (generation: ResolvedActiveGeneration) => projectionAttempt(() => graphSnapshotValue(generation)),
  (effect) => observeExecution("inspector", "graphSnapshot", effect),
);

/**
 * Projects the active graph with declared and observed topology evidence.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @returns Public graph JSON retaining existing identity and version fields.
 */
export function graphSnapshot(generation: ResolvedActiveGeneration): Promise<JsonValue> {
  return runExecutionPromise(inspectorExecution, graphSnapshotEffect(generation));
}

/**
 * Projects and paginates one declared graph collection.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param collection - Declared graph or runtime collection; arbitrary object paths are not accepted.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns A bounded public graph page preserving continuation behavior.
 */
function graphListValue(
  generation: ResolvedActiveGeneration,
  collection: GraphCollection,
  request: Request,
): JsonValue {
  const items =
    collection === "descriptors" && generation.descriptors !== undefined
      ? projectDescriptors(generation.descriptors)
      : graphItems(generation.graph, collection);
  if (items === undefined) throw new InspectorGraphError("RELKIT_INSPECTOR_GRAPH_UNAVAILABLE", 503);
  return { ...identity(generation), ...page(items, request) } as JsonValue;
}

/**
 * Projects and paginates one declared graph collection.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param collection - Declared graph or runtime collection; arbitrary object paths are not accepted.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns A lazy observed Effect containing a bounded public graph page preserving continuation behavior.
 */
export const graphListEffect = Effect.fn("Inspector.graphList")(
  (generation: ResolvedActiveGeneration, collection: GraphCollection, request: Request) =>
    projectionAttempt(() => graphListValue(generation, collection, request)),
  (effect) => observeExecution("inspector", "graphList", effect),
);

/**
 * Projects and paginates one declared graph collection.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param collection - Declared graph or runtime collection; arbitrary object paths are not accepted.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns A bounded public graph page preserving continuation behavior.
 */
export function graphList(
  generation: ResolvedActiveGeneration,
  collection: GraphCollection,
  request: Request,
): Promise<JsonValue> {
  return runExecutionPromise(inspectorExecution, graphListEffect(generation, collection, request));
}

/**
 * Projects a declaration and only edges touching its identifier.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param collection - Declared graph or runtime collection; arbitrary object paths are not accepted.
 * @param id - Declaration or native record identifier selected by the caller.
 * @returns The existing public declaration detail envelope.
 */
function graphDetailValue(
  generation: ResolvedActiveGeneration,
  collection: GraphCollection,
  id: string,
): JsonValue {
  const items =
    collection === "descriptors" && generation.descriptors !== undefined
      ? projectDescriptors(generation.descriptors)
      : graphItems(generation.graph, collection);
  const item = items?.find((value) => isRecord(value) && value.id === id);
  if (item === undefined) throw new InspectorGraphError("RELKIT_INSPECTOR_NOT_FOUND", 404);
  const data = graphData(generation.graph);
  const declaredEdges = data?.edges.filter((edge) => edgeTouches(edge, id));
  const observedEdges = projectObservedEdges(generation.observedEdges).filter((edge) =>
    edgeTouches(edge, id),
  );
  return {
    ...identity(generation),
    descriptor: item,
    node: item,
    ...(declaredEdges === undefined ? {} : { declaredEdges }),
    ...(observedEdges.length === 0 ? {} : { observedEdges }),
  } as JsonValue;
}

/**
 * Projects a declaration and only edges touching its identifier.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param collection - Declared graph or runtime collection; arbitrary object paths are not accepted.
 * @param id - Declaration or native record identifier selected by the caller.
 * @returns A lazy observed Effect containing the existing public declaration detail envelope.
 */
export const graphDetailEffect = Effect.fn("Inspector.graphDetail")(
  (generation: ResolvedActiveGeneration, collection: GraphCollection, id: string) =>
    projectionAttempt(() => graphDetailValue(generation, collection, id)),
  (effect) => observeExecution("inspector", "graphDetail", effect),
);

/**
 * Projects a declaration and only edges touching its identifier.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param collection - Declared graph or runtime collection; arbitrary object paths are not accepted.
 * @param id - Declaration or native record identifier selected by the caller.
 * @returns The existing public declaration detail envelope.
 */
export function graphDetail(
  generation: ResolvedActiveGeneration,
  collection: GraphCollection,
  id: string,
): JsonValue {
  return runExecutionSync(inspectorExecution, graphDetailEffect(generation, collection, id));
}

/**
 * Projects a safe declaration source location without exposing provider paths.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param id - Declaration or native record identifier selected by the caller.
 * @returns The existing public source envelope, or its not-found failure.
 */
function sourceDetailValue(generation: ResolvedActiveGeneration, id: string): JsonValue {
  const node = graphItems(generation.graph, "descriptors")?.find(
    (value) => isRecord(value) && value.id === id,
  );
  if (!isRecord(node) || node.source === undefined)
    throw new InspectorGraphError("RELKIT_INSPECTOR_NOT_FOUND", 404);
  return { ...identity(generation), id, source: node.source } as JsonValue;
}

/**
 * Projects a safe declaration source location without exposing provider paths.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param id - Declaration or native record identifier selected by the caller.
 * @returns A lazy observed Effect containing the existing public source envelope, or its not-found failure.
 */
export const sourceDetailEffect = Effect.fn("Inspector.sourceDetail")(
  (generation: ResolvedActiveGeneration, id: string) =>
    projectionAttempt(() => sourceDetailValue(generation, id)),
  (effect) => observeExecution("inspector", "sourceDetail", effect),
);

/**
 * Projects a safe declaration source location without exposing provider paths.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @param id - Declaration or native record identifier selected by the caller.
 * @returns The existing public source envelope, or its not-found failure.
 */
export function sourceDetail(generation: ResolvedActiveGeneration, id: string): JsonValue {
  return runExecutionSync(inspectorExecution, sourceDetailEffect(generation, id));
}

import { graphData, graphItems, edgeTouches } from "./graph-projection.js";
