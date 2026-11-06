/**
 * Effect forms of the `invoke` adapters on tool descriptors and graph nodes. The descriptor types
 * expose only the Promise `invoke`; these read the Effect adapter each descriptor carries.
 */
import type { Effect } from "effect";
import type { InferInput, StandardSchemaV1 } from "../schema/index.js";
import type { ErrorDescriptorAny } from "./define-error.js";
import type { FunctionOperationError } from "./function-observability.js";
import type {
  FunctionGraphNodeDescriptor,
  FunctionGraphNodeInvokeEffect,
} from "./function-graph-node.types.js";
import type {
  FunctionToolDescriptor,
  FunctionToolInvokeEffect,
  FunctionToolInvokeOptions,
} from "./function-tool.types.js";
import type { FunctionDependencies, FunctionRefAny } from "./types.js";

/** Invokes a tool as an Effect, with the services the tool needs supplied when it runs.
 * @param tool - Tool descriptor from `defineTool` or a function's tool view.
 * @param input - Tool argument value.
 * @param options - Optional cancellation and approval controls.
 * @returns The validated output, or a tagged tool failure.
 * @example const output = yield* callToolEffect(lookupOrder, { id: "one" });
 */
export function callToolEffect<const Id extends string, const Target extends FunctionRefAny>(
  tool: FunctionToolDescriptor<Id, Target>,
  input: InferInput<Target["input"]>,
  options?: FunctionToolInvokeOptions,
): ReturnType<FunctionToolInvokeEffect<Target>> {
  return (
    tool as unknown as { readonly invokeEffect: FunctionToolInvokeEffect<Target> }
  ).invokeEffect(input, options);
}

/** Invokes a function's graph node as an Effect through the common dispatcher.
 * @param node - Graph node view from `fn.asGraphNode()`.
 * @param input - Value accepted by the source input schema.
 * @returns The validated output, or a tagged dispatch failure.
 * @example const output = yield* callGraphNodeEffect(node, { id: "one" });
 */
export function callGraphNodeEffect<
  Id extends string,
  FunctionId extends string,
  Input,
  Output,
  Errors extends readonly ErrorDescriptorAny[],
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  Dependencies extends FunctionDependencies,
>(
  node: FunctionGraphNodeDescriptor<
    Id,
    FunctionId,
    Input,
    Output,
    Errors,
    InputSchema,
    OutputSchema,
    Dependencies
  >,
  input: InferInput<InputSchema>,
): Effect.Effect<Output, FunctionOperationError> {
  return (
    node as unknown as { readonly invokeEffect: FunctionGraphNodeInvokeEffect<Output, InputSchema> }
  ).invokeEffect(input);
}
