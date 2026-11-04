import type { MaybePromise } from "../contracts/index.js";
import type { FunctionContext, FunctionDependencies } from "./function-context.types.js";
import type { InferOutput, StandardSchemaV1 } from "../schema/index.js";


/** Validated progress value inferred from an optional schema.
 * @example type Progress = ProgressValue<typeof progressSchema>;
 */
export type ProgressValue<Schema extends StandardSchemaV1 | undefined> =
  Schema extends StandardSchemaV1 ? InferOutput<Schema> : never;

/** Hook called before or after a function invocation.
 * @param value - Current validated input or output value.
 * @param context - Invocation context and declared dependencies.
 * @returns Transformed value, synchronously or asynchronously.
 * @example const hook: FunctionLifecycleHook<Input, {}, []> = (value) => value;
 */
export type FunctionLifecycleHook<
  Value,
  Dependencies extends FunctionDependencies = {},
  ProgressSchema extends StandardSchemaV1 | undefined = undefined,
> = (
  value: Value,
  context: FunctionContext<Dependencies, ProgressValue<ProgressSchema>>,
) => MaybePromise<Value>;
