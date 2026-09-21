import type { MaybePromise } from "@relkit/contracts";
import type { FunctionContext, FunctionDependencies } from "./function-descriptor-types.js";
import type { InferOutput, StandardSchemaV1 } from "@relkit/schema";

type KnownEventName = Extract<keyof Relkit.EventRegistry, string>;

export type ProgressValue<Schema extends StandardSchemaV1 | undefined> =
  Schema extends StandardSchemaV1 ? InferOutput<Schema> : never;

export type FunctionLifecycleHook<
  Value,
  Dependencies extends FunctionDependencies = {},
  Publishes extends readonly KnownEventName[] = readonly [],
  ProgressSchema extends StandardSchemaV1 | undefined = undefined,
> = (
  value: Value,
  context: FunctionContext<Dependencies, Publishes, ProgressValue<ProgressSchema>>,
) => MaybePromise<Value>;
