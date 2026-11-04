import type {
  AccessRule,
  DescriptorBase,
  DescriptorMetadata,
  MaybePromise,
} from "../contracts/index.js";
import type { InferOutput, StandardSchemaV1 } from "../schema/index.js";
import type { ErrorDescriptorAny } from "./define-error.js";
import type { FunctionToolMetadata } from "./function-tool.js";
import type { FunctionAsTool } from "./function-as-tool.types.js";
import type { FunctionAsGraphNode } from "./function-graph-node.js";
import type { FunctionHandlerResult } from "./handler-result.js";
import type { StreamOutputSchema } from "./stream.js";
import type { FunctionRef } from "./types.js";
import type { FunctionLifecycleHook, ProgressValue } from "./function-lifecycle.types.js";
import type {
  FunctionContext,
  FunctionDependencies,
  FunctionDependencyOptions,
} from "./function-context.types.js";
export type { FunctionLifecycleHook } from "./function-lifecycle.types.js";

/** Frozen callable descriptor for a defined function.
 * @example const descriptor: FunctionDescriptor<"orders.get", Input, Output, {}> = defineFunction(options);
 */
export interface FunctionDescriptor<
  Id extends string,
  Input,
  Output,
  Dependencies extends FunctionDependencies,
  Errors extends readonly ErrorDescriptorAny[] = readonly ErrorDescriptorAny[],
  InputSchema extends StandardSchemaV1 = StandardSchemaV1,
  OutputSchema extends StandardSchemaV1 = StandardSchemaV1,
  ToolMetadata extends FunctionToolMetadata | undefined = undefined,
  ProgressSchema extends StandardSchemaV1 | undefined = undefined,
>
  extends
    DescriptorBase<"function", Id>,
    FunctionRef<Id, Input, Output, Errors, InputSchema, OutputSchema> {
  readonly dependencies?: FunctionDependencyOptions<Dependencies>;
  readonly invocationMode: "callable";
  readonly access?: AccessRule<Input>;
  readonly progress?: ProgressSchema;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly tool?: ToolMetadata;
  readonly onBefore?: FunctionLifecycleHook<Input, Dependencies, ProgressSchema>;
  readonly onAfter?: FunctionLifecycleHook<Output, Dependencies, ProgressSchema>;
  readonly handler: FunctionHandler<Input, Output, Dependencies, Errors, ProgressSchema>;
  /** Creates a tool view when the output is not a stream.
   * @param options - Optional tool metadata overriding the declared metadata.
   * @returns A tool descriptor derived from this function.
   * @example descriptor.asTool({ description: "Lookup", sideEffect: "read", approval: "never" });
   */
  readonly asTool: OutputSchema extends StreamOutputSchema
    ? never
    : FunctionAsTool<Id, Input, Output, Errors, InputSchema, OutputSchema, ToolMetadata>;
  /** Creates a graph node view when the output is not a stream.
   * @param options - Optional graph node identity.
   * @returns A graph node descriptor derived from this function.
   * @example descriptor.asGraphNode({ id: "lookup" });
   */
  readonly asGraphNode: OutputSchema extends StreamOutputSchema
    ? never
    : FunctionAsGraphNode<Id, Input, Output, Errors, InputSchema, OutputSchema, Dependencies>;
}

/** Schemas, handler, and metadata used to define a function.
 * @example const options: DefineFunctionOptions<"orders.get", typeof input, typeof output> = { input, output, handler };
 */
export interface DefineFunctionOptions<
  Id extends string,
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  Dependencies extends FunctionDependencies = {},
  Errors extends readonly ErrorDescriptorAny[] = readonly [],
  ProgressSchema extends StandardSchemaV1 | undefined = undefined,
> extends DescriptorMetadata {
  readonly id?: Id;
  readonly input: InputSchema;
  readonly output: OutputSchema;
  readonly errors?: Errors;
  readonly dependencies?: Dependencies;
  /** Who may call the function: roles, permissions or a predicate, checked for every caller. */
  readonly access?: AccessRule<InferOutput<InputSchema>>;
  readonly progress?: ProgressSchema;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly tool?: FunctionToolMetadata;
  readonly onBefore?: FunctionLifecycleHook<InferOutput<InputSchema>, Dependencies, ProgressSchema>;
  readonly onAfter?: FunctionLifecycleHook<InferOutput<OutputSchema>, Dependencies, ProgressSchema>;
  readonly handler: FunctionHandler<
    InferOutput<InputSchema>,
    InferOutput<OutputSchema>,
    Dependencies,
    Errors,
    ProgressSchema
  >;
}

/** Handler contract for a declared function.
 * @param input - Validated input value.
 * @param context - Invocation context and declared dependencies.
 * @returns Handler output, declared failure, or Effect with those channels.
 * @example const handler: FunctionHandler<Input, Output, {}> = async (input) => input;
 */
export type FunctionHandler<
  Input,
  Output,
  Dependencies extends FunctionDependencies,
  Errors extends readonly ErrorDescriptorAny[] = readonly ErrorDescriptorAny[],
  ProgressSchema extends StandardSchemaV1 | undefined = undefined,
> = (
  input: Input,
  context: FunctionContext<Dependencies, ProgressValue<ProgressSchema>>,
) => MaybePromise<FunctionHandlerResult<Output, Errors>>;
