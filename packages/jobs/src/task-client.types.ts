import type { RunHandle } from "@relkit/contracts/jobs";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import type { ServerTriggerOptions } from "./trigger.types.js";

/** Caller input inferred from a task or job schema. */
export type InputOf<T> = T extends { readonly input: infer Schema }
  ? Schema extends StandardSchemaV1
    ? InferInput<Schema>
    : unknown
  : unknown;

/** Validated output inferred from a task or job schema. */
export type OutputOf<T> = T extends { readonly output: infer Schema }
  ? Schema extends StandardSchemaV1
    ? InferOutput<Schema>
    : unknown
  : unknown;

/** Typed trigger operation for one task reference. */
export type TaskClientFor<T> = {
  readonly trigger: (input: InputOf<T>, options?: ServerTriggerOptions) => Promise<RunHandle>;
};

/** Named task trigger clients mapped from declared dependencies. */
export type TaskClients<M> = {
  readonly [Name in keyof NonNullable<M> & string]: TaskClientFor<NonNullable<M>[Name]>;
};

type TaskJobClientFor<T> = {
  readonly trigger: (input: InputOf<T>, options?: ServerTriggerOptions) => Promise<RunHandle>;
};

/** Named job trigger clients mapped from declared dependencies. */
export type JobTriggerClients<M> = {
  readonly [Name in keyof NonNullable<M> & string]: TaskJobClientFor<NonNullable<M>[Name]>;
};
