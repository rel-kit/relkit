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
import type { ErrorDescriptorAny } from "./define-error.js";
import type { FunctionOperationError } from "./function-observability.js";
import type { FunctionToolMetadata } from "./function-tool.js";
import type { FunctionHandlerValidation } from "./handler-result.js";
import type {
  DefineFunctionOptions,
  FunctionContext,
  FunctionDependencies,
  FunctionDescriptor,
  FunctionLifecycleHook,
} from "./types.js";

type FunctionCallOptions<
  Id extends string,
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  Dependencies extends FunctionDependencies,
  Publishes extends readonly Extract<keyof Relkit.EventRegistry, string>[],
  ProgressSchema extends StandardSchemaV1 | undefined,
> = Omit<
  DefineFunctionOptions<
    Id,
    InputSchema,
    OutputSchema,
    Dependencies,
    readonly ErrorDescriptorAny[],
    Publishes,
    ProgressSchema
  >,
  "handler" | "onBefore" | "onAfter"
> & {
  readonly onBefore?: FunctionLifecycleHook<
    InferOutput<InputSchema>,
    Dependencies,
    Publishes,
    ProgressSchema
  >;
  readonly onAfter?: FunctionLifecycleHook<
    InferOutput<OutputSchema>,
    Dependencies,
    Publishes,
    ProgressSchema
  >;
  readonly handler: (
    input: InferOutput<InputSchema>,
    context: FunctionContext<Dependencies, Publishes, ProgressValue<ProgressSchema>>,
  ) => unknown;
};

type FunctionCallValidation<
  Options extends { readonly handler: (...args: never[]) => unknown },
  Output,
> =
  FunctionHandlerValidation<
    Awaited<ReturnType<Options["handler"]>>,
    Output,
    ErrorListOf<Options>
  > extends infer Validation
    ? keyof Validation extends never
      ? {}
      : { readonly handler: Validation }
    : never;

type ErrorListOf<Options> = Options extends {
  readonly errors: infer Errors extends readonly ErrorDescriptorAny[];
}
  ? Errors
  : readonly [];

type ToolMetadataOf<Options> = Options extends { readonly tool: infer Tool }
  ? Tool extends FunctionToolMetadata
    ? Tool
    : undefined
  : undefined;

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

type ProgressValue<Schema extends StandardSchemaV1 | undefined> = Schema extends StandardSchemaV1
  ? InferOutput<Schema>
  : never;
