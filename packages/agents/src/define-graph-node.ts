import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { normalizeId } from "@relkit/contracts";
import type { InferOutput, StandardSchemaV1 } from "@relkit/schema";
import { Effect } from "effect";
import { observeAgent } from "./agent-telemetry.js";
import { assertAgentSchemaEffect, isAgentSchemaEffect } from "./agent-validation-schema.js";
import { isRecordEffect } from "./agent-validation-value.js";
import type {
  DefineGraphNodeOptions,
  GraphNodeAny,
  GraphNodeDescriptor,
  GraphNodeResult,
} from "./define-graph-node.types.js";
import { graphNodeValidationFailure } from "./graph-node-validation-error.js";
import {
  copyGraphNodeEndsEffect,
  validateGraphNodeResultEffect,
  validatedGraphNodeInputEffect,
} from "./graph-node-validation.js";
import { RELKIT_GRAPH_NODE } from "./graph-node-symbol.js";

export type * from "./define-graph-node.types.js";
export { assertGraphNodeDestinations } from "./graph-node-validation.js";

/** Runs input validation, the user handler, and output validation in one Effect.
 * @param options - The node schemas and user implementation.
 * @param ends - Validated dynamic destinations.
 * @param input - Candidate node input.
 * @param config - LangGraph runnable configuration.
 * @returns A validated node result or GraphNodeValidationFailure.
 * @example await Effect.runPromise(runGraphNodeHandlerEffect(options, [], input));
 */
export const runGraphNodeHandlerEffect = Effect.fn("Agents.graphNode.handle")(
  function* <
    InputSchema extends StandardSchemaV1,
    OutputSchema extends StandardSchemaV1,
    Ends extends readonly string[],
  >(
    options: Pick<
      DefineGraphNodeOptions<string, InputSchema, OutputSchema, StandardSchemaV1 | undefined, Ends>,
      "input" | "output" | "handler"
    >,
    ends: Ends,
    input: unknown,
    config?: LangGraphRunnableConfig,
  ) {
    const projectedInput = yield* validatedGraphNodeInputEffect(options.input, input);
    const result = yield* Effect.tryPromise({
      try: () => Promise.resolve(options.handler(projectedInput, config)),
      catch: graphNodeValidationFailure,
    });
    return yield* validateGraphNodeResultEffect(options.output, ends, result);
  },
  (effect) => observeAgent("graph-node.handle", effect),
);

/** Defines a native LangGraph node with RELKIT schemas and declared dynamic routes.
 * @param options - Node identity, schemas, destinations, and implementation.
 * @returns An Effect with an immutable descriptor or GraphNodeValidationFailure.
 * @example Effect.runSync(defineGraphNodeEffect({ id: "step", input, output, handler }));
 */
