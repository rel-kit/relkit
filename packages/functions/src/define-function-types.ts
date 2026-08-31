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
> = Omit<
  DefineFunctionOptions<
    Id,
    InputSchema,
    OutputSchema,
    Dependencies,
    readonly ErrorDescriptorAny[],
    Publishes
  >,
  "handler" | "onBefore" | "onAfter"
> & {
  readonly onBefore?: FunctionLifecycleHook<InferOutput<InputSchema>, Dependencies, Publishes>;
  readonly onAfter?: FunctionLifecycleHook<InferOutput<OutputSchema>, Dependencies, Publishes>;
  readonly handler: (
    input: InferOutput<InputSchema>,
    context: FunctionContext<Dependencies, Publishes>,
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
    const Publishes extends readonly Extract<keyof Relkit.EventRegistry, string>[] = readonly [],
    const Options extends FunctionCallOptions<Id, InputSchema, OutputSchema, {}, Publishes> =
      FunctionCallOptions<Id, InputSchema, OutputSchema, {}, Publishes>,
  >(
    options: FunctionCallOptions<Id, InputSchema, OutputSchema, {}, Publishes> &
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
    Publishes
  >;

  <
    const Id extends string,
    const InputSchema extends StandardSchemaV1,
    const OutputSchema extends StandardSchemaV1,
    const Dependencies extends FunctionDependencies,
    const Publishes extends readonly Extract<keyof Relkit.EventRegistry, string>[] = readonly [],
    const Options extends FunctionCallOptions<
      Id,
      InputSchema,
      OutputSchema,
      Dependencies,
      Publishes
    > = FunctionCallOptions<Id, InputSchema, OutputSchema, Dependencies, Publishes>,
  >(
    options: FunctionCallOptions<Id, InputSchema, OutputSchema, Dependencies, Publishes> &
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
    Publishes
  >;
}
