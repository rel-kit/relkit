import type { ErrorDescriptorAny } from "./define-error.js";
import type {
  FunctionToolDescriptor,
  FunctionToolMetadata,
  FunctionToolOptions,
} from "./function-tool.js";
import type { FunctionRef } from "./types.js";
import type { StandardSchemaV1 } from "@relkit/schema";

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

/** Overloads for deriving a tool from a callable function.
 * @example const tool = fn.asTool({ description: "Lookup", sideEffect: "read", approval: "never" });
 */
export type FunctionAsTool<
  FunctionId extends string,
  Input,
  Output,
  Errors extends readonly ErrorDescriptorAny[],
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
  ToolMetadata extends FunctionToolMetadata | undefined,
> = {
  /** Creates a tool with an explicit ID and metadata.
   * @param options - Tool identity and behavior metadata.
   * @returns Frozen tool descriptor.
   * @example fn.asTool({ id: "lookup", description: "Lookup", sideEffect: "read", approval: "never" });
   */
  <const ToolId extends string>(
    options: FunctionToolOptions<ToolId, Input, Output> & { readonly id: ToolId },
  ): FunctionToolView<ToolId, FunctionId, Input, Output, Errors, InputSchema, OutputSchema>;
  /** Creates a tool with a derived ID.
   * @param options - Tool behavior metadata.
   * @returns Frozen tool descriptor.
   * @example fn.asTool({ description: "Lookup", sideEffect: "read", approval: "never" });
   */
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
      /** Uses metadata declared on the function.
       * @returns Frozen tool descriptor.
       * @example fn.asTool();
       */
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
