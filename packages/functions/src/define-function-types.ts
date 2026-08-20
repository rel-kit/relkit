import type { InferOutput, StandardSchemaV1 } from "@zsys/schema";
import type { ErrorDescriptorAny } from "./define-error.js";
import type { FunctionHandlerValidation } from "./handler-result.js";
import type {
  DefineFunctionOptions,
  FunctionContext,
  FunctionDependencies,
  FunctionDescriptor,
  FunctionRequest,
} from "./types.js";

type FunctionCallOptions<
  Id extends string,
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  Dependencies extends FunctionDependencies,
> = Omit<
  DefineFunctionOptions<Id, InputSchema, OutputSchema, Dependencies, readonly ErrorDescriptorAny[]>,
  "handler"
> & {
  readonly handler: (
    input: InferOutput<InputSchema>,
    request: FunctionRequest,
    context: FunctionContext<Dependencies>,
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

export interface DefineFunction {
  <
    const Id extends string,
    const InputSchema extends StandardSchemaV1,
    const OutputSchema extends StandardSchemaV1,
    const Options extends FunctionCallOptions<Id, InputSchema, OutputSchema, {}>,
  >(
    options: FunctionCallOptions<Id, InputSchema, OutputSchema, {}> &
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
    OutputSchema
  >;

  <
    const Id extends string,
    const InputSchema extends StandardSchemaV1,
    const OutputSchema extends StandardSchemaV1,
    const Dependencies extends FunctionDependencies,
    const Options extends FunctionCallOptions<Id, InputSchema, OutputSchema, Dependencies>,
  >(
    options: FunctionCallOptions<Id, InputSchema, OutputSchema, Dependencies> &
      Options &
      FunctionCallValidation<NoInfer<Options>, InferOutput<OutputSchema>>,
  ): FunctionDescriptor<
    Id,
    InferOutput<InputSchema>,
    InferOutput<OutputSchema>,
    Dependencies,
    ErrorListOf<Options>,
    InputSchema,
    OutputSchema
  >;
}
