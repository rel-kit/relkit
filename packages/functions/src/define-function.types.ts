import type { FunctionDescriptorFactoryOptions } from "./function-descriptor-factory.js";

/** Internal callable definition before the invocation mode is fixed.
 * @example const options: FunctionImplementationOptions = { input, output, handler };
 */
export type FunctionImplementationOptions = Omit<
  FunctionDescriptorFactoryOptions,
  "id" | "invocationMode"
> & { readonly id?: string };

import type { InferOutput, StandardSchemaV1 } from "@relkit/schema";
import type { Effect } from "effect";
import type {
  ErrorListOf,
  FunctionCallOptions,
  FunctionCallValidation,
  ToolMetadataOf,
} from "./define-function-inference.types.js";
import type { FunctionOperationError } from "./function-observability.js";
import type { FunctionDependencies, FunctionDescriptor } from "./types.js";

/** Overloaded public function constructor preserving schema inference.
 * @param options - Schemas, handler, dependencies, and function metadata.
 * @returns A frozen callable descriptor with inferred input and output types.
 * @example const greet = defineFunction({ input, output, handler });
 */
export interface DefineFunction {
  /** Defines a function without declared dependencies.
   * @param options - Schemas, handler, and function metadata.
   * @returns A callable descriptor with inferred input and output types.
   * @example const greet = defineFunction({ input, output, handler });
   */
  <
    const Id extends string,
    const InputSchema extends StandardSchemaV1,
    const OutputSchema extends StandardSchemaV1,
    const ProgressSchema extends StandardSchemaV1 | undefined = undefined,
    const Publishes extends readonly Extract<keyof Relkit.EventRegistry, string>[] = readonly [],
    const Options extends FunctionCallOptions<
      Id,
      InputSchema,
      OutputSchema,
      {},
      Publishes,
      ProgressSchema
    > = FunctionCallOptions<Id, InputSchema, OutputSchema, {}, Publishes, ProgressSchema>,
  >(
    options: FunctionCallOptions<Id, InputSchema, OutputSchema, {}, Publishes, ProgressSchema> &
      Options &
      FunctionCallValidation<NoInfer<Options>, InferOutput<OutputSchema>> & {
        readonly dependencies?: never;
      },
  ): FunctionDescriptor<
    Id,
    InferOutput<InputSchema>,
    InferOutput<OutputSchema>,
    {},
    ErrorListOf<Options>,
    InputSchema,
    OutputSchema,
    ToolMetadataOf<Options>,
    Publishes,
    ProgressSchema
  >;

  /** Defines a function with declared dependencies.
   * @param options - Schemas, handler, dependency map, and function metadata.
   * @returns A callable descriptor whose context includes the declared dependencies.
   * @example const lookup = defineFunction({ input, output, dependencies, handler });
   */
  <
    const Id extends string,
    const InputSchema extends StandardSchemaV1,
    const OutputSchema extends StandardSchemaV1,
    const Dependencies extends FunctionDependencies,
    const ProgressSchema extends StandardSchemaV1 | undefined = undefined,
    const Publishes extends readonly Extract<keyof Relkit.EventRegistry, string>[] = readonly [],
    const Options extends FunctionCallOptions<
      Id,
      InputSchema,
      OutputSchema,
      Dependencies,
      Publishes,
      ProgressSchema
    > = FunctionCallOptions<Id, InputSchema, OutputSchema, Dependencies, Publishes, ProgressSchema>,
  >(
    options: FunctionCallOptions<
      Id,
      InputSchema,
      OutputSchema,
      Dependencies,
      Publishes,
      ProgressSchema
    > &
      Options &
      FunctionCallValidation<NoInfer<Options>, InferOutput<OutputSchema>>,
  ): FunctionDescriptor<
    Id,
    InferOutput<InputSchema>,
    InferOutput<OutputSchema>,
    Dependencies,
    ErrorListOf<Options>,
    InputSchema,
    OutputSchema,
    ToolMetadataOf<Options>,
    Publishes,
    ProgressSchema
  >;
}

/** Effect constructor with the same schema and handler inference as defineFunction. */
export interface DefineFunctionEffect {
  <
    const Id extends string,
    const InputSchema extends StandardSchemaV1,
    const OutputSchema extends StandardSchemaV1,
    const ProgressSchema extends StandardSchemaV1 | undefined = undefined,
    const Publishes extends readonly Extract<keyof Relkit.EventRegistry, string>[] = readonly [],
    const Options extends FunctionCallOptions<
      Id,
      InputSchema,
      OutputSchema,
      {},
      Publishes,
      ProgressSchema
    > = FunctionCallOptions<Id, InputSchema, OutputSchema, {}, Publishes, ProgressSchema>,
  >(
    options: FunctionCallOptions<Id, InputSchema, OutputSchema, {}, Publishes, ProgressSchema> &
      Options &
      FunctionCallValidation<NoInfer<Options>, InferOutput<OutputSchema>> & {
        readonly dependencies?: never;
      },
  ): Effect.Effect<
    FunctionDescriptor<
      Id,
      InferOutput<InputSchema>,
      InferOutput<OutputSchema>,
      {},
      ErrorListOf<Options>,
      InputSchema,
      OutputSchema,
      ToolMetadataOf<Options>,
      Publishes,
      ProgressSchema
    >,
    FunctionOperationError
  >;

  <
    const Id extends string,
    const InputSchema extends StandardSchemaV1,
    const OutputSchema extends StandardSchemaV1,
    const Dependencies extends FunctionDependencies,
    const ProgressSchema extends StandardSchemaV1 | undefined = undefined,
    const Publishes extends readonly Extract<keyof Relkit.EventRegistry, string>[] = readonly [],
    const Options extends FunctionCallOptions<
      Id,
      InputSchema,
      OutputSchema,
      Dependencies,
      Publishes,
      ProgressSchema
    > = FunctionCallOptions<Id, InputSchema, OutputSchema, Dependencies, Publishes, ProgressSchema>,
  >(
    options: FunctionCallOptions<
      Id,
      InputSchema,
      OutputSchema,
      Dependencies,
      Publishes,
      ProgressSchema
    > &
      Options &
      FunctionCallValidation<NoInfer<Options>, InferOutput<OutputSchema>>,
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
      Publishes,
      ProgressSchema
    >,
    FunctionOperationError
  >;
}
