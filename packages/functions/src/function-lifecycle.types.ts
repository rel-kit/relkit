import type { MaybePromise } from "@relkit/contracts";
import type { FunctionContext, FunctionDependencies } from "./function-context.types.js";
import type { InferOutput, StandardSchemaV1 } from "@relkit/schema";

type KnownEventName = Extract<keyof Relkit.EventRegistry, string>;

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
  Publishes extends readonly KnownEventName[] = readonly [],
  ProgressSchema extends StandardSchemaV1 | undefined = undefined,
> = (
  value: Value,
  context: FunctionContext<Dependencies, Publishes, ProgressValue<ProgressSchema>>,
) => MaybePromise<Value>;
