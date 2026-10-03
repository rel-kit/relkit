import type { InferOutput, StandardSchemaV1 } from "@relkit/schema";
import type { ErrorDescriptorAny } from "./define-error.js";
import type { FunctionToolMetadata } from "./function-tool.js";
import type { FunctionHandlerValidation } from "./handler-result.js";
import type {
  DefineFunctionOptions,
  FunctionContext,
  FunctionDependencies,
  FunctionLifecycleHook,
} from "./types.js";

/** Infers schemas and context before validating the handler's inferred return type.
 * @internal
 */
export type FunctionCallOptions<
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

/** Rejects handler output or declared-error mismatches after contextual inference.
 * @internal
 */
export type FunctionCallValidation<
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

/** Retains the literal declared-error list, defaulting to no expected errors.
 * @internal
 */
export type ErrorListOf<Options> = Options extends {
  readonly errors: infer Errors extends readonly ErrorDescriptorAny[];
}
  ? Errors
  : readonly [];

/** Retains tool metadata only when the function options actually declare it.
 * @internal
 */
export type ToolMetadataOf<Options> = Options extends { readonly tool: infer Tool }
  ? Tool extends FunctionToolMetadata
    ? Tool
    : undefined
  : undefined;

/** Infers progress values while forbidding progress without an authored schema. */
type ProgressValue<Schema extends StandardSchemaV1 | undefined> = Schema extends StandardSchemaV1
  ? InferOutput<Schema>
  : never;
