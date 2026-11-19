import type { FunctionDescriptorFactoryOptions } from "./function-descriptor-factory.js";

/** Internal callable definition before the invocation mode is fixed.
 * @example const options: FunctionImplementationOptions = { input, output, handler };
 */
export type FunctionImplementationOptions = Omit<
  FunctionDescriptorFactoryOptions,
  "id" | "invocationMode"
> & { readonly id?: string };

import type { InferOutput, StandardSchemaV1 } from "../schema/index.js";
import type { Effect } from "effect";
import type {
  ErrorListOf,
  FunctionCallOptions,
  FunctionCallValidation,
  FunctionUnknownOptions,
  ToolMetadataOf,
} from "./define-function-inference.types.js";
import type { FunctionOperationError } from "./function-observability.js";
import type { FunctionDependencies, FunctionDescriptor } from "./types.js";

/** Public function constructor preserving schema inference. It is one signature, not an
 * overload per form, so a mistake in the options is reported once and where it is.
 * @param options - Schemas, handler, dependencies, and function metadata.
 * @returns A frozen callable descriptor with inferred input and output types.
 * @example const greet = defineFunction({ input, output, handler });
 */
export interface DefineFunction {
  /** Defines a function; `dependencies` is optional and types the handler's context.
   * @param options - Schemas, handler, dependency map, and function metadata.
   * @returns A callable descriptor whose context includes the declared dependencies.
   * @example const lookup = defineFunction({ input, output, dependencies, handler });
   */
  <
    const Id extends string,
    const InputSchema extends StandardSchemaV1,
    const OutputSchema extends StandardSchemaV1,
    const Dependencies extends FunctionDependencies = {},
    const ProgressSchema extends StandardSchemaV1 | undefined = undefined,
    const Options extends FunctionCallOptions<
      Id,
      InputSchema,
      OutputSchema,
      Dependencies,
      ProgressSchema
    > = FunctionCallOptions<Id, InputSchema, OutputSchema, Dependencies, ProgressSchema>,
  >(
    options: FunctionCallOptions<Id, InputSchema, OutputSchema, Dependencies, ProgressSchema> &
      Options &
      FunctionCallValidation<NoInfer<Options>, InferOutput<OutputSchema>> &
      FunctionUnknownOptions<
        NoInfer<Options>,
        keyof FunctionCallOptions<Id, InputSchema, OutputSchema, Dependencies, ProgressSchema>
      >,
  ): FunctionDescriptor<
    Id,
    InferOutput<InputSchema>,
    InferOutput<OutputSchema>,
    Dependencies,
    ErrorListOf<Options>,
    InputSchema,
    OutputSchema,
    ToolMetadataOf<Options>,
    ProgressSchema
  >;
}

/** Effect constructor with the same schema and handler inference as defineFunction. */
export interface DefineFunctionEffect {
  <
    const Id extends string,
    const InputSchema extends StandardSchemaV1,
    const OutputSchema extends StandardSchemaV1,
    const Dependencies extends FunctionDependencies = {},
    const ProgressSchema extends StandardSchemaV1 | undefined = undefined,
    const Options extends FunctionCallOptions<
      Id,
      InputSchema,
      OutputSchema,
      Dependencies,
      ProgressSchema
    > = FunctionCallOptions<Id, InputSchema, OutputSchema, Dependencies, ProgressSchema>,
  >(
    options: FunctionCallOptions<Id, InputSchema, OutputSchema, Dependencies, ProgressSchema> &
      Options &
      FunctionCallValidation<NoInfer<Options>, InferOutput<OutputSchema>> &
      FunctionUnknownOptions<
        NoInfer<Options>,
        keyof FunctionCallOptions<Id, InputSchema, OutputSchema, Dependencies, ProgressSchema>
      >,
  ): Effect.Effect<
    FunctionDescriptor<
      Id,
      InferOutput<InputSchema>,
      InferOutput<OutputSchema>,
      Dependencies,
      ErrorListOf<Options>,
      InputSchema,
      OutputSchema,
      ToolMetadataOf<Options>,
      ProgressSchema
    >,
    FunctionOperationError
  >;
}
