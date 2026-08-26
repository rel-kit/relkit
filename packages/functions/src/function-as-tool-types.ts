import type { ErrorDescriptorAny } from "./define-error.js";
import type {
  FunctionToolDescriptor,
  FunctionToolMetadata,
  FunctionToolOptions,
} from "./function-tool.js";
import type { FunctionRef } from "./types.js";
import type { StandardSchemaV1 } from "@zsys/schema";

type FunctionToolTarget<
  Id extends string,
  Input,
  Output,
  Errors extends readonly ErrorDescriptorAny[],
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
> = FunctionRef<Id, Input, Output, Errors, InputSchema, OutputSchema>;

type FunctionToolView<
  ToolId extends string,
  FunctionId extends string,
  Input,
  Output,
  Errors extends readonly ErrorDescriptorAny[],
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
> = FunctionToolDescriptor<
  ToolId,
  FunctionToolTarget<FunctionId, Input, Output, Errors, InputSchema, OutputSchema>
>;

export type FunctionAsTool<
  FunctionId extends string,
  Input,
  Output,
  Errors extends readonly ErrorDescriptorAny[],
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  ToolMetadata extends FunctionToolMetadata | undefined,
> = {
  <const ToolId extends string>(
    options: FunctionToolOptions<ToolId, Input, Output> & { readonly id: ToolId },
  ): FunctionToolView<ToolId, FunctionId, Input, Output, Errors, InputSchema, OutputSchema>;
  (
    options: FunctionToolOptions<string, Input, Output>,
  ): FunctionToolView<
    `${FunctionId}.tool`,
    FunctionId,
    Input,
    Output,
    Errors,
    InputSchema,
    OutputSchema
  >;
} & ([ToolMetadata] extends [FunctionToolMetadata]
  ? {
      (): FunctionToolView<
        `${FunctionId}.tool`,
        FunctionId,
        Input,
        Output,
        Errors,
        InputSchema,
        OutputSchema
      >;
    }
  : {});
