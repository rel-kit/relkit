import type { AnyStateSchema } from "@langchain/langgraph";
import { createUnboundIdentityEffect } from "@relkit/invocation";
import type { StandardSchemaV1 } from "@relkit/schema";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { isRecordEffect } from "./agent-validation-value.js";
import { prepareGraphDescriptor } from "./define-graph-build.js";
import { graphDefinitionFailure } from "./define-graph-error.js";
import type { DefineGraphOptions, GraphDescriptor, GraphExecution, GraphNodeLike } from "./define-graph.types.js";
import { GRAPH_EXECUTION } from "./graph-execution-symbol.js";

export type * from "./define-graph.types.js";

/** Defines an inspectable agent backed by native LangGraph.
 * @param options - Graph state, nodes, edges, limits, and client policy.
 * @returns An Effect with a frozen graph descriptor or GraphDefinitionFailure.
 * @example Effect.runSync(defineGraphEffect({ id: "flow", state, input, output, nodes, edges, limits }));
 */
export const defineGraphEffect = Effect.fn("Agents.graph.define")(
  function* <
    const Id extends string,
    const InputSchema extends StandardSchemaV1,
    const OutputSchema extends StandardSchemaV1,
    const State extends AnyStateSchema,
    const Nodes extends readonly GraphNodeLike[],
  >(options: DefineGraphOptions<Id, InputSchema, OutputSchema, State, Nodes>) {
    if (!(yield* isRecordEffect(options))) {
      return yield* Effect.fail(graphDefinitionFailure(new TypeError("Graph options must be an object")));
    }
    const assemble = yield* Effect.try({
      try: () => prepareGraphDescriptor(options),
      catch: graphDefinitionFailure,
    });
    const id = options.id === undefined
      ? yield* createUnboundIdentityEffect().pipe(
          Effect.mapError((failure) => graphDefinitionFailure(failure.cause)),
        )
      : options.id;
    return yield* Effect.try({
      try: () => assemble(id as Id),
      catch: graphDefinitionFailure,
    });
  },
  (effect) => observeAgent("graph.define", effect),
);

/** Defines a graph for existing synchronous authoring callers.
 * @param options - Graph state, nodes, edges, limits, and client policy.
 * @returns A frozen inspectable graph descriptor.
 * @throws The original invalid graph authoring or identity error.
 * @example const graph = defineGraph({ id: "flow", state, input, output, nodes, edges, limits });
 */
export function defineGraph<
  const Id extends string,
  const InputSchema extends StandardSchemaV1,
  const OutputSchema extends StandardSchemaV1,
  const State extends AnyStateSchema,
  const Nodes extends readonly GraphNodeLike[],
>(
  options: DefineGraphOptions<Id, InputSchema, OutputSchema, State, Nodes>,
): GraphDescriptor<Id, InputSchema, OutputSchema, State, Nodes> {
  return Effect.runSync(defineGraphEffect(options).pipe(
    Effect.catchTag("GraphDefinitionFailure", (failure) => Effect.fail(failure.cause)),
  ));
}

/** Reads the hidden runtime state of an authored graph.
 * @param value - Valid graph descriptor.
 * @returns An Effect with graph state and persistence declarations.
 * @example Effect.runSync(graphExecutionEffect(graph));
 */
export const graphExecutionEffect = Effect.fn("Agents.graph.execution")(
  (value: GraphDescriptor) => Effect.sync(() => value[GRAPH_EXECUTION]),
  (effect) => observeAgent("graph.execution", effect),
);

/** Reads graph runtime state for existing synchronous callers.
 * @param value - Valid graph descriptor.
 * @returns Hidden graph state and persistence declarations.
 * @example graphExecution(graph);
 */
export function graphExecution(value: GraphDescriptor): GraphExecution {
  return Effect.runSync(graphExecutionEffect(value));
}

/** Checks whether a value is a native graph descriptor.
 * @param value - Candidate descriptor.
 * @returns An Effect with a boolean and no typed failure.
 * @example Effect.runSync(isGraphDescriptorEffect(candidate));
 */
export const isGraphDescriptorEffect = Effect.fn("Agents.graph.isDescriptor")(
  (value: unknown) => Effect.sync(() =>
    value !== null && typeof value === "object" && !Array.isArray(value) &&
    (value as Record<PropertyKey, unknown>).execution === "graph" &&
    (value as Record<PropertyKey, unknown>).kind === "agent" &&
    (value as Record<PropertyKey, unknown>)[GRAPH_EXECUTION] !== undefined),
  (effect) => observeAgent("graph.is-descriptor", effect),
);

/** Checks a graph descriptor for existing synchronous callers.
 * @param value - Candidate descriptor.
 * @returns Whether the value is a native graph descriptor.
 * @example if (isGraphDescriptor(candidate)) invokeGraph(candidate);
 */
export function isGraphDescriptor(value: unknown): value is GraphDescriptor {
  return Effect.runSync(isGraphDescriptorEffect(value));
}