export const defineGraphNodeEffect = Effect.fn("Agents.graphNode.define")(
  function* <
    const Id extends string,
    const InputSchema extends StandardSchemaV1,
    const OutputSchema extends StandardSchemaV1,
    const ResumeSchema extends StandardSchemaV1 | undefined = undefined,
    const Ends extends readonly string[] = readonly [],
  >(options: DefineGraphNodeOptions<Id, InputSchema, OutputSchema, ResumeSchema, Ends>) {
    if (!(yield* isRecordEffect(options))) {
      return yield* Effect.fail(
        graphNodeValidationFailure(new TypeError("Graph node options must be an object")),
      );
    }
    const asGraphFailure = (failure: { readonly message: string }) =>
      graphNodeValidationFailure(new TypeError(failure.message));
    yield* assertAgentSchemaEffect(options.input, "input").pipe(Effect.mapError(asGraphFailure));
    yield* assertAgentSchemaEffect(options.output, "output").pipe(Effect.mapError(asGraphFailure));
    if (options.resume !== undefined) {
      yield* assertAgentSchemaEffect(options.resume, "resume").pipe(
        Effect.mapError(asGraphFailure),
      );
    }
    if (typeof options.handler !== "function") {
      return yield* Effect.fail(
        graphNodeValidationFailure(new TypeError("Graph node handler is required")),
      );
    }
    const id = yield* Effect.try({
      try: () => normalizeId(options.id) as unknown as Id,
      catch: graphNodeValidationFailure,
    });
    const ends = (yield* copyGraphNodeEndsEffect(options.ends)) as Ends;
    const handler = (
      input: InferOutput<InputSchema>,
      config?: LangGraphRunnableConfig,
    ): Promise<GraphNodeResult<OutputSchema, Ends>> =>
      Effect.runPromise(
        runGraphNodeHandlerEffect(options, ends, input, config).pipe(
          Effect.catchTag("GraphNodeValidationFailure", (failure) => Effect.fail(failure.cause)),
        ),
      );
    return Object.freeze({
      [RELKIT_GRAPH_NODE]: true as const,
      kind: "graph-node" as const,
      id,
      input: options.input,
      output: options.output,
      ...(options.resume === undefined ? {} : { resume: options.resume }),
      ends,
      handler,
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.description === undefined ? {} : { description: options.description }),
      ...(options.tags === undefined ? {} : { tags: Object.freeze([...options.tags]) }),
    }) as GraphNodeDescriptor<Id, InputSchema, OutputSchema, ResumeSchema, Ends>;
  },
  (effect) => observeAgent("graph-node.define", effect),
);

/** Defines a graph node for existing synchronous authoring callers.
 * @param options - Node identity, schemas, destinations, and implementation.
 * @returns An immutable graph node descriptor.
 * @throws The original authoring error for invalid options.
 * @example const node = defineGraphNode({ id: "step", input, output, handler });
 */
export function defineGraphNode<
  const Id extends string,
  const InputSchema extends StandardSchemaV1,
  const OutputSchema extends StandardSchemaV1,
  const ResumeSchema extends StandardSchemaV1 | undefined = undefined,
  const Ends extends readonly string[] = readonly [],
>(
  options: DefineGraphNodeOptions<Id, InputSchema, OutputSchema, ResumeSchema, Ends>,
): GraphNodeDescriptor<Id, InputSchema, OutputSchema, ResumeSchema, Ends> {
  return Effect.runSync(
    defineGraphNodeEffect(options).pipe(
      Effect.catchTag("GraphNodeValidationFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}

/** Checks whether a value is a native graph node descriptor.
 * @param value - Candidate descriptor.
 * @returns An Effect with a boolean and no typed failure.
 * @example Effect.runSync(isGraphNodeDescriptorEffect(value));
 */
export const isGraphNodeDescriptorEffect = Effect.fn("Agents.graphNode.isDescriptor")(
  function* (value: unknown) {
    if (!(yield* isRecordEffect(value))) return false;
    const record = value as Record<PropertyKey, unknown>;
    return (
      record[RELKIT_GRAPH_NODE] === true &&
      record.kind === "graph-node" &&
      typeof record.id === "string" &&
      Array.isArray(record.ends) &&
      record.ends.every((destination: unknown) => typeof destination === "string") &&
      (yield* isAgentSchemaEffect(record.input)) &&
      (yield* isAgentSchemaEffect(record.output)) &&
      (record.resume === undefined || (yield* isAgentSchemaEffect(record.resume))) &&
      typeof record.handler === "function"
    );
  },
  (effect) => observeAgent("graph-node.is-descriptor", effect),
);

/** Checks a graph node descriptor for existing synchronous callers.
 * @param value - Candidate descriptor.
 * @returns Whether the value is a native graph node descriptor.
 * @example if (isGraphNodeDescriptor(value)) useNode(value);
 */
export function isGraphNodeDescriptor(value: unknown): value is GraphNodeAny {
  return Effect.runSync(isGraphNodeDescriptorEffect(value));
}
