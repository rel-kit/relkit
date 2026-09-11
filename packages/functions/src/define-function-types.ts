import type { InferOutput, StandardSchemaV1 } from "@relkit/schema";
import type { ErrorDescriptorAny } from "./define-error.js";
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

export interface DefineFunction {
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

type ProgressValue<Schema extends StandardSchemaV1 | undefined> = Schema extends StandardSchemaV1
  ? InferOutput<Schema>
  : never;
