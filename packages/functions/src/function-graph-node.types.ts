import type { DescriptorMetadata, Ref } from "@relkit/contracts";
import type { InferInput, StandardSchemaV1 } from "@relkit/schema";
import type { Effect } from "effect";
import type { ErrorDescriptorAny } from "./define-error.js";
import type { FunctionOperationError } from "./function-observability.js";
import type { FunctionDependencies } from "./types.js";
import type { RELKIT_FUNCTION_GRAPH_NODE } from "./function-graph-node.js";

/** Optional graph node identity override.
 * @example const options: FunctionGraphNodeOptions = { id: "lookup" };
 */
export interface FunctionGraphNodeOptions<Id extends string = string> {
  readonly id?: Id;
}

/** Frozen graph view of a callable function descriptor.
 * @example const node: FunctionGraphNodeDescriptor = fn.asGraphNode();
 */
export interface FunctionGraphNodeDescriptor<
  Id extends string = string,
  FunctionId extends string = string,
  Input = unknown,
  Output = unknown,
  Errors extends readonly ErrorDescriptorAny[] = readonly ErrorDescriptorAny[],
  InputSchema extends StandardSchemaV1 = StandardSchemaV1,
  OutputSchema extends StandardSchemaV1 = StandardSchemaV1,
  Dependencies extends FunctionDependencies = FunctionDependencies,
> extends DescriptorMetadata {
  readonly [RELKIT_FUNCTION_GRAPH_NODE]: true;
  readonly kind: "function-graph-node";
  readonly id: Id;
  readonly target: Ref<"function", FunctionId>;
  readonly input: InputSchema;
  readonly output: OutputSchema;
  readonly errors?: Errors;
  readonly dependencies?: Dependencies;
  /** Invokes the source function using services supplied when the Effect runs.
   * @param input - Value accepted by the source input schema.
   * @returns Validated output or a tagged dispatch failure.
   * @example yield* node.invokeEffect({ id: "one" });
   */
  readonly invokeEffect: (
    input: InferInput<InputSchema>,
  ) => Effect.Effect<Output, FunctionOperationError>;
  /** Invokes the source function through the common dispatcher.
   * @param input - Value accepted by the source input schema.
   * @returns Validated output or an invocation rejection.
   * @example await node.invoke({ id: "one" });
   */
  readonly invoke: (input: InferInput<InputSchema>) => Promise<Output>;
  readonly __input?: Input;
  readonly __output?: Output;
}

/** Overloads for creating a graph view with a derived or explicit ID.
 * @example const node = fn.asGraphNode({ id: "lookup" });
 */
export type FunctionAsGraphNode<
  FunctionId extends string,
  Input,
  Output,
  Errors extends readonly ErrorDescriptorAny[],
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  Dependencies extends FunctionDependencies,
> = {
  /** Creates a graph view with an explicit node ID.
   * @param options - Required stable node ID.
   * @returns Frozen graph node descriptor.
   * @example fn.asGraphNode({ id: "lookup" });
   */
  <const NodeId extends string>(
    options: FunctionGraphNodeOptions<NodeId> & { readonly id: NodeId },
  ): FunctionGraphNodeDescriptor<
    NodeId,
    FunctionId,
    Input,
    Output,
    Errors,
    InputSchema,
    OutputSchema,
    Dependencies
  >;
  /** Creates a graph view using the function ID.
   * @returns Frozen graph node descriptor.
   * @example fn.asGraphNode();
   */
  (): FunctionGraphNodeDescriptor<
    FunctionId,
    FunctionId,
    Input,
    Output,
    Errors,
    InputSchema,
    OutputSchema,
    Dependencies
  >;
};
